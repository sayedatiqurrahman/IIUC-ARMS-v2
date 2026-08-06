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

// Detect a document quad in the given canvas's own pixel space. Uses Scanic's
// WASM-accelerated Canny pipeline first and falls back to the built-in CV.
export async function detectQuadSmart(canvas: HTMLCanvasElement, previewW: number, previewH: number): Promise<Quad | null> {
  const scanic = await loadScanic();
  if (scanic) {
    try {
      const res = await scanic.scanDocument(canvas, { mode: 'detect', maxProcessingDimension: 800 });
      if (res.success && res.corners) {
        const q = cornersToQuad(res.corners);
        if (q.length === 4) return q;
      }
    } catch {
      // fall through to built-in detector
    }
  }
  return detectQuadOnCanvas(canvas, previewW, previewH);
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
