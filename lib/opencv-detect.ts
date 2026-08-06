'use client';

// Document-quad detection backed by OpenCV.js (Apache 2.0, @techstark/opencv-js).
//
// The wasm build (~13MB) is served lazily from /public/opencv.js so it never
// bloats the JS bundles; it is fetched once, on the first detection, and then
// kept by the browser HTTP cache (the service worker deliberately does NOT
// intercept it). In Node (regression tests) the package is required directly,
// so this module runs headlessly with the same code path.
//
// Detection strategy (CamScanner-style multi-path):
//   A. Adaptive Canny edges  -> morphological close -> findContours
//   B. Otsu bright-region    -> external contour       (white page, low contrast)
//   C. Otsu dark-region      -> external contour       (dark page on bright desk)
//   D. Adaptive threshold    -> external contour       (uneven lighting / shadows)
//
// The paper is selected as the largest *rectangular* convex quad, scored by
// size, rectangularity and near-90° corners, so background objects (smaller,
// non-quadrilateral contours) lose. When a previous good quad is supplied it
// acts as a region-of-interest prior: candidates near it score much higher,
// which makes the live frame track the paper instead of jumping between
// look-alike objects. The winning quad is refined with a per-side line fit so
// corners land exactly on the paper edges.

import { orderQuad, otsuThreshold, refineQuadCorners, type GrayImage, type Point, type Quad } from './image-utils';

type CVModule = {
  Mat: any;
  MatVector: any;
  CV_8UC4: number;
  CV_8UC1: number;
  COLOR_RGBA2GRAY: number;
  MORPH_RECT: number;
  MORPH_CLOSE: number;
  RETR_LIST: number;
  RETR_EXTERNAL: number;
  CHAIN_APPROX_SIMPLE: number;
  THRESH_BINARY: number;
  THRESH_BINARY_INV: number;
  cvtColor: (src: any, dst: any, code: number) => void;
  GaussianBlur: (src: any, dst: any, ksize: any, sigmaX: number) => void;
  Canny: (src: any, dst: any, t1: number, t2: number) => void;
  morphologyEx: (src: any, dst: any, op: number, kernel: any) => void;
  getStructuringElement: (shape: number, ksize: any) => any;
  findContours: (image: any, contours: any, hierarchy: any, mode: number, method: number) => void;
  contourArea: (c: any) => number;
  arcLength: (c: any, closed: boolean) => number;
  approxPolyDP: (c: any, out: any, eps: number, closed: boolean) => void;
  isContourConvex: (c: any) => boolean;
  minAreaRect: (c: any) => { center: { x: number; y: number }; size: { width: number; height: number }; angle: number };
  threshold: (src: any, dst: any, thr: number, max: number, type: number) => number;
  Size: new (w: number, h: number) => any;
};

export interface RgbaFrame {
  data: Uint8ClampedArray;
  w: number;
  h: number;
}

const OPENCV_ASSET = '/opencv.js?v=2';

let opencvPromise: Promise<CVModule | null> | null = null;

