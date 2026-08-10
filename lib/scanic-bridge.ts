'use client';

import { detectQuadOpenCV } from './opencv-detect';
import { detectQuadJscanify, extractPaperJscanify } from './jscanify-detect';
import {
  detectQuadOnCanvas,
  orderQuad,
  processFrame,
  applyScanFilter,
  refineQuadCorners,
  type Quad,
  type ScanMode,
  type ProcessFrameResult,
  type GrayImage,
  type Point,
} from './image-utils';

// Sanity-check a detected quad so a garbage region (background blob, sliver of
// an edge, half the frame) is rejected instead of being used for the crop.
function quadValid(q: Quad, w: number, h: number): boolean {
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const p = q[i];
    const n = q[(i + 1) % 4];
    area += p.x * n.y - n.x * p.y;
  }
  area = Math.abs(area) / 2;
  const areaFrac = area / (w * h);
  if (areaFrac < 0.03 || areaFrac > 0.98) return false;

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
    if (ang >= 25 && ang <= 155) angOk++;
  }
  return angOk === 4;
}

// Detect a document quad in the given canvas's own pixel space. jscanify's
// Canny -> Otsu -> largest-contour corner finder is the PRIMARY detector (the
// user's papers are found reliably by it, where the OpenCV multi-path misses
// them), so it runs alone and wins immediately. OpenCV's heavier multi-path is
// only paid for when jscanify finds nothing or its quad fails validation; the
// built-in pure-JS detector is the last resort. `prev` is a previous quad in
// the same space and acts as a tracking prior for the OpenCV fallback.
export async function detectQuadSmart(
  canvas: HTMLCanvasElement,
  previewW: number,
  previewH: number,
  prev?: Quad | null
): Promise<Quad | null> {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const img = ctx.getImageData(0, 0, previewW, previewH);
  const frame = { data: img.data, w: previewW, h: previewH };
  const tol = Math.max(8, Math.min(previewW, previewH) * 0.05);

  // jscanify first, and alone — no point paying for the parallel OpenCV scan
  // when the authoritative detector already found the paper.
  try {
    const js = await detectQuadJscanify(frame);
    if (js) {
      const q = refineQuadCorners({ data: frame.data, w: previewW, h: previewH } as GrayImage, js);
      const maxShift = Math.max(...q.map((p, i) => Math.hypot(p.x - js[i].x, p.y - js[i].y)));
      if (maxShift <= tol && quadValid(q, previewW, previewH)) return q;
      if (quadValid(js, previewW, previewH)) return js;
    }
  } catch {
    // fall through to the fallbacks
  }

  try {
    const ocv = await detectQuadOpenCV(frame, prev);
    if (ocv) return ocv;
  } catch {
    // fall through to the built-in detector
  }

  return detectQuadOnCanvas(canvas, previewW, previewH);
}

// Lightweight live-framing detector: jscanify only — no heavy OpenCV fallback
// and no per-frame corner refinement, so the viewfinder can keep up at a few
// frames per second. `canvas` should be small (~640px max dimension). The
// corners are coarse on purpose; capture-time detection re-runs at a higher
// resolution and snaps them onto the real paper edges.
export async function detectQuadLive(
  canvas: HTMLCanvasElement,
  previewW: number,
  previewH: number
): Promise<Quad | null> {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const img = ctx.getImageData(0, 0, previewW, previewH);
  const js = await detectQuadJscanify({ data: img.data, w: previewW, h: previewH });
  if (!js || !quadValid(js, previewW, previewH)) return null;
  return js;
}

// Snap a quad (in the canvas's own pixel space) onto the real paper edges at
// (optionally) a higher resolution than the coarse detect pass. Detection runs
// downscaled for speed, so upscaling its quad loses corner precision; re-fitting
// the edge lines against this (usually full-res) gray fixes that. `maxDim`
// bounds the refinement size (Infinity = native resolution). Returns the
// original quad if refinement moves a corner implausibly far.
export function refineQuadOnCanvas(
  canvas: HTMLCanvasElement,
  quad: Quad,
  maxDim = Infinity
): Quad {
  const cw = canvas.width;
  const ch = canvas.height;
  if (!cw || !ch) return quad;
  const scale = Math.min(1, maxDim / Math.max(cw, ch));
  const dw = Math.max(1, Math.round(cw * scale));
  const dh = Math.max(1, Math.round(ch * scale));
  const temp = document.createElement('canvas');
  temp.width = dw;
  temp.height = dh;
  const ctx = temp.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(canvas, 0, 0, dw, dh);
  const img = ctx.getImageData(0, 0, dw, dh);
  const gray = new Uint8ClampedArray(dw * dh);
  const d = img.data;
  for (let i = 0, j = 0; i < dw * dh; i++, j += 4) {
    gray[i] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
  }
  const scaled = quad.map(p => ({ x: p.x * scale, y: p.y * scale })) as Quad;
  const refined = refineQuadCorners({ data: gray, w: dw, h: dh } as GrayImage, scaled);
  const maxShift = Math.max(
    ...refined.map((p, i) => Math.hypot(p.x - scaled[i].x, p.y - scaled[i].y))
  );
  if (maxShift > Math.max(12, Math.min(dw, dh) * 0.08)) return quad;
  return orderQuad(refined.map(p => ({ x: p.x / scale, y: p.y / scale })) as Quad);
}

// Output dimensions for a document crop derived from the quad itself (the
// average of opposite side lengths), capped so the page is never upscaled past
// the source pixels or beyond `maxDim`.
function quadOutputSize(quad: Quad, maxDim: number): { w: number; h: number } {
  const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
  const w = (dist(quad[0], quad[1]) + dist(quad[3], quad[2])) / 2;
  const h = (dist(quad[0], quad[3]) + dist(quad[1], quad[2])) / 2;
  const scale = Math.min(1, maxDim / Math.max(1, Math.max(w, h)));
  return { w: Math.max(2, Math.round(w * scale)), h: Math.max(2, Math.round(h * scale)) };
}

// Separate a document from its background and apply the scan filter. jscanify's
// extractPaper does the warp with a true perspective transform sized to the
// document's own aspect ratio; the pure-canvas mesh warp is the fallback.
export async function processFrameSmart(
  source: HTMLCanvasElement,
  quad: Quad | null,
  mode: ScanMode,
  maxDim: number
): Promise<ProcessFrameResult> {
  if (quad) {
    const { w, h } = quadOutputSize(quad, maxDim);
    const warped = await extractPaperJscanify(source, orderQuad(quad), w, h);
    if (warped && warped.width > 0 && warped.height > 0) {
      const final = applyScanFilter(warped, mode);
      return { canvas: final, width: final.width, height: final.height, usedQuad: true };
    }
  }
  return processFrame(source, quad, mode, maxDim);
}
