'use client';

export interface Point {
  x: number;
  y: number;
}

export type Quad = [Point, Point, Point, Point];
export type ScanMode = 'original' | 'enhance' | 'bw';

export const MAX_DIM_DEFAULT = 2000;
export const JPEG_QUALITY_DEFAULT = 0.9;

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

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = JPEG_QUALITY_DEFAULT): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas conversion failed'))), type, quality);
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

// ---------------------------------------------------------------------------
// Compression
// ---------------------------------------------------------------------------

export interface CompressOptions {
  maxDim?: number;
  quality?: number;
}

export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  const maxDim = opts.maxDim || MAX_DIM_DEFAULT;
  const quality = opts.quality ?? JPEG_QUALITY_DEFAULT;
  const name = file.name.toLowerCase();

  if (/\.gif$/i.test(name)) return file;

  const dataUrl = await fileToDataUrl(file);
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  if (blob.size >= file.size) return file;

  const ext = /\.png$/i.test(name) ? '.png' : /\.webp$/i.test(name) ? '.webp' : '.jpg';
  const baseName = name.replace(/\.[^.]+$/, '');
  return new File([blob], `${baseName}${ext}`, { type: 'image/jpeg' });
}

// Aggressive-but-fast compression for the standalone Studio tool. Re-encodes a
// single downscaled canvas and only retries with a lower quality when the first
// pass isn't smaller, so a well-compressed original still shrinks instead of
// being reported as "already small". Max 3 encodes → stays quick like online
// compressors. Returns null when nothing beats the original.
export async function compressImageStrong(file: File): Promise<File | null> {
  const name = file.name.toLowerCase();
  if (/\.gif$/i.test(name)) return null;

  const dataUrl = await fileToDataUrl(file);
  const img = await loadImage(dataUrl);
  const maxDim = 2048;
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  let best: Blob | null = null;
  for (const q of [0.78, 0.65, 0.52]) {
    const blob = await canvasToBlob(canvas, 'image/jpeg', q);
    if (!blob) continue;
    if (!best || blob.size < best.size) best = blob;
    if (blob.size < file.size) break;
  }
  if (!best || best.size >= file.size) return null;

  const ext = /\.png$/i.test(name) ? '.png' : /\.webp$/i.test(name) ? '.webp' : '.jpg';
  const baseName = name.replace(/\.[^.]+$/, '');
  return new File([best], `${baseName}${ext}`, { type: 'image/jpeg' });
}

// ---------------------------------------------------------------------------
// PDF compression
// ---------------------------------------------------------------------------

// Compress a PDF by re-rendering every page to a downscaled JPEG and rebuilding
// the document with jsPDF. This dramatically shrinks scanned / image-heavy
// PDFs (the common academic case). Text-only PDFs may not get smaller — in that
// case we return null so the caller can report "already optimized".
// Returns null if the result isn't smaller than the original or on any error.
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
    // Render every page once at a sensible resolution; we then re-encode at a
    // few JPEG qualities and keep the smallest result that beats the original.
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
      const imgs = canvases.map(c => c.toDataURL('image/jpeg', q));
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
    try {
      pdf.destroy?.();
    } catch {}
  }
}

// ---------------------------------------------------------------------------
// Archive (ZIP-based document) compression — lossless
// ---------------------------------------------------------------------------

// These are ZIP containers; re-zipping every entry with max DEFLATE compression
// shrinks them with zero quality loss and keeps them perfectly valid/openable.
export const ARCHIVE_RE = /\.(docx|docm|pptx|pptm|xlsx|xlsm|epub|odt|ods|odp|zip|cbz)$/i;

