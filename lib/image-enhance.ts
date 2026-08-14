// Canvas-based post-capture filters for the document scanner.
// The scanner SDK only returns a perspective-cropped colour image; these
// filters make scanned text — especially small print — crisp and readable.

export type FilterMode = 'original' | 'bw' | 'document' | 'enhance' | 'balance';

export const FILTER_LABELS: Record<FilterMode, string> = {
  original: 'Original',
  bw: 'B&W',
  document: 'Doc',
  enhance: 'Enhance',
  balance: 'Balance',
};

export const FILTER_HINTS: Record<FilterMode, string> = {
  original: 'Raw cropped image',
  bw: 'Black & white — best for small text',
  document: 'Crisp black text on white — typed-document look',
  enhance: 'Sharpened + high contrast',
  balance: 'Auto colour / brightness fix',
};

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

function toGray(d: Uint8ClampedArray) {
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
}

function adjustContrast(d: Uint8ClampedArray, f: number) {
  const c = 128 * (1 - f);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = clamp(d[i] * f + c);
    d[i + 1] = clamp(d[i + 1] * f + c);
    d[i + 2] = clamp(d[i + 2] * f + c);
  }
}

function adjustBrightness(d: Uint8ClampedArray, amt: number) {
  for (let i = 0; i < d.length; i += 4) {
    d[i] = clamp(d[i] + amt);
    d[i + 1] = clamp(d[i + 1] + amt);
    d[i + 2] = clamp(d[i + 2] + amt);
  }
}

function autoWhiteBalance(d: Uint8ClampedArray) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    r += d[i];
    g += d[i + 1];
    b += d[i + 2];
    n++;
  }
  r /= n;
  g /= n;
  b /= n;
  const avg = (r + g + b) / 3;
  const kr = avg / (r || 1);
  const kg = avg / (g || 1);
  const kb = avg / (b || 1);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = clamp(d[i] * kr);
    d[i + 1] = clamp(d[i + 1] * kg);
    d[i + 2] = clamp(d[i + 2] * kb);
  }
}

// Separable box blur on a luminance buffer (radius r).
function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const norm = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) {
      const xx = Math.min(w - 1, Math.max(0, x));
      acc += src[y * w + xx];
    }
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc * norm;
      const xout = Math.min(w - 1, Math.max(0, x - r));
      const xin = Math.min(w - 1, Math.max(0, x + r + 1));
      acc += src[y * w + xin] - src[y * w + xout];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) {
      const yy = Math.min(h - 1, Math.max(0, y));
      acc += tmp[yy * w + x];
    }
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc * norm;
      const yout = Math.min(h - 1, Math.max(0, y - r));
      const yin = Math.min(h - 1, Math.max(0, y + r + 1));
      acc += tmp[yin * w + x] - tmp[yout * w + x];
    }
  }
  return out;
}

// Unsharp mask on a (grayscale) RGBA buffer to sharpen small text.
function unsharp(d: Uint8ClampedArray, w: number, h: number, amount: number) {
  const lum = new Float32Array(w * h);
  for (let p = 0, i = 0; i < d.length; i += 4, p++) {
    lum[p] = (d[i] + d[i + 1] + d[i + 2]) / 3;
  }
  const blurred = boxBlur(lum, w, h, 1);
  for (let p = 0, i = 0; i < d.length; i += 4, p++) {
    const orig = (d[i] + d[i + 1] + d[i + 2]) / 3;
    let v = orig + amount * (orig - blurred[p]);
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
}

// Darken mid/light grays (gamma > 1) so faint, small or handwritten text
// stays visible on a light background instead of being washed out.
function gammaDarken(d: Uint8ClampedArray, gamma: number) {
  for (let i = 0; i < d.length; i += 4) {
    d[i] = clamp(255 * Math.pow(d[i] / 255, gamma));
    d[i + 1] = clamp(255 * Math.pow(d[i + 1] / 255, gamma));
    d[i + 2] = clamp(255 * Math.pow(d[i + 2] / 255, gamma));
  }
}

// Adaptive threshold: each pixel is turned pure black or pure white based on
// the mean of its neighbourhood, so shadows and uneven lighting collapse into
// a clean white page with crisp black text — the classic "typed document" look.
function adaptiveBinarize(d: Uint8ClampedArray, w: number, h: number) {
  const lum = new Float32Array(w * h);
  for (let p = 0, i = 0; i < d.length; i += 4, p++) {
    lum[p] = (d[i] + d[i + 1] + d[i + 2]) / 3;
  }
  const radius = Math.max(8, Math.round(Math.min(w, h) / 40));
  const mean = boxBlur(lum, w, h, radius);
  for (let p = 0, i = 0; i < d.length; i += 4, p++) {
    const v = lum[p] > mean[p] * 0.85 ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
}

export async function applyFilter(dataUrl: string, mode: FilterMode): Promise<string> {
  if (mode === 'original') return dataUrl;
  const img = await loadImage(dataUrl);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;

  if (mode === 'bw') {
    // Soft black & white: grayscale + gamma darkening keeps even faint,
    // small (<7pt) or handwritten text visible instead of clipping it to white
    // the way a hard Otsu threshold does. Unsharp keeps thin strokes crisp.
    toGray(d);
    gammaDarken(d, 2.6);
    adjustContrast(d, 1.1);
    unsharp(d, w, h, 0.9);
  } else if (mode === 'document') {
    adaptiveBinarize(d, w, h);
  } else if (mode === 'enhance') {
    toGray(d);
    adjustContrast(d, 1.3);
    unsharp(d, w, h, 1.15);
  } else if (mode === 'balance') {
    autoWhiteBalance(d);
    adjustContrast(d, 1.12);
    adjustBrightness(d, 8);
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.92);
}