function toCVModule(v: any): CVModule | null {
  const c = v && typeof v.then === 'function' ? null : v;
  if (c && typeof c.Mat === 'function' && typeof c.findContours === 'function') return c as CVModule;
  return null;
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function injectScript(): Promise<CVModule | null> {
  return new Promise((resolve) => {
    const w = window as any;
    const s = document.createElement('script');
    s.src = OPENCV_ASSET;
    s.async = true;
    const finish = () => {
      const c = w.cv && typeof w.cv.then === 'function' ? w.cv.then(() => w.cv) : Promise.resolve(w.cv);
      c.then((cv: any) => resolve(toCVModule(cv))).catch(() => resolve(null));
    };
    s.onload = finish;
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
}

function loadOpenCV(): Promise<CVModule | null> {
  if (!opencvPromise) {
    opencvPromise = (async () => {
      // Node test harness: the package's CJS export is a promise resolving to cv.
      // A variable specifier keeps webpack from bundling the 13MB wasm build into
      // the browser chunks — in the browser it is loaded via the /opencv.js script.
      if (typeof window === 'undefined') {
        try {
          const pkg = '@techstark/opencv-js';
          const mod: any = await import(pkg);
          const raw = mod?.default ?? mod;
          const cv = raw && typeof raw.then === 'function' ? await raw : raw;
          return toCVModule(cv);
        } catch {
          return null;
        }
      }
      const w = window as any;
      if (w.cv) return toCVModule(w.cv) ?? (typeof w.cv.then === 'function' ? toCVModule(await w.cv) : null);
      // Retry a few times; a transient network failure must not disable the
      // engine for the rest of the session.
      for (let attempt = 0; attempt < 3; attempt++) {
        const cv = await injectScript();
        if (cv) return cv;
        await delay(500 * (attempt + 1));
      }
      return null;
    })();
    // Never cache a failure permanently — clear the slot so the next caller
    // attempts loading again.
    opencvPromise = opencvPromise.then((cv) => {
      if (!cv) opencvPromise = null;
      return cv;
    });
  }
  return opencvPromise;
}

function pointsFromMat(mat: any): Point[] {
  const pts: Point[] = [];
  const data = mat.data32S;
  for (let i = 0; i < mat.rows; i++) {
    pts.push({ x: data[i * 2], y: data[i * 2 + 1] });
  }
  return pts;
}

function plausibleQuad(q: Point[]): boolean {
  const sides = q.map((p, i) => {
    const n = q[(i + 1) % 4];
    return Math.hypot(n.x - p.x, n.y - p.y);
  });
  const maxSide = Math.max(...sides);
  const minSide = Math.min(...sides);
  if (maxSide / Math.max(1, minSide) > 6) return false;
  let angOk = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[(i + 3) % 4];
    const b = q[i];
    const c = q[(i + 1) % 4];
    const dot = (a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y);
    const mag = Math.hypot(a.x - b.x, a.y - b.y) * Math.hypot(c.x - b.x, c.y - b.y);
    const cos = Math.max(-1, Math.min(1, dot / Math.max(1e-6, mag)));
    const ang = (Math.acos(cos) * 180) / Math.PI;
    if (ang >= 20 && ang <= 160) angOk++;
  }
  return angOk === 4;
}

// How close a quad is to a rectangle: 1 = perfect right angles, 0 = no right
// angles. Rotation-invariant; mild perspective skew scores slightly below 1.
function angleQuality(q: Point[]): number {
  let total = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[(i + 3) % 4];
    const b = q[i];
    const c = q[(i + 1) % 4];
    const v1x = a.x - b.x;
    const v1y = a.y - b.y;
    const v2x = c.x - b.x;
    const v2y = c.y - b.y;
    const dot = v1x * v2x + v1y * v2y;
    const mag = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
    const cos = Math.max(-1, Math.min(1, dot / Math.max(1e-6, mag)));
    const ang = (Math.acos(cos) * 180) / Math.PI;
    total += 1 - Math.min(1, Math.abs(ang - 90) / 45);
  }
  return total / 4;
}

function quadCenter(q: Point[]): Point {
  return {
    x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4,
    y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4,
  };
}

// Adaptive Canny thresholds from the image's own gradient distribution, so
// detection works on low-contrast frames and doesn't drown in noise.
function cannyThresholds(data: Uint8ClampedArray, w: number, h: number): [number, number] {
  const hist = new Array(2048).fill(0);
  let n = 0;
  for (let y = 1; y < h - 1; y += 2) {
    for (let x = 1; x < w - 1; x += 2) {
      const i = y * w + x;
      const g = Math.abs(data[i + 1] - data[i - 1]) + Math.abs(data[i + w] - data[i - w]);
      hist[Math.min(2047, g)]++;
      n++;
    }
  }
  let acc = 0;
  let p70 = 30;
  let p95 = 120;
  const t70 = n * 0.7;
  const t95 = n * 0.95;
  for (let g = 0; g < 2048; g++) {
    acc += hist[g];
    if (p70 === 30 && acc >= t70) p70 = g;
    if (p95 === 120 && acc >= t95) {
      p95 = g;
      break;
    }
  }
  const low = Math.max(30, p70);
  const high = Math.max(low * 1.6, p95);
  return [low, high];
}

// Isolate the brightest prominent region (the page) from everything around it.
// The page is usually the brightest large color in the frame; we find its peak
// and set the threshold in the middle of the empty gap between the page and the
// next-darker region. This beats plain Otsu for near-white pages on near-white
// backgrounds (paper 196 vs desk 178): Otsu merges them into one blob, this
// splits at ~187. Returns null when no clear gap exists (e.g. textured paper),
// so callers can fall back to Otsu.
function brightPeakThreshold(hist: number[], total: number): number | null {
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

interface Candidate {
  q: Point[];
  baseScore: number;
  center: Point;
  areaFrac: number;
  rectiness: number;
  touchesBorder: boolean;
}

export interface DetectDebugInfo {
  path: string;
  q: Point[];
  areaFrac: number;
  rectiness: number;
  angleQ: number;
  base: number;
  touchesBorder: boolean;
}

function collectCandidates(
  cv: CVModule,
  contours: any,
  w: number,
  h: number,
  minArea: number,
  maxAreaFrac: number,
  path: string,
  debug?: (info: DetectDebugInfo) => void
): Candidate[] {
  const candidates: Candidate[] = [];
  for (let i = 0; i < contours.size(); i++) {
    const contour = contours.get(i);
    const area = cv.contourArea(contour);
    const areaFrac = area / (w * h);
    if (area < minArea || areaFrac > maxAreaFrac) {
      contour.delete();
      continue;
    }
    const rrect = cv.minAreaRect(contour);
    const rectArea = rrect.size.width * rrect.size.height;
    let approx = new cv.Mat();
    const peri = cv.arcLength(contour, true);
    cv.approxPolyDP(contour, approx, 0.02 * peri, true);
    if (approx.rows !== 4) {
      approx.delete();
      approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, 0.07 * peri, true);
    }
    const convex = cv.isContourConvex(approx);
    const pts = pointsFromMat(approx);
    approx.delete();
    contour.delete();
    if (!convex || pts.length !== 4 || !plausibleQuad(pts)) continue;

    const rectiness = rectArea > 0 ? area / rectArea : 0;
    const touchesBorder = pts.some((p) => p.x <= 1 || p.y <= 1 || p.x >= w - 2 || p.y >= h - 2);
    let base = area * (0.4 + 0.6 * rectiness);
    if (!touchesBorder) base *= 1.25;
    else if (areaFrac < 0.85) base *= 0.5;
    const c: Candidate = { q: pts, baseScore: base, center: quadCenter(pts), areaFrac, rectiness, touchesBorder };
    if (debug) debug({ path, q: pts, areaFrac, rectiness, angleQ: angleQuality(pts), base, touchesBorder });
    candidates.push(c);
  }
  return candidates;
}

// Detect the paper quad in an RGBA frame. `prev` is the previous frame's quad
// (same pixel space) and acts as a tracking prior. Returns null when nothing
// plausible is found (OpenCV unavailable or no quad survives the checks).
export async function detectQuadOpenCV(
  frame: RgbaFrame,
  prev?: Quad | null,
  onCandidates?: (info: DetectDebugInfo) => void
): Promise<Quad | null> {
  const cv = await loadOpenCV();
  if (!cv) return null;
  const { data, w, h } = frame;
  if (w < 48 || h < 48) return null;

  const src = new cv.Mat(h, w, cv.CV_8UC4);
  src.data.set(data);
  const gray = new cv.Mat();
  const blur = new cv.Mat();
  const edges = new cv.Mat();
  const closed = new cv.Mat();
  const mask = new cv.Mat();
  const maskClosed = new cv.Mat();
  const maskDark = new cv.Mat();
  const adap = new cv.Mat();
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(9, 9));
  const kernelClose = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 9));
  let closeKernel: any = null;
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const contours2 = new cv.MatVector();
  const hierarchy2 = new cv.Mat();
  const contours4 = new cv.MatVector();
  const hierarchy4 = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    const minArea = w * h * 0.04;
    const gd = gray.data;
    const candidates: Candidate[] = [];
    // Kernel for merging ink into a page-shaped blob.
    const closeSize = Math.max(21, Math.round(Math.min(w, h) / 12));

    // A. Edges (textured / contrast backgrounds)
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    const [lo, hi] = cannyThresholds(blur.data, w, h);
    cv.Canny(blur, edges, lo, hi);
    cv.morphologyEx(edges, closed, cv.MORPH_CLOSE, kernel);
    cv.findContours(closed, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    candidates.push(...collectCandidates(cv, contours, w, h, minArea, 0.97, 'A:edges', onCandidates));

    // B. Bright region (white page on any background)
    const hist = new Array(256).fill(0);
    for (let i = 0; i < w * h; i++) hist[gd[i]]++;
    const thr = otsuThreshold(hist, w * h);
    const thrB = brightPeakThreshold(hist, w * h) ?? thr;
    cv.threshold(gray, mask, thrB, 255, cv.THRESH_BINARY);
    // Full-width text lines slice the page into thin strips; a tall close
    // reconnects them into one solid page before contouring.
    cv.morphologyEx(mask, maskClosed, cv.MORPH_CLOSE, kernelClose);
    cv.findContours(maskClosed, contours2, hierarchy2, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    candidates.push(...collectCandidates(cv, contours2, w, h, minArea, 0.93, 'B:bright', onCandidates));

    // C. Dark region with a large morphological close: the ink/text clusters
    // merge into a page-sized blob. This recovers the paper even when its
    // border is nearly invisible (white page on a white desk) or the background
    // is textured — the writing defines the page. The background's own dark
    // pixels close into a whole-frame blob, which the area cap rejects.
    cv.threshold(gray, maskDark, thr, 255, cv.THRESH_BINARY_INV);
    closeKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(closeSize, closeSize));
    cv.morphologyEx(maskDark, adap, cv.MORPH_CLOSE, closeKernel);
    cv.findContours(adap, contours4, hierarchy4, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    candidates.push(...collectCandidates(cv, contours4, w, h, minArea, 0.93, 'C:ink', onCandidates));

    if (candidates.length === 0) return null;

    const diag = Math.hypot(w, h);
    const prevCenter = prev ? quadCenter(prev) : null;
    for (const c of candidates) {
      let score = c.baseScore * (0.55 + 0.45 * angleQuality(c.q));
      if (prevCenter) {
        const d = Math.hypot(c.center.x - prevCenter.x, c.center.y - prevCenter.y) / diag;
        if (d < 0.25) score *= 1.6;
        else if (d < 0.45) score *= 1.2;
        else score *= 0.5;
      }
      c.baseScore = score;
    }
    candidates.sort((a, b) => b.baseScore - a.baseScore);
    const best = candidates[0].q;
    const ordered = orderQuad(best);

    // Line-fit corner refinement so the corners land exactly on the paper edges.
    const refined = refineQuadCorners({ data: gd, w, h } as GrayImage, ordered);
    const maxShift = Math.max(...ordered.map((p, i) => Math.hypot(refined[i].x - p.x, refined[i].y - p.y)));
    return maxShift <= Math.max(12, Math.min(w, h) * 0.05) ? refined : ordered;
  } finally {
    src.delete();
    gray.delete();
    blur.delete();
    edges.delete();
    closed.delete();
    mask.delete();
    maskClosed.delete();
    maskDark.delete();
    adap.delete();
    kernel.delete();
    kernelClose.delete();
    if (closeKernel) closeKernel.delete();
    contours.delete();
    hierarchy.delete();
    contours2.delete();
    hierarchy2.delete();
    contours4.delete();
    hierarchy4.delete();
  }
}