export async function compressArchive(file: File): Promise<File | null> {
  if (!ARCHIVE_RE.test(file.name)) return null;
  try {
    const { unzipSync, zipSync } = await import('fflate');
    const buf = new Uint8Array(await file.arrayBuffer());
    const files = unzipSync(buf);
    const out = zipSync(files, { level: 9 });
    if (out.length >= buf.length) return null;
    return new File([out], file.name, { type: file.type || 'application/octet-stream' });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Grayscale / edge detection helpers
// ---------------------------------------------------------------------------

interface GrayImage {
  data: Uint8ClampedArray;
  w: number;
  h: number;
}

export type { GrayImage };

function toGray(canvas: HTMLCanvasElement): GrayImage {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const { width: w, height: h } = canvas;
  const raw = ctx.getImageData(0, 0, w, h).data;
  const data = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; i < raw.length; i += 4, p++) {
    data[p] = (raw[i] * 299 + raw[i + 1] * 587 + raw[i + 2] * 114) / 1000;
  }
  return { data, w, h };
}

function gaussianBlur(g: GrayImage, radius: number): GrayImage {
  const { data, w, h } = g;
  const out = new Uint8ClampedArray(data.length);
  const r = Math.max(1, radius);
  const kernelSize = r * 2 + 1;
  const kernel = new Float32Array(kernelSize);
  const sigma = r / 2;
  let sum = 0;
  for (let i = 0; i < kernelSize; i++) {
    const d = i - r;
    kernel[i] = Math.exp(-(d * d) / (2 * sigma * sigma));
    sum += kernel[i];
  }
  for (let i = 0; i < kernelSize; i++) kernel[i] /= sum;

  const tmp = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = 0; k < kernelSize; k++) {
        const xx = Math.min(w - 1, Math.max(0, x - r + k));
        acc += data[y * w + xx] * kernel[k];
      }
      tmp[y * w + x] = acc;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = 0; k < kernelSize; k++) {
        const yy = Math.min(h - 1, Math.max(0, y - r + k));
        acc += tmp[yy * w + x] * kernel[k];
      }
      out[y * w + x] = acc;
    }
  }
  return { data: out, w, h };
}

function sobelEdges(g: GrayImage): Uint8ClampedArray {
  const { data, w, h } = g;
  const out = new Uint8ClampedArray(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -data[i - w - 1] - 2 * data[i - 1] - data[i + w - 1] +
        data[i - w + 1] + 2 * data[i + 1] + data[i + w + 1];
      const gy =
        -data[i - w - 1] - 2 * data[i - w] - data[i - w + 1] +
        data[i + w - 1] + 2 * data[i + w] + data[i + w + 1];
      out[i] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
    }
  }
  return out;
}

// Histogram stretch between 2% and 98% percentiles. Boosts low-contrast scenes
// (paper in shadow, off-white pages) so both the edge detector and the Otsu
// brightness split can separate the paper from the background reliably.
function stretchContrast(g: GrayImage): GrayImage {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < g.data.length; i++) hist[g.data[i]]++;
  const total = g.data.length;
  let lo = 0;
  let hi = 255;
  let cum = 0;
  const loTarget = total * 0.02;
  for (let t = 0; t < 256; t++) {
    cum += hist[t];
    if (cum >= loTarget) { lo = t; break; }
  }
  cum = 0;
  const hiTarget = total * 0.98;
  for (let t = 255; t >= 0; t--) {
    cum += hist[t];
    if (cum >= hiTarget) { hi = t; break; }
  }
  if (hi - lo < 8) return g;
  const out = new Uint8ClampedArray(g.data.length);
  const scale = 255 / (hi - lo);
  for (let i = 0; i < g.data.length; i++) {
    const v = (g.data[i] - lo) * scale;
    out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return { data: out, w: g.w, h: g.h };
}

// Otsu threshold: returns a threshold that separates bright/dark pixels.
export function otsuThreshold(hist: number[], total: number): number {
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let maxVar = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }
  return threshold;
}

// Isolate the brightest prominent region (the paper) from everything around it.
// Paper is usually the brightest large object in the frame; we find its peak and
// set the threshold in the middle of the empty gap between the page and the
// next-darker region. This beats plain Otsu for near-white paper on a near-white
// background (paper 196 vs desk 178): Otsu merges them into one blob, this splits
// at ~187. Returns null when no clear peak gap exists (e.g. textured paper), so
// callers can fall back to Otsu.
export function brightPeakThreshold(hist: number[], total: number): number | null {
  const peakMin = Math.max(2000, total * 0.02);
  let peak = -1;
  for (let v = 255; v >= 1; v--) {
    if (hist[v] >= peakMin && hist[v] >= hist[v - 1]) {
      peak = v;
      break;
    }
  }
  if (peak < 0) return null;
  const belowMin = total * 0.005;
  let b = peak - 1;
  while (b > 0 && hist[b] < belowMin) b--;
  if (peak - b < 8) return null;
  return Math.round((peak + b) / 2);
}

// ---------------------------------------------------------------------------
// Connected components (largest foreground blob)
// ---------------------------------------------------------------------------

