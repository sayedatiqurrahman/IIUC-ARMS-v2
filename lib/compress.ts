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

  try {
    if (isImageName(name)) {
      const c = await compressImage(file, imageOptsFor(original));
      return { file: c, saved: Math.max(0, original - c.size) };
    }

    // Tiny PDFs rasterize in ~seconds for <100KB of savings — not worth it.
    if (name.endsWith('.pdf') && original > 800 * 1024 && original <= 30 * 1024 * 1024) {
      const c = await compressPdf(file);
      if (c) return { file: c, saved: Math.max(0, original - c.size) };
    }

    if (
      (name.endsWith('.docx') || name.endsWith('.pptx') || name.endsWith('.epub')) &&
      original <= 25 * 1024 * 1024
    ) {
      const c = await rezipContainer(file);
      if (c) return { file: c, saved: Math.max(0, original - c.size) };
    }
  } catch {}

  return { file, saved: 0 };
}

// Bigger images get a harsher re-encode so a 5MB photo still lands well under
// its original size, while small images stay near-lossless.
function imageOptsFor(size: number) {
  if (size > 4 * 1024 * 1024) return { quality: 0.72, maxDim: 1800 };
  if (size > 2 * 1024 * 1024) return { quality: 0.8, maxDim: 2000 };
  return { quality: 0.85, maxDim: 2200 };
}

// Rebuild a PDF page-by-page as JPEGs. Uses the already-served pdf.js build from
// /pdfjs (no new dependency). Rasterizing is great for SCANNED/photo PDFs (the
// common case for exam questions & notes) — they lose 40-70% and look identical
// on screen. For text/vector PDFs the estimate after page 1 bails out early so
// we never waste time rasterizing a file that can't shrink. The result is only
// kept when it is genuinely smaller (quality can't get worse than the original).
async function compressPdf(file: File): Promise<File | null> {
  const pdfjs: any = await import(/* webpackIgnore: true */ '/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';

  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  if (!pdf.numPages || pdf.numPages > 80) return null;

  const { jsPDF } = await import('jspdf');
  const out = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = out.internal.pageSize.getWidth();
  const pageH = out.internal.pageSize.getHeight();

  let firstPageBytes = 0;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.25 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

    if (i === 1) {
      firstPageBytes = Math.ceil(dataUrl.length * 0.75); // base64 → raw bytes
      // If even the estimate of every page at this density can't beat the
      // original by ~15%, this is a text/vector PDF — bail before doing any more.
      if (firstPageBytes * pdf.numPages * 0.85 >= file.size) return null;
    }

    if (i > 1) out.addPage();
    out.addImage(dataUrl, 'JPEG', 0, 0, pageW, pageH, undefined, 'FAST');
    await new Promise(r => setTimeout(r, 0)); // yield so the UI stays responsive
  }

  const blob = out.output('blob');
  if (blob.size >= file.size) return null;
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
