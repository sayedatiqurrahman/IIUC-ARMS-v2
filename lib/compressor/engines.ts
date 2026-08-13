'use client';

// Format-specific compression engines for the Studio File Compressor and the
// upload pipeline. Everything here is pure client-side and works inside a Web
// Worker (it uses OffscreenCanvas + createImageBitmap, with an HTMLCanvas
// fallback for browsers without OffscreenCanvas). The contract is strict:
// every function returns a SMALLER File or null — it never upsizes or mutates
// the original, so callers can always fall back to the source file.

import { encodeJpeg, encodePng, decodePng, type RawImage } from '../jsquash';

export type CompressMode = 'recommended' | 'strong' | 'maximum';

// One quality / resolution target per mode. Opaque photos go through MozJPEG
// (and WebP/AVIF candidates); transparent images stay lossless (PNG/WebP).
export const MODE_OPTS: Record<CompressMode, { quality: number; maxDim: number }> = {
  recommended: { quality: 0.82, maxDim: 2400 },
  strong: { quality: 0.68, maxDim: 1800 },
  maximum: { quality: 0.5, maxDim: 1300 },
};

export const ARCHIVE_RE = /\.(docx|docm|pptx|pptm|xlsx|xlsm|epub|odt|ods|odp|zip|cbz)$/i;
const IMAGE_RE = /\.(jpe?g|png|webp|gif|bmp|tiff?)$/i;

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function get2d(canvas: AnyCanvas): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  return canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
}

async function canvasToBytes(canvas: AnyCanvas, type: string, quality: number): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    if (typeof (canvas as OffscreenCanvas).convertToBlob === 'function') {
      const blob = await (canvas as OffscreenCanvas).convertToBlob({ type, quality });
      return new Uint8Array(await blob.arrayBuffer());
    }
    const blob = await new Promise<Blob | null>((resolve) =>
      (canvas as HTMLCanvasElement).toBlob(resolve, type, quality),
    );
    if (!blob) return null;
    return new Uint8Array(await blob.arrayBuffer());
  } catch {
    return null;
  }
}

// Decode a Blob/File into RGBA pixels, downscaled to `maxDim` on the long side.
// Returns the pixel buffer and whether it carries any transparency.
async function decodeToRGBA(blob: Blob, maxDim: number): Promise<{ raw: RawImage; hasAlpha: boolean }> {
  let bmp: ImageBitmap;
  if (typeof createImageBitmap === 'function') {
    bmp = await createImageBitmap(blob);
  } else {
    bmp = await new Promise<ImageBitmap>((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img as unknown as ImageBitmap);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('decode failed'));
      };
      img.src = url;
    });
  }

  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));

  const canvas = makeCanvas(w, h);
  const ctx = get2d(canvas);
  ctx.imageSmoothingEnabled = true;
  (ctx as CanvasRenderingContext2D).imageSmoothingQuality = 'high';
  ctx.drawImage(bmp as CanvasImageSource, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  bmp.close?.();

  const data = imgData.data as Uint8ClampedArray<ArrayBuffer>;
  let hasAlpha = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) {
      hasAlpha = true;
      break;
    }
  }
  return { raw: { data, width: w, height: h }, hasAlpha };
}

interface Candidate {
  bytes: Uint8Array<ArrayBuffer>;
  ext: string;
  type: string;
}

// Compress a single image file. Picks the smallest format that actually beats
// the original, and never returns a larger file.
export async function compressImageFile(file: File, mode: CompressMode): Promise<File | null> {
  const { quality, maxDim } = MODE_OPTS[mode];
  const lower = file.name.toLowerCase();
  if (!IMAGE_RE.test(lower)) return null;

  const { raw, hasAlpha } = await decodeToRGBA(file, maxDim);
  const baseName = lower.replace(/\.[^.]+$/, '');
  const cands: Candidate[] = [];

  const pushBest = (bytes: Uint8Array<ArrayBuffer> | null, ext: string, type: string) => {
    if (bytes && bytes.length > 0) cands.push({ bytes, ext, type });
  };

  if (hasAlpha) {
    // Preserve transparency: lossless PNG + WebP. Never flatten to JPEG.
    try {
      pushBest(await encodePng(raw), '.png', 'image/png');
    } catch {}
    pushBest(await canvasToBytes(putRawCanvas(raw), 'image/webp', Math.min(1, quality + 0.06)), '.webp', 'image/webp');
  } else {
    try {
      pushBest(await encodeJpeg(raw, quality), '.jpg', 'image/jpeg');
    } catch {}
    pushBest(await canvasToBytes(putRawCanvas(raw), 'image/webp', quality), '.webp', 'image/webp');
    pushBest(await canvasToBytes(putRawCanvas(raw), 'image/avif', Math.max(0.3, quality - 0.05)), '.avif', 'image/avif');
  }

  if (!cands.length) return null;
  cands.sort((a, b) => a.bytes.length - b.bytes.length);
  const best = cands.find((c) => c.bytes.length < file.size);
  if (!best) return null;
  return new File([best.bytes], `${baseName}${best.ext}`, { type: best.type });
}

// Build an OffscreenCanvas/HTMLCanvas pre-painted with the raw RGBA pixels.
function putRawCanvas(raw: RawImage): AnyCanvas {
  const canvas = makeCanvas(raw.width, raw.height);
  const ctx = get2d(canvas);
  ctx.putImageData(new ImageData(raw.data, raw.width, raw.height), 0, 0);
  return canvas;
}

// Re-compress a ZIP-based container (DOCX / PPTX / XLSX / EPUB / ODF / ZIP / CBZ)
// two ways: a lossless DEFLATE re-zip (always safe), plus re-encoding any
// embedded raster images via the same image engine so the media inside shrinks
// too. The result is only kept when it is genuinely smaller.
export async function optimizeArchive(file: File, mode: CompressMode): Promise<File | null> {
  if (!ARCHIVE_RE.test(file.name)) return null;
  const { unzipSync, zipSync } = await import('fflate');
  const buf = new Uint8Array(await file.arrayBuffer());
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(buf);
  } catch {
    return null;
  }

  const { quality, maxDim } = MODE_OPTS[mode];
  let mediaChanged = false;
  for (const [name, data] of Object.entries(files)) {
    const ln = name.toLowerCase();
    if (!/\.(jpe?g|png|webp)$/i.test(ln) || data.length < 4 * 1024) continue;
    try {
      const copy = new Uint8Array(data.byteLength);
      copy.set(data);
      const raw = /\.png$/i.test(ln) ? await decodePng(data) : (await decodeToRGBA(new Blob([copy]), maxDim)).raw;
      const out = /\.png$/i.test(ln) ? await encodePng(raw) : await encodeJpeg(raw, quality);
      if (out && out.length < data.length - 64) {
        files[name] = out;
        mediaChanged = true;
      }
    } catch {}
  }

  const rezipped = zipSync(files, { level: 9 });
  if (!mediaChanged && rezipped.length >= buf.length) return null;
  if (rezipped.length >= buf.length) return null;
  const outBytes = new Uint8Array(rezipped.byteLength);
  outBytes.set(rezipped);
  return new File([outBytes], file.name, { type: file.type || 'application/octet-stream' });
}

export function isImageFile(name: string): boolean {
  return IMAGE_RE.test(name);
}

export function isArchiveFile(name: string): boolean {
  return ARCHIVE_RE.test(name);
}
