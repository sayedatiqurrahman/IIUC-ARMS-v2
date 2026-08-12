'use client';

import { compressImage } from '@/lib/image-utils';
import { unzipSync, zipSync } from 'fflate';

export interface CompressResult {
  file: File;
  saved: number; // bytes saved vs the original (0 when untouched)
}

function isImageName(name: string): boolean {
  return /\.(jpe?g|png|webp|gif)$/i.test(name);
}

// Best-effort client-side compression before upload. Images are re-encoded via
// canvas (quality/scale scale down as the file grows); PDFs are rasterized and
// rebuilt (this is what actually shrinks scanned/photo PDFs); DOCX/PPTX/EPUB
// containers are losslessly re-compressed. Everything compresses — even small
// files — so upload payloads stay lean. Anything that fails or doesn't get
// smaller is returned as-is (never upsized).
export async function compressUploadFile(file: File): Promise<CompressResult> {
  const name = file.name.toLowerCase();
  const original = file.size;

  // Compression is strictly best-effort: if any path stalls (pdf.js worker
  // startup, an oversized scan, a slow sync rezip) we must never leave the UI
  // stuck on "Compressing…" — the original file is returned after the cap so
  // the upload always proceeds.
  const capped = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
    Promise.race([p, new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms))]);

  try {
    if (isImageName(name)) {
      const c = await capped(compressImage(file, imageOptsFor(original)), 15000, file);
      return { file: c, saved: Math.max(0, original - c.size) };
    }

    // Tiny PDFs rasterize in ~seconds for <100KB of savings — not worth it.
    if (name.endsWith('.pdf') && original > 800 * 1024 && original <= 30 * 1024 * 1024) {
      const c = await capped(compressPdf(file), 40000, null);
      if (c) return { file: c, saved: Math.max(0, original - c.size) };
    }

    if (
      (name.endsWith('.docx') || name.endsWith('.pptx') || name.endsWith('.epub')) &&
      original <= 25 * 1024 * 1024
    ) {
      const c = await capped(rezipContainer(file), 10000, null);
      if (c) return { file: c, saved: Math.max(0, original - c.size) };
    }
  } catch {}

  return { file, saved: 0 };
}

// Bigger images get a harsher re-encode so a 5MB photo still lands well under
// its original size, while small images stay near-lossless. Kept generous so
// lecture notes / handwritten pages stay readable on screen.
function imageOptsFor(size: number) {
  if (size > 4 * 1024 * 1024) return { quality: 0.78, maxDim: 2000 };
  if (size > 2 * 1024 * 1024) return { quality: 0.85, maxDim: 2200 };
  return { quality: 0.9, maxDim: 2400 };
}

// Rebuild a PDF page-by-page. Used ONLY for scanned/photo PDFs (the common case
// for exam questions & notes) where they lose 40-70% and still look sharp.
// PDFs with real text content are left untouched — rasterizing them would wreck
// their crispness. Raster output is supersampled (scale-capped so page canvases
// stay bounded) and re-encoded at high JPEG quality, preserving each page's
// original aspect ratio instead of forcing A4. The result is only kept when it
// is genuinely smaller (never upsized).
async function compressPdf(file: File): Promise<File | null> {
  const pdfjs: any = await import(/* webpackIgnore: true */ '/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';

  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  if (!pdf.numPages || pdf.numPages > 80) return null;

  // Text/vector PDFs stay lossless: if page 1 has real text we bail immediately
  // instead of rasterizing.
  try {
    const t = await (await pdf.getPage(1)).getTextContent();
    if (t.items && t.items.length >= 5) return null;
  } catch {}

  const { jsPDF } = await import('jspdf');
  const JPEG_Q = 0.9;
  // Supersample to keep raster text/images sharp, but cap the render so a
  // huge scan page never turns into a GPU-swallowing canvas (e.g. a 4000px
  // page at 2x would be 8000px wide). The cap keeps per-page canvases at
  // ~2x the max side up to 2400px — a good sharpness/effort balance.
  const renderScaleFor = (maxDim: number) => Math.min(2, 2400 / maxDim);

  const pageSize = (vpW: number, vpH: number) => {
    const A4W = 210, A4H = 297;
    const scale = Math.min(A4W / vpW, A4H / vpH);
    return { w: +(vpW * scale).toFixed(1), h: +(vpH * scale).toFixed(1) };
  };

  // jsPDF swaps page dimensions to match the orientation param, so landscape
  // pages must be declared landscape or they get forced portrait (squished).
  const orientationFor = (w: number, h: number) => (w >= h ? 'landscape' : 'portrait') as 'portrait' | 'landscape';

  const firstPage = await pdf.getPage(1);
  const firstVp = firstPage.getViewport({ scale: 1 });
  const firstSize = pageSize(firstVp.width, firstVp.height);
  const out = new jsPDF({ orientation: orientationFor(firstSize.w, firstSize.h), unit: 'mm', format: [firstSize.w, firstSize.h] });

  let firstPageBytes = 0;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const vp1 = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: renderScaleFor(Math.max(vp1.width, vp1.height)) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_Q);

    if (i === 1) {
      firstPageBytes = Math.ceil(dataUrl.length * 0.75); // base64 → raw bytes
      // If even the estimate of every page at this density can't beat the
      // original by ~15%, this is mostly a vector/outline PDF — bail early.
      if (firstPageBytes * pdf.numPages * 0.85 >= file.size) return null;
    }

    if (i > 1) {
      const s = pageSize(vp1.width, vp1.height);
      out.addPage([s.w, s.h], orientationFor(s.w, s.h));
    }
    out.addImage(dataUrl, 'JPEG', 0, 0, out.internal.pageSize.getWidth(), out.internal.pageSize.getHeight(), undefined, 'MEDIUM');
    await new Promise(r => setTimeout(r, 0)); // yield so the UI stays responsive
  }

  const blob = out.output('blob');
  if (blob.size >= file.size) return null;
  if (blob.size < 1024) return null;

  // Gate: the rebuilt PDF must re-parse cleanly with the same page count as the
  // original. If it fails to load, has no pages, or lost/gained pages, we keep
  // the original untouched — compression must never harm the file.
  try {
    const check = await pdfjs.getDocument({ data: await blob.arrayBuffer() }).promise;
    if (!check.numPages || check.numPages !== pdf.numPages) return null;
  } catch {
    return null;
  }

  return new File([blob], file.name, { type: 'application/pdf' });
}

// Lossless re-compression of ZIP-based containers (DOCX/PPTX/EPUB). They are
// already deflated so gains are modest, but it never damages the document.
async function rezipContainer(file: File): Promise<File | null> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(buf);
  } catch {
    return null;
  }
  const rezipped = zipSync(unzipped, { level: 9 });
  if (rezipped.length >= buf.length) return null;
  return new File([rezipped], file.name, { type: file.type });
}