// Returns the largest connected component. When interiorOnly is set, components
// touching the frame border (walls/tables/background clutter) are skipped so a
// document floating in the middle of the frame wins over background edges.
export function largestComponent(mask: Uint8Array, w: number, h: number, interiorOnly = false): Uint8Array | null {
  const labels = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  const touchesBorder: boolean[] = [];
  const queue = new Int32Array(w * h);
  const borderMargin = Math.max(2, Math.round(Math.min(w, h) * 0.03));
  let label = 0;

  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || labels[i] !== -1) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = i;
    labels[i] = label;
    let count = 0;
    let touches = false;
    while (head < tail) {
      const idx = queue[head++];
      count++;
      const x = idx % w;
      const y = (idx / w) | 0;
      if (x <= borderMargin || y <= borderMargin || x >= w - 1 - borderMargin || y >= h - 1 - borderMargin) touches = true;
      if (x > 0 && mask[idx - 1] && labels[idx - 1] === -1) { labels[idx - 1] = label; queue[tail++] = idx - 1; }
      if (x < w - 1 && mask[idx + 1] && labels[idx + 1] === -1) { labels[idx + 1] = label; queue[tail++] = idx + 1; }
      if (y > 0 && mask[idx - w] && labels[idx - w] === -1) { labels[idx - w] = label; queue[tail++] = idx - w; }
      if (y < h - 1 && mask[idx + w] && labels[idx + w] === -1) { labels[idx + w] = label; queue[tail++] = idx + w; }
    }
    sizes[label] = count;
    touchesBorder[label] = touches;
    label++;
  }

  let best = -1;
  let bestCount = 0;
  for (let l = 0; l < label; l++) {
    if (interiorOnly && touchesBorder[l]) continue;
    if (sizes[l] > bestCount) {
      bestCount = sizes[l];
      best = l;
    }
  }
  if (best < 0) return null;

  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (labels[i] === best) out[i] = 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Convex hull (Andrew's monotone chain)
// ---------------------------------------------------------------------------

function convexHull(points: Point[]): Point[] {
  if (points.length < 3) return points.slice();
  const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

// Douglas-Peucker polygon simplification
function simplifyPolygon(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points.slice();
  let maxDist = 0;
  let index = 0;
  const first = points[0];
  const last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const dist = pointToSegmentDistance(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }
  if (maxDist > epsilon) {
    const left = simplifyPolygon(points.slice(0, index + 1), epsilon);
    const right = simplifyPolygon(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// Merge consecutive points that simplification left closer than minDist,
// keeping their midpoint. Also closes the wrap-around gap between the first
// and last point when they are the same vertex.
function mergeNearbyPoints(pts: Point[], minDist: number): Point[] {
  if (pts.length < 2) return pts.slice();
  const out: Point[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y) <= minDist) {
      out[out.length - 1] = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 };
    } else {
      out.push(p);
    }
  }
  if (out.length >= 2) {
    const f = out[0];
    const l = out[out.length - 1];
    if (Math.hypot(f.x - l.x, f.y - l.y) <= minDist) {
      out[out.length - 1] = { x: (f.x + l.x) / 2, y: (f.y + l.y) / 2 };
      out.shift();
    }
  }
  return out;
}

export function polygonArea(points: Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

// ---------------------------------------------------------------------------
// Document quadrilateral detection
// ---------------------------------------------------------------------------

// Threshold that keeps the strongest `frac` of values (0..1 → keeps the top %).
function percentileThreshold(values: Uint8ClampedArray, frac: number): number {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < values.length; i++) hist[values[i]]++;
  let cum = 0;
  const target = values.length * (1 - frac);
  for (let t = 255; t >= 0; t--) {
    cum += hist[t];
    if (cum >= target) return t;
  }
  return 0;
}

// Score a candidate quad: prefer a paper-sized, interior, near-rectangular quad.
// Size saturates at ~1/3 of the frame so a frame-filling background blob cannot
// win by area alone; an interior quad (the paper) strongly beats one that runs
// into the frame border (a wall/desk that fills to the edges).
function quadScore(q: Quad, frameW: number, frameH: number): number {
  const area = polygonArea(q);
  const areaFrac = area / (frameW * frameH);
  const sizeScore = Math.min(1, areaFrac * 3);
  let angleScore = 0;
  for (let i = 0; i < 4; i++) {
    const ang = angleBetween(q[i], q[(i + 1) % 4], q[(i + 2) % 4]);
    angleScore += 1 - Math.min(1, Math.abs(ang - 90) / 45);
  }
  angleScore /= 4;
  const touchesBorder = q.some((p) => p.x <= 2 || p.y <= 2 || p.x >= frameW - 3 || p.y >= frameH - 3);
  const interior = touchesBorder ? 0.55 : 1.3;
  return sizeScore * (0.35 + 0.65 * angleScore) * interior;
}

// Turn a connected-component mask into a valid document quad.
export function quadFromMask(mask: Uint8Array, w: number, h: number, minArea: number): Quad | null {
  const pts: Point[] = [];
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      if (mask[y * w + x]) pts.push({ x, y });
    }
  }
  if (pts.length < 30) return null;

  const hull = convexHull(pts);
  if (hull.length < 4) return null;

  const eps = Math.max(3, Math.min(w, h) * 0.02);
  // Simplify the hull as an OPEN polyline (no duplicated closing vertex).
  let poly = simplifyPolygon(hull, eps);

  // Merge points that simplification left on top of each other.
  poly = mergeNearbyPoints(poly, Math.max(2, eps * 0.6));

  // Reduce to exactly 4 corners by repeatedly dropping the MOST COLLINEAR
  // vertex (interior angle closest to 180°). Dropping the sharpest angle
  // instead would remove real paper corners and keep useless side points.
  while (poly.length > 4) {
    let worst = 1;
    let worstVal = -1;
    for (let i = 1; i < poly.length - 1; i++) {
      const ang = angleBetween(poly[i - 1], poly[i], poly[i + 1]);
      if (ang > worstVal) {
        worstVal = ang;
        worst = i;
      }
    }
    if (poly.length > 2) poly.splice(worst, 1);
    else break;
  }
  if (poly.length < 4) return null;
  if (poly.length > 4) poly.splice(1, poly.length - 4);

  const area = polygonArea(poly);
  if (area < minArea || area > w * h * 0.97) return null;
  // Reject long, thin slivers of background that happen to survive thresholding.
  const sides = poly.map((p, i) => {
    const n = poly[(i + 1) % poly.length];
    return Math.hypot(n.x - p.x, n.y - p.y);
  });
  const maxSide = Math.max(...sides);
  const minSide = Math.min(...sides);
  if (maxSide / Math.max(1, minSide) > 5) return null;
  for (let i = 0; i < 4; i++) {
    const ang = angleBetween(poly[i], poly[(i + 1) % 4], poly[(i + 2) % 4]);
    if (ang < 25 || ang > 155) return null;
  }
  return orderQuad(poly);
}

