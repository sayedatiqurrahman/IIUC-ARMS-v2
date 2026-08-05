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

// ---------------------------------------------------------------------------
// Grayscale / edge detection helpers
// ---------------------------------------------------------------------------

interface GrayImage {
  data: Uint8ClampedArray;
  w: number;
  h: number;
}

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

// Otsu threshold: returns a threshold that separates bright/dark pixels.
function otsuThreshold(hist: number[], total: number): number {
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

// ---------------------------------------------------------------------------
// Connected components (largest foreground blob)
// ---------------------------------------------------------------------------

// Returns the largest connected component. When interiorOnly is set, components
// touching the frame border (walls/tables/background clutter) are skipped so a
// document floating in the middle of the frame wins over background edges.
function largestComponent(mask: Uint8Array, w: number, h: number, interiorOnly = false): Uint8Array | null {
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

function polygonArea(points: Point[]): number {
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

// Score a candidate quad: prefer large area and near-right angles.
function quadScore(q: Quad, frameW: number, frameH: number): number {
  const area = polygonArea(q);
  const areaFrac = area / (frameW * frameH);
  let angleScore = 0;
  for (let i = 0; i < 4; i++) {
    const ang = angleBetween(q[i], q[(i + 1) % 4], q[(i + 2) % 4]);
    angleScore += 1 - Math.min(1, Math.abs(ang - 90) / 90);
  }
  angleScore /= 4;
  return areaFrac * 0.65 + angleScore * 0.35;
}

// Turn a connected-component mask into a valid document quad.
function quadFromMask(mask: Uint8Array, w: number, h: number, minArea: number): Quad | null {
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
  let poly = simplifyPolygon(hull.concat([hull[0]]), eps);

  // Reduce to exactly 4 corners by dropping the sharpest angle repeatedly.
  while (poly.length > 4) {
    let worst = 1;
    let worstVal = Infinity;
    for (let i = 1; i < poly.length - 1; i++) {
      const ang = angleBetween(poly[i - 1], poly[i], poly[i + 1]);
      if (ang < worstVal) {
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
  for (let i = 0; i < 4; i++) {
    const ang = angleBetween(poly[i], poly[(i + 1) % 4], poly[(i + 2) % 4]);
    if (ang < 25 || ang > 155) return null;
  }
  return orderQuad(poly);
}

export function detectDocumentQuad(source: HTMLCanvasElement | HTMLVideoElement, previewW: number, previewH: number): Quad | null {
  const raw = document.createElement('canvas');
  raw.width = previewW;
  raw.height = previewH;
  const rctx = raw.getContext('2d', { willReadFrequently: true })!;
  rctx.drawImage(source, 0, 0, previewW, previewH);

  let gray = toGray(raw);
  gray = gaussianBlur(gray, 1);
  const { w, h } = gray;
  const minArea = previewW * previewH * 0.05;
  const candidates: Quad[] = [];

  // ---- Path 1: strong edges (works on textured/contrast backgrounds) ----
  const edges = sobelEdges(gray);
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
    const q = comp ? quadFromMask(comp, w, h, previewW * previewH * 0.15) : null;
    if (q) candidates.push(q);
  }

  // ---- Path 2: brightness (paper is usually the brightest big region) ----
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.data.length; i++) hist[gray.data[i]]++;
  const otsu = otsuThreshold(hist, gray.data.length);
  const bright = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) bright[i] = gray.data[i] > otsu ? 1 : 0;
  const brightComp = largestComponent(bright, w, h, true);
  const q2 = brightComp ? quadFromMask(brightComp, w, h, minArea) : null;
  if (q2) candidates.push(q2);

  // Bright paper that nearly fills the frame.
  if (!q2) {
    const comp2 = largestComponent(bright, w, h, false);
    const q = comp2 ? quadFromMask(comp2, w, h, previewW * previewH * 0.15) : null;
    if (q) candidates.push(q);
  }

  // ---- Path 3: dark document on a bright background (notebooks, blackboards) ----
  const dark = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) dark[i] = gray.data[i] < otsu ? 1 : 0;
  const darkComp = largestComponent(dark, w, h, true);
  const q3 = darkComp ? quadFromMask(darkComp, w, h, minArea) : null;
  if (q3) candidates.push(q3);

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => quadScore(b, previewW, previewH) - quadScore(a, previewW, previewH));
  const best = candidates[0];

  // Snap corners onto the strongest nearby edge so the crop follows the real
  // paper corners instead of the coarse convex-hull estimate.
  return refineCorners(best, edges, w, h);
}

// Re-run detection on a captured still frame (higher resolution than the live
// preview) and return the quad in the *canvas* pixel space.
export function detectQuadOnCanvas(canvas: HTMLCanvasElement, previewW: number, previewH: number): Quad | null {
  return detectDocumentQuad(canvas, previewW, previewH);
}

// Move each corner a few pixels to the strongest edge nearby.
function refineCorners(q: Quad, edges: Uint8ClampedArray, w: number, h: number): Quad {
  const radius = 8;
  const out = q.map(p => ({ ...p }));
  for (let i = 0; i < 4; i++) {
    const cx = Math.round(out[i].x);
    const cy = Math.round(out[i].y);
    let bestX = cx;
    let bestY = cy;
    let bestVal = -1;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
        const v = edges[y * w + x];
        if (v > bestVal) {
          bestVal = v;
          bestX = x;
          bestY = y;
        }
      }
    }
    out[i] = { x: bestX, y: bestY };
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

export function applyScanFilter(canvas: HTMLCanvasElement, mode: ScanMode): HTMLCanvasElement {
  if (mode === 'original') return canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const { width: w, height: h } = canvas;
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  if (mode === 'enhance') {
    // Contrast stretch + slight saturation boost
    let min = 255;
    let max = 0;
    for (let i = 0; i < d.length; i += 4) {
      const lum = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
      if (lum < min) min = lum;
      if (lum > max) max = lum;
    }
    const range = max - min || 1;
    const gain = 255 / range;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = clamp255((d[i] - min) * gain);
      d[i + 1] = clamp255((d[i + 1] - min) * gain);
      d[i + 2] = clamp255((d[i + 2] - min) * gain);
    }
  } else {
    // B&W: grayscale + Otsu-like adaptive threshold (rolling block for uneven lighting)
    const gray = new Uint8ClampedArray(w * h);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      gray[p] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    }
    const block = Math.max(16, Math.round(Math.min(w, h) / 16));
    const integral = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let rowSum = 0;
      for (let x = 0; x < w; x++) {
        rowSum += gray[y * w + x];
        integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + rowSum;
      }
    }
    const half = block >> 1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - half);
        const y0 = Math.max(0, y - half);
        const x1 = Math.min(w, x + half);
        const y1 = Math.min(h, y + half);
        const count = (x1 - x0) * (y1 - y0);
        const sum =
          integral[y1 * (w + 1) + x1] -
          integral[y0 * (w + 1) + x1] -
          integral[y1 * (w + 1) + x0] +
          integral[y0 * (w + 1) + x0];
        const localMean = sum / count;
        const p = y * w + x;
        const val = gray[p] < localMean - 8 ? 0 : 255;
        const o = p * 4;
        d[o] = val;
        d[o + 1] = val;
        d[o + 2] = val;
      }
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
