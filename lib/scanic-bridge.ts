'use client';

import {
  detectQuadOnCanvas,
  orderQuad,
  processFrame,
  applyScanFilter,
  type Quad,
  type ScanMode,
  type ProcessFrameResult,
} from './image-utils';

type CornerPoints = {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
};

type ScanicModule = {
  scanDocument: (
    image: HTMLCanvasElement | HTMLImageElement | ImageData,
    options?: Record<string, any>
  ) => Promise<{ success: boolean; corners: CornerPoints | null; message?: string }>;
  extractDocument: (
    image: HTMLCanvasElement | HTMLImageElement | ImageData,
    corners: CornerPoints,
    options?: { output?: 'canvas' | 'imagedata' | 'dataurl' }
  ) => Promise<{ success: boolean; output?: any; message?: string }>;
};

let scanicPromise: Promise<ScanicModule | null> | null = null;

function loadScanic(): Promise<ScanicModule | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!scanicPromise) {
    scanicPromise = import('scanic')
      .then((m) => m as unknown as ScanicModule)
      .catch(() => null);
  }
  return scanicPromise;
}

function cornersToQuad(c: CornerPoints): Quad {
  return orderQuad([
    { x: c.topLeft.x, y: c.topLeft.y },
    { x: c.topRight.x, y: c.topRight.y },
    { x: c.bottomRight.x, y: c.bottomRight.y },
    { x: c.bottomLeft.x, y: c.bottomLeft.y },
  ]);
}

function quadToCorners(q: Quad): CornerPoints {
  return { topLeft: q[0], topRight: q[1], bottomRight: q[2], bottomLeft: q[3] };
}

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

// Detect a document quad in the given canvas's own pixel space. The built-in CV
// runs first — its line-intersection corner refinement hugs the paper corners
// precisely. Scanic's WASM detector is only a fallback when the CV finds nothing.
export async function detectQuadSmart(canvas: HTMLCanvasElement, previewW: number, previewH: number): Promise<Quad | null> {
  const cv = detectQuadOnCanvas(canvas, previewW, previewH);
  if (cv) return cv;

  const scanic = await loadScanic();
  if (scanic) {
    try {
      const res = await scanic.scanDocument(canvas, { mode: 'detect', maxProcessingDimension: 800 });
      if (res.success && res.corners) {
        const q = cornersToQuad(res.corners);
        if (q.length === 4 && quadValid(q, canvas.width, canvas.height)) return q;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

// Perspective-correct a canvas using a quad in the canvas's pixel space.
// Returns a processed (warped + scan filter applied) canvas.
export async function processFrameSmart(
  source: HTMLCanvasElement,
  quad: Quad | null,
  mode: ScanMode,
  maxDim: number
): Promise<ProcessFrameResult> {
  const scanic = await loadScanic();
  if (scanic && quad) {
    try {
      const res = await scanic.extractDocument(source, quadToCorners(quad), { output: 'canvas' });
      if (res.success && res.output instanceof HTMLCanvasElement && res.output.width > 0) {
        const warped = applyScanFilter(res.output, mode);
        return { canvas: warped, width: warped.width, height: warped.height, usedQuad: true };
      }
    } catch {
      // fall through
    }
  }
  return processFrame(source, quad, mode, maxDim);
}