// Pure detection core: operates on a gray image only (no DOM), so it can be
// exercised from the browser (detectDocumentQuad) and from the Node regression
// test (scripts/detection-test.ts) with the exact same code path.
export function detectQuadCore(gray: GrayImage): Quad | null {
  const blurred = gaussianBlur(gray, 1);
  const g = stretchContrast(blurred);
  const { w, h } = g;
  const minArea = w * h * 0.05;
  const candidates: Quad[] = [];

  // ---- Path 1: strong edges (works on textured/contrast backgrounds) ----
  const edges = sobelEdges(g);
  const thr = Math.max(percentileThreshold(edges, 0.10), 40);
  const edgeMask = new Uint8Array(edges.length);
  for (let i = 0; i < edges.length; i++) if (edges[i] >= thr) edgeMask[i] = 1;

  // Dilate edges slightly to close small gaps.
  const dilated = new Uint8Array(edges.length);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (
        edgeMask[i] || edgeMask[i - 1] || edgeMask[i + 1] ||
        edgeMask[i - w] || edgeMask[i + w]
      ) dilated[i] = 1;
    }
  }

  // Try a document that sits fully inside the frame first (preferred).
  let comp = largestComponent(dilated, w, h, true);
  let q1 = comp ? quadFromMask(comp, w, h, minArea) : null;
  if (q1) candidates.push(q1);

  // Fallback: document nearly fills the frame and touches the border.
  if (!q1) {
    comp = largestComponent(dilated, w, h, false);
    const q = comp ? quadFromMask(comp, w, h, w * h * 0.15) : null;
    if (q) candidates.push(q);
  }

  // ---- Path 2: brightness (paper is usually the brightest big region) ----
  const hist = new Array(256).fill(0);
  for (let i = 0; i < g.data.length; i++) hist[g.data[i]]++;
  const thrB = brightPeakThreshold(hist, g.data.length) ?? otsuThreshold(hist, g.data.length);
  const bright = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) bright[i] = g.data[i] > thrB ? 1 : 0;
  const brightComp = largestComponent(bright, w, h, true);
  const q2 = brightComp ? quadFromMask(brightComp, w, h, minArea) : null;
  if (q2) candidates.push(q2);

  // Bright paper that nearly fills the frame.
  if (!q2) {
    const comp2 = largestComponent(bright, w, h, false);
    const q = comp2 ? quadFromMask(comp2, w, h, w * h * 0.15) : null;
    if (q) candidates.push(q);
  }

  // ---- Path 3: dark document on a bright background (notebooks, blackboards) ----
  const dark = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) dark[i] = g.data[i] < thrB ? 1 : 0;
  const darkComp = largestComponent(dark, w, h, true);
  const q3 = darkComp ? quadFromMask(darkComp, w, h, minArea) : null;
  if (q3) candidates.push(q3);

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => quadScore(b, w, h) - quadScore(a, w, h));
  const best = candidates[0];

  // Snap corners onto the strongest nearby edge so the crop follows the real
  // paper corners instead of the coarse convex-hull estimate.
  return refineCorners(best, edges, w, h);
}

