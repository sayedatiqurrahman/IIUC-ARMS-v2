'use client';

export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Read an image file and downscale it so uploaded signatures/logos stay small.
export async function downscaleImage(file: File, maxW: number, maxH: number): Promise<string> {
  const raw = await readAsDataUrl(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Could not read image'));
    el.src = raw;
  });
  const w0 = img.naturalWidth || maxW;
  const h0 = img.naturalHeight || maxH;
  const scale = Math.min(1, maxW / w0, maxH / h0);
  const width = Math.max(1, Math.round(w0 * scale));
  const height = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return raw;
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/png');
}
