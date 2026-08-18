'use client';

import { encodeJpeg, decodeJpeg, type RawImage } from './jsquash';

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

export function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function uint8ToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    for (let j = 0; j < slice.length; j++) binary += String.fromCharCode(slice[j]);
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

// ---------------------------------------------------------------------------
// PDF compression — keep text/vectors, recompress embedded raster images
// ---------------------------------------------------------------------------

async function reencodeJpeg(bytes: Uint8Array, quality: number, maxDim: number): Promise<{ data: Uint8Array; w: number; h: number } | null> {
  try {
    const dec = await decodeJpeg(bytes);
    const scale = Math.min(1, maxDim / Math.max(dec.width, dec.height));
    const w = Math.max(1, Math.round(dec.width * scale));
    const h = Math.max(1, Math.round(dec.height * scale));
    const data = scale < 1 ? resizeRGBA(dec, w, h).data : dec.data;
    const out = await encodeJpeg({ data, width: w, height: h }, quality);
    return { data: out, w, h };
  } catch {
    return null;
  }
}

function resizeRGBA(src: RawImage, w: number, h: number): RawImage {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const cx = c.getContext('2d')!;
  cx.putImageData(new ImageData(src.data, src.width, src.height), 0, 0);
  const c2 = document.createElement('canvas');
  c2.width = w;
  c2.height = h;
  const cx2 = c2.getContext('2d')!;
  cx2.imageSmoothingEnabled = true;
  cx2.imageSmoothingQuality = 'high';
  cx2.drawImage(c, 0, 0, w, h);
  return { data: cx2.getImageData(0, 0, w, h).data as Uint8ClampedArray<ArrayBuffer>, width: w, height: h };
}

export async function optimizePdf(
  file: File,
  opts: { quality?: number; maxDim?: number } = {},
): Promise<File | null> {
  const quality = opts.quality ?? 0.7;
  const maxDim = opts.maxDim ?? 1600;
  const name = file.name.toLowerCase();
  if (!/\.pdf$/i.test(name)) return null;

  let pdfDoc: any;
  try {
    const pdflib: any = await import('pdf-lib');
    const { PDFDocument, PDFName, PDFDict, PDFNumber, PDFRef } = pdflib;
    pdfDoc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
    const ctx = pdfDoc.context;
    const pages = pdfDoc.getPages();

    let foundImage = false;
    let modified = false;

    for (const page of pages) {
      const res = page.node.Resources ? page.node.Resources() : null;
      if (!res) continue;
      const xobj = res.lookup(PDFName.of('XObject'), PDFDict);
      if (!xobj) continue;
      for (const [, ref] of xobj.entries()) {
        const obj: any = ref instanceof PDFRef ? ctx.lookup(ref) : ref;
        if (!obj || !obj.dict) continue;
        const sub = obj.dict.lookup(PDFName.of('Subtype'));
        if (!sub || sub !== PDFName.of('Image')) continue;
        if (obj.dict.lookup(PDFName.of('ImageMask'))) continue;
        if (obj.dict.lookup(PDFName.of('SMask'))) continue;
        foundImage = true;

        const filter = obj.dict.lookup(PDFName.of('Filter'));
        const isDCT =
          String(filter) === '/DCTDecode' ||
          (filter && typeof filter.asArray === 'function' &&
            (filter.asArray() as any[]).some((f: any) => String(f) === '/DCTDecode'));
        if (!isDCT || !obj.contents) continue;

        const r = await reencodeJpeg(obj.contents as Uint8Array, quality, maxDim);
        if (!r) continue;

        obj.contents = r.data;
        obj.dict.set(PDFName.of('Width'), PDFNumber.of(r.w));
        obj.dict.set(PDFName.of('Height'), PDFNumber.of(r.h));
        obj.dict.set(PDFName.of('Length'), PDFNumber.of(r.data.length));
        obj.dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
        modified = true;
      }
    }

    if (!foundImage || !modified) return null;

    const out = await pdfDoc.save();
    if (out.length >= file.size) return null;
    const baseName = file.name.replace(/\.pdf$/i, '');
    return new File([out], `${baseName}_optimized.pdf`, { type: 'application/pdf' });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Full PDF compression — re-render pages to downscaled JPEG via jsPDF
// ---------------------------------------------------------------------------

export async function compressPdf(
  file: File,
  opts: { qualities?: number[]; maxWidth?: number } = {},
): Promise<File | null> {
  const maxWidth = opts.maxWidth ?? 1500;
  const qualities = opts.qualities ?? [0.78, 0.6];
  const name = file.name.toLowerCase();
  if (!/\.pdf$/i.test(name)) return null;

  let pdf: any;
  try {
    const pdfjs: any = await import(/* webpackIgnore: true */ '/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
    pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  } catch {
    return null;
  }

  try {
    const canvases: HTMLCanvasElement[] = [];
    const dims: { w: number; h: number }[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 1 });
      const scale = Math.min(1, maxWidth / vp.width);
      const w = Math.max(1, Math.round(vp.width * scale));
      const h = Math.max(1, Math.round(vp.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale }) }).promise;
      canvases.push(canvas);
      dims.push({ w, h });
    }

    const { jsPDF } = await import('jspdf');
    let bestBlob: Blob | null = null;
    for (const q of qualities) {
      const imgs = await Promise.all(
        canvases.map(async c => {
          const raw: RawImage = { data: c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data as Uint8ClampedArray<ArrayBuffer>, width: c.width, height: c.height };
          const bytes = await encodeJpeg(raw, q);
          return uint8ToDataUrl(bytes, 'image/jpeg');
        }),
      );
      const firstOrient = dims[0].w >= dims[0].h ? 'landscape' : 'portrait';
      const doc: any = new jsPDF({ orientation: firstOrient, unit: 'px', format: [dims[0].w, dims[0].h] });
      for (let i = 0; i < imgs.length; i++) {
        if (i > 0) doc.addPage([dims[i].w, dims[i].h], dims[i].w >= dims[i].h ? 'landscape' : 'portrait');
        doc.addImage(imgs[i], 'JPEG', 0, 0, dims[i].w, dims[i].h);
      }
      const blob = doc.output('blob') as Blob;
      if (!bestBlob || blob.size < bestBlob.size) bestBlob = blob;
    }

    if (!bestBlob || bestBlob.size >= file.size) return null;
    const baseName = file.name.replace(/\.pdf$/i, '');
    return new File([bestBlob], `${baseName}_compressed.pdf`, { type: 'application/pdf' });
  } catch {
    return null;
  } finally {
    try { pdf.destroy?.(); } catch {}
  }
}