export function detectDocumentQuad(source: HTMLCanvasElement | HTMLVideoElement, previewW: number, previewH: number): Quad | null {
  const raw = document.createElement('canvas');
  raw.width = previewW;
  raw.height = previewH;
  const rctx = raw.getContext('2d', { willReadFrequently: true })!;
  rctx.drawImage(source, 0, 0, previewW, previewH);
  return detectQuadCore(toGray(raw));
}

// Re-run detection on a captured still frame (higher resolution than the live
// preview) and return the quad in the *canvas* pixel space.
export function detectQuadOnCanvas(canvas: HTMLCanvasElement, previewW: number, previewH: number): Quad | null {
  return detectDocumentQuad(canvas, previewW, previewH);
}

// Snap the corners of a quad onto the strongest nearby edges (orthogonal line
// fit per side, corner = line intersection). Used to polish the OpenCV contour
// result so the crop follows the paper's real corners, not the coarse polygon.
export function refineQuadCorners(gray: GrayImage, quad: Quad): Quad {
  const edges = sobelEdges(gray);
  return refineCorners(quad, edges, gray.w, gray.h);
}

// Fit a line (a*x + b*y + c = 0) through points by orthogonal least squares.
function fitLine(pts: Point[]): { a: number; b: number; c: number } | null {
  const n = pts.length;
  if (n < 2) return null;
  let mx = 0;
  let my = 0;
  for (const p of pts) { mx += p.x; my += p.y; }
  mx /= n;
  my /= n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of pts) {
    const dx = p.x - mx;
    const dy = p.y - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  if (sxx + syy < 1e-6) return null;
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const a = Math.sin(theta);
  const b = -Math.cos(theta);
  const c = -(a * mx + b * my);
  return { a, b, c };
}

function lineIntersect(l1: { a: number; b: number; c: number }, l2: { a: number; b: number; c: number }): Point | null {
  const det = l1.a * l2.b - l2.a * l1.b;
  if (Math.abs(det) < 1e-9) return null;
  return {
    x: (l1.b * l2.c - l2.b * l1.c) / det,
    y: (l2.a * l1.c - l1.a * l2.c) / det,
  };
}

// Walk along the segment a->b and keep, for each step, the strongest edge pixel
// inside a small perpendicular band. These points trace the real paper edge.
function collectEdgePointsNearSide(
  a: Point,
  b: Point,
  center: Point,
  edges: Uint8ClampedArray,
  thr: number,
  w: number,
  h: number
): Point[] {
  const pts: Point[] = [];
  const band = 6;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 2) return pts;
  const steps = Math.max(10, Math.round(len));
  const nx = -dy / len;
  const ny = dx / len;
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const cx = a.x + dx * t;
    const cy = a.y + dy * t;
    let bestVal = 0;
    let bestP: Point | null = null;
    for (let o = -band; o <= band; o++) {
      const x = Math.round(cx + nx * o);
      const y = Math.round(cy + ny * o);
      if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
      const v = edges[y * w + x];
      if (v > bestVal) {
        bestVal = v;
        bestP = { x, y };
      }
    }
    if (bestP && bestVal >= thr) pts.push(bestP);
  }
  return pts;
}

function quadCenter(q: Point[]): Point {
  return {
    x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4,
    y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4,
  };
}

// Least-squares line fit with outlier rejection. Text lines near the paper edge
// produce edge pixels that pull the naive fit inward; dropping points far from
// the dominant line leaves the true paper edge.
function fitLineRobust(pts: Point[]): { a: number; b: number; c: number } | null {
  let cur = pts;
  for (let pass = 0; pass < 2; pass++) {
    const line = fitLine(cur);
    if (!line) return null;
    if (pass === 1) return line;
    const keep = cur.filter((p) => Math.abs(line.a * p.x + line.b * p.y + line.c) <= 5);
    if (keep.length < Math.max(2, cur.length * 0.4)) return line;
    cur = keep;
  }
  return null;
}

