export type Drawable = { ctx: CanvasRenderingContext2D };

// Draw an image into a target rect on a canvas, preserving aspect ratio,
// centered, with optional opacity. No-op in non-browser environments.
export async function drawCtx(
  ctx: CanvasRenderingContext2D,
  url: string,
  x: number,
  y: number,
  boxW: number,
  boxH: number,
  opacity = 1,
): Promise<void> {
  if (typeof document === 'undefined') return;
  const img = await loadImg(url);
  if (!img) return;

  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;

  // Fit the image inside the box, preserving aspect ratio.
  const scale = Math.min(boxW / iw, boxH / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = x + (boxW - dw) / 2;
  const dy = y + (boxH - dh) / 2;

  ctx.save();
  if (opacity >= 0) ctx.globalAlpha = Math.min(1, Math.max(0, opacity));
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

function loadImg(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
