'use client';

// Document-quad detection backed by OpenCV.js (Apache 2.0, @techstark/opencv-js).
//
// The wasm build (~13MB) is served lazily from /public/opencv.js so it never
// bloats the JS bundles; it is fetched once, on the first detection, and then
// cached by the service worker. In Node (regression tests) the package is
// required directly, so this module runs headlessly with the same code path.
//
// Detection strategy: Canny edges -> morphological close -> findContours ->
// approxPolyDP. The paper is selected as the largest *rectangular* convex quad
// in the frame, which cleanly separates it from background objects (they form
// smaller or non-quadrilateral contours). A brightness-path (Otsu threshold ->
// external contour) is used as a second source of candidates, so a low-contrast
// page that doesn't produce strong edges is still found. The winning quad is
// then refined with a per-side line fit so corners sit on the paper edges.

import { orderQuad, otsuThreshold, refineQuadCorners, type GrayImage, type Point, type Quad } from './image-utils';

type CVModule = {
  Mat: any;
  MatVector: any;
  CV_8UC4: number;
  CV_8UC1: number;
  CV_32SC2: number;
  COLOR_RGBA2GRAY: number;
  MORPH_RECT: number;
  MORPH_CLOSE: number;
  RETR_LIST: number;
  RETR_EXTERNAL: number;
  CHAIN_APPROX_SIMPLE: number;
  THRESH_BINARY: number;
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

let opencvPromise: Promise<CVModule | null> | null = null;

function toCVModule(v: any): CVModule | null {
  const c = v && typeof v.then === 'function' ? null : v;
  if (c && typeof c.Mat === 'function' && typeof c.findContours === 'function') return c as CVModule;
  return null;
}

function loadOpenCV(): Promise<CVModule | null> {
  if (!opencvPromise) {
    opencvPromise = (async () => {
      // Node test harness: the package's CJS export is a promise resolving to cv.
      // A variable specifier keeps webpack from bundling the 13MB wasm build into
      // the browser chunks — in the browser it is loaded via a /opencv.js script.
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
      // Browser: reuse window.cv if already loaded, else inject /opencv.js.
      const w = window as any;
      if (w.cv) return toCVModule(w.cv) ?? (typeof w.cv.then === 'function' ? toCVModule(await w.cv) : null);
      return new Promise<CVModule | null>((resolve) => {
        const s = document.createElement('script');
        s.src = '/opencv.js';
        s.async = true;
        s.onload = async () => {
          const c = w.cv && typeof w.cv.then === 'function' ? await w.cv : w.cv;
          resolve(toCVModule(c));
        };
        s.onerror = () => resolve(null);
        document.head.appendChild(s);
      });
    })();
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

function quadArea(q: Point[]): number {
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const p = q[i];
    const n = q[(i + 1) % 4];
    a += p.x * n.y - n.x * p.y;
  }
  return Math.abs(a) / 2;
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

interface Candidate {
  q: Point[];
  score: number;
  touchesBorder: boolean;
}

function collectCandidates(
  cv: CVModule,
  contours: any,
  w: number,
  h: number,
  minArea: number,
  maxAreaFrac: number
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
    let score = area * (0.4 + 0.6 * rectiness);
    if (!touchesBorder) score *= 1.25;
    else if (areaFrac < 0.5) score *= 0.6;
    candidates.push({ q: pts, score, touchesBorder });
  }
  return candidates;
}

// Detect the paper quad in an RGBA frame. Returns null when nothing plausible
// is found (OpenCV unavailable or no quad survives the geometric checks).
export async function detectQuadOpenCV(frame: RgbaFrame): Promise<Quad | null> {
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
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(9, 9));
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const mask = new cv.Mat();
  const contours2 = new cv.MatVector();
  const hierarchy2 = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    cv.Canny(blur, edges, 60, 180);
    cv.morphologyEx(edges, closed, cv.MORPH_CLOSE, kernel);
    cv.findContours(closed, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const minArea = w * h * 0.04;
    const candidates = collectCandidates(cv, contours, w, h, minArea, 0.97);

    // Brightness path: the paper is usually the brightest big region. Build an
    // Otsu mask and find its outer contour — this recovers pages whose borders
    // have too little contrast to show up in Canny. Candidates that span nearly
    // the whole frame are rejected: on a flat/empty frame the Otsu mask becomes
    // the entire image and would otherwise be mistaken for a page.
    const hist = new Array(256).fill(0);
    const gd = gray.data;
    for (let i = 0; i < w * h; i++) hist[gd[i]]++;
    const thr = otsuThreshold(hist, w * h);
    cv.threshold(gray, mask, thr, 255, cv.THRESH_BINARY);
    cv.findContours(mask, contours2, hierarchy2, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    const brightCandidates = collectCandidates(cv, contours2, w, h, minArea, 0.93);
    candidates.push(...brightCandidates);

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.score - a.score);
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
    kernel.delete();
    contours.delete();
    hierarchy.delete();
    mask.delete();
    contours2.delete();
    hierarchy2.delete();
  }
}