// Snap each corner to the intersection of the two real paper edges meeting
// there (fit two lines from the nearby edge pixels and intersect them). This is
// far more accurate than grabbing the strongest edge pixel in a box around the
// coarse corner estimate.
function refineCorners(q: Quad, edges: Uint8ClampedArray, w: number, h: number): Quad {
  const thr = Math.max(percentileThreshold(edges, 0.15), 30);
  const maxMove = Math.max(w, h) * 0.15;
  const center = quadCenter(q);
  const out = q.map(p => ({ ...p }));
  for (let i = 0; i < 4; i++) {
    const prev = q[(i + 3) % 4];
    const cur = q[i];
    const next = q[(i + 1) % 4];
    const side1 = collectEdgePointsNearSide(prev, cur, center, edges, thr, w, h);
    const side2 = collectEdgePointsNearSide(cur, next, center, edges, thr, w, h);
    const l1 = fitLineRobust(side1);
    const l2 = fitLineRobust(side2);
    if (l1 && l2) {
      const ip = lineIntersect(l1, l2);
      if (ip && isFinite(ip.x) && isFinite(ip.y)) {
        const dist = Math.hypot(ip.x - cur.x, ip.y - cur.y);
        if (dist <= maxMove) {
          out[i] = { x: Math.max(0, Math.min(w - 1, Math.round(ip.x))), y: Math.max(0, Math.min(h - 1, Math.round(ip.y))) };
        }
      }
    }
  }
  return orderQuad(out);
}

function angleBetween(a: Point, b: Point, c: Point): number {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const dot = abx * cbx + aby * cby;
  const mag = Math.hypot(abx, aby) * Math.hypot(cbx, cby);
  if (mag === 0) return 180;
  const cos = Math.max(-1, Math.min(1, dot / mag));
  return (Math.acos(cos) * 180) / Math.PI;
}

// Order corners: TL, TR, BR, BL
export function orderQuad(quad: Point[]): Quad {
  const pts = quad.slice();
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  pts.sort((a, b) => {
    const aa = Math.atan2(a.y - cy, a.x - cx);
    const ab = Math.atan2(b.y - cy, b.x - cx);
    return aa - ab;
  });
  // atan2 order is clockwise-ish starting at -PI; reorder to TL,TR,BR,BL
  const tl = pts[0];
  const tr = pts[1];
  const br = pts[2];
  const bl = pts[3];
  return [tl, tr, br, bl];
}

// ---------------------------------------------------------------------------
// Perspective warp (mesh-based, pure canvas)
// ---------------------------------------------------------------------------

function sampleQuad(quad: Quad, u: number, v: number): Point {
  const p0 = quad[0];
  const p1 = quad[1];
  const p2 = quad[2];
  const p3 = quad[3];
  const topX = p0.x + (p1.x - p0.x) * u;
  const topY = p0.y + (p1.y - p0.y) * u;
  const botX = p3.x + (p2.x - p3.x) * u;
  const botY = p3.y + (p2.y - p3.y) * u;
  return { x: topX + (botX - topX) * v, y: topY + (botY - topY) * v };
}

// Solve affine transform (a,b,c,d,e,f) such that:
//   a*src.x + c*src.y + e = dst.x
//   b*src.x + d*src.y + f = dst.y
// using 3 point correspondences.
function affineFromPoints(src: Point[], dst: Point[]): number[] {
  const [s0, s1, s2] = src;
  const [d0, d1, d2] = dst;
  const dx1 = s1.x - s0.x;
  const dy1 = s1.y - s0.y;
  const dx2 = s2.x - s0.x;
  const dy2 = s2.y - s0.y;
  const det = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(det) < 1e-9) return [1, 0, 0, 1, 0, 0];

  const a = ((d1.x - d0.x) * dy2 - (d2.x - d0.x) * dy1) / det;
  const c = ((d2.x - d0.x) * dx1 - (d1.x - d0.x) * dx2) / det;
  const e = d0.x - a * s0.x - c * s0.y;
  const b = ((d1.y - d0.y) * dy2 - (d2.y - d0.y) * dy1) / det;
  const d = ((d2.y - d0.y) * dx1 - (d1.y - d0.y) * dx2) / det;
  const f = d0.y - b * s0.x - d * s0.y;
  return [a, b, c, d, e, f];
}

