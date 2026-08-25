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
// PDF compression stub — pdf.js was removed for lightweight viewing.
// optimizePdf (pdf-lib) still works for in-place JPEG recompression.
// ---------------------------------------------------------------------------

export async function compressPdf(
  _file: File,
  _opts: { qualities?: number[]; maxWidth?: number } = {},
): Promise<File | null> {
  return null;
}