export function warpPerspective(source: HTMLCanvasElement | HTMLVideoElement, quad: Quad, outW: number, outH: number, mesh = 24): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, outW, outH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  for (let j = 0; j < mesh; j++) {
    for (let i = 0; i < mesh; i++) {
      const u0 = i / mesh;
      const u1 = (i + 1) / mesh;
      const v0 = j / mesh;
      const v1 = (j + 1) / mesh;
      const x0 = Math.round(u0 * outW);
      const x1 = Math.round(u1 * outW);
      const y0 = Math.round(v0 * outH);
      const y1 = Math.round(v1 * outH);
      if (x1 - x0 <= 0 || y1 - y0 <= 0) continue;

      const sTL = sampleQuad(quad, u0, v0);
      const sTR = sampleQuad(quad, u1, v0);
      const sBL = sampleQuad(quad, u0, v1);
      const sBR = sampleQuad(quad, u1, v1);

      const dTL = { x: x0, y: y0 };
      const dTR = { x: x1, y: y0 };
      const dBL = { x: x0, y: y1 };
      const dBR = { x: x1, y: y1 };

      // Triangle 1: TL-TR-BL
      const [a1, b1, c1, d1, e1, f1] = affineFromPoints([sTL, sTR, sBL], [dTL, dTR, dBL]);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y0);
      ctx.lineTo(x0, y1);
      ctx.closePath();
      ctx.clip();
      ctx.transform(a1, b1, c1, d1, e1, f1);
      ctx.drawImage(source as HTMLCanvasElement, 0, 0);
      ctx.restore();

      // Triangle 2: BR-TR-BL
      const [a2, b2, c2, d2, e2, f2] = affineFromPoints([sBR, sTR, sBL], [dBR, dTR, dBL]);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1, y0);
      ctx.lineTo(x0, y1);
      ctx.closePath();
      ctx.clip();
      ctx.transform(a2, b2, c2, d2, e2, f2);
      ctx.drawImage(source as HTMLCanvasElement, 0, 0);
      ctx.restore();
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Scan filters: Original / Enhance / Black & White
// ---------------------------------------------------------------------------

// Box blur of a Float64 pixel buffer via an integral image (O(1) per pixel).
// Used for the local illumination/statistics estimates in binarization.
function boxBlur(values: Float64Array, w: number, h: number, radius: number): Float64Array {
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    const row = y * w;
    for (let x = 0; x < w; x++) {
      rowSum += values[row + x];
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + rowSum;
    }
  }
  const out = new Float64Array(w * h);
  const r = Math.max(1, radius);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h - 1, y + r) + 1;
    const rows = y1 - y0;
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r) + 1;
      const cols = x1 - x0;
      const sum =
        integral[y1 * (w + 1) + x1] -
        integral[y0 * (w + 1) + x1] -
        integral[y1 * (w + 1) + x0] +
        integral[y0 * (w + 1) + x0];
      out[y * w + x] = sum / (rows * cols);
    }
  }
  return out;
}

function boxBlurGray(data: Uint8ClampedArray, w: number, h: number, radius: number): Float64Array {
  const vals = new Float64Array(data.length);
  for (let i = 0; i < data.length; i++) vals[i] = data[i];
  return boxBlur(vals, w, h, radius);
}

// PDF-style B&W binarization. The goal is: every readable stroke turns BLACK,
// everything smooth (paper, soft shadows, fold creases) stays WHITE.
//
// The discriminator between ink and a crease/shadow is SHARPNESS:
//   * real text has a sharp edge — inside a small window around the stroke the
//     local std-dev is LARGE relative to how dark the stroke is;
//   * a fold crease or shadow is a slow, smooth ramp — its std-dev is TINY
//     relative to its depth, even when the crease is quite dark.
//
// Two background fields are estimated:
//   * `bg`  — a very large-scale blur that only captures illumination, so a
//     crease shows up as a smooth dip in it (never as texture);
//   * small-scale mean/std — sized to text strokes, so a faint stroke still
//     spikes the local variance.
//
// A pixel becomes ink when it is both noticeably darker than the local paper
// (>8.5%) AND sharp (std > 22% of its own depth). Very dark pixels that are
// touching confirmed ink are added too, so the flat interior of thick strokes
// (titles, solid logos) does not get hollowed out — while an isolated dark
// crease center, which has no ink neighbor, still stays white.
export function binarizeGray(gray: GrayImage): Uint8ClampedArray {
  const { data, w, h } = gray;
  const minDim = Math.min(w, h);

  const rBig = Math.max(24, Math.round(minDim / 14));
  const rSmall = Math.max(2, Math.round(minDim / 160));

  const bg = boxBlurGray(data, w, h, rBig);
  const smallMean = boxBlurGray(data, w, h, rSmall);
  const sq = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const v = data[i];
    sq[i] = v * v;
  }
  const smallSq = boxBlur(sq, w, h, rSmall);

  const out = new Uint8ClampedArray(w * h).fill(255);
  const core = new Uint8Array(w * h);
  let coreCount = 0;

  for (let i = 0; i < w * h; i++) {
    const m = bg[i];
    if (m <= 8) {
      out[i] = 0;
      continue;
    }
    const dark = m - data[i];
    if (dark <= 0) continue;
    const darkFrac = dark / m;
    const sm = smallMean[i];
    let variance = smallSq[i] - sm * sm;
    if (variance < 0) variance = 0;
    const std = Math.sqrt(variance);
    const sharp = std > 0.22 * Math.max(1, dark);
    if (sharp && darkFrac > 0.085) {
      out[i] = 0;
    } else if (darkFrac > 0.45) {
      core[i] = 1;
      coreCount++;
    }
  }

  if (coreCount > 0) {
    const dil = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (out[i] === 0 || out[i - w] === 0 || out[i + w] === 0 || out[i - 1] === 0 || out[i + 1] === 0) {
          dil[i] = 1;
        }
      }
    }
    for (let i = 0; i < w * h; i++) {
      if (core[i] && dil[i]) out[i] = 0;
    }
  }
  return out;
}

export function applyScanFilter(canvas: HTMLCanvasElement, mode: ScanMode): HTMLCanvasElement {
  if (mode === 'original') return canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const { width: w, height: h } = canvas;
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  if (mode === 'enhance') {
    // Percentile contrast stretch (2%–98%). Unlike a naive min/max stretch it
    // can't be blown out by a single glint or dust spec, and it lifts faded
    // pages without cooking the highlights.
    const minDim = Math.min(w, h);
    const hist = new Array(256).fill(0);
    for (let i = 0; i < d.length; i += 4) {
      hist[(d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0]++;
    }
    const total = w * h;
    let lo = 0;
    let hi = 255;
    let cum = 0;
    for (let t = 0; t < 256; t++) {
      cum += hist[t];
      if (cum >= total * 0.02) { lo = t; break; }
    }
    cum = 0;
    for (let t = 255; t >= 0; t--) {
      cum += hist[t];
      if (cum >= total * 0.02) { hi = t; break; }
    }
    if (hi - lo > 8) {
      const gain = 255 / (hi - lo);
      for (let i = 0; i < d.length; i += 4) {
        d[i] = clamp255((d[i] - lo) * gain);
        d[i + 1] = clamp255((d[i + 1] - lo) * gain);
        d[i + 2] = clamp255((d[i + 2] - lo) * gain);
      }
    }
    // Light unsharp mask: boosts local contrast so text edges and fine detail
    // snap crisper after the perspective warp's interpolation softened them.
    const gray: GrayImage = { w, h, data: new Uint8ClampedArray(w * h) };
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      gray.data[p] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    }
    const blur = boxBlurGray(gray.data, w, h, Math.max(2, Math.round(minDim / 240)));
    const amount = 1.2;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const f = (gray.data[p] - blur[p]) * amount;
      d[i] = clamp255(d[i] + f);
      d[i + 1] = clamp255(d[i + 1] + f);
      d[i + 2] = clamp255(d[i + 2] + f);
    }
  } else {
    // B&W: shadow-aware adaptive binarization (see binarizeGray).
    const gray: GrayImage = { w, h, data: new Uint8ClampedArray(w * h) };
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      gray.data[p] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    }
    const bw = binarizeGray(gray);
    for (let p = 0; p < w * h; p++) {
      const o = p * 4;
      d[o] = bw[p];
      d[o + 1] = bw[p];
      d[o + 2] = bw[p];
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

// ---------------------------------------------------------------------------
// High-level: process a captured frame into a processed canvas
// ---------------------------------------------------------------------------

export interface ProcessFrameResult {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  usedQuad: boolean;
}

export function processFrame(
  source: HTMLCanvasElement | HTMLVideoElement,
  quad: Quad | null,
  mode: ScanMode,
  maxDim: number = MAX_DIM_DEFAULT
): ProcessFrameResult {
  const sw = (source as HTMLVideoElement).videoWidth || (source as HTMLCanvasElement).width;
  const sh = (source as HTMLVideoElement).videoHeight || (source as HTMLCanvasElement).height;
  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const outW = Math.round(sw * scale);
  const outH = Math.round(sh * scale);

  let warped: HTMLCanvasElement;
  let usedQuad = false;
  if (quad) {
    // quad is in source pixel space (full video resolution); sample directly
    warped = warpPerspective(source, quad, outW, outH);
    usedQuad = true;
  } else {
    warped = document.createElement('canvas');
    warped.width = outW;
    warped.height = outH;
    const ctx = warped.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(source as HTMLCanvasElement, 0, 0, outW, outH);
  }

  const final = applyScanFilter(warped, mode);
  return { canvas: final, width: final.width, height: final.height, usedQuad };
}
