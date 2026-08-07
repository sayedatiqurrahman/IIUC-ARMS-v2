'use client';

// jscanify (MIT, puffinsoft/jscanify) integration.
//
// jscanify's client build (src/jscanify.js) is a browser-only UMD that speaks
// the global `cv` OpenCV.js binding. Its pipeline is intentionally simple:
// Canny -> Otsu -> largest contour -> farthest-point-per-quadrant corners. That
// is a *different* signal from our multi-path A/B/C/D + line-fit refinement in
// opencv-detect.ts, so we run it as a second opinion: when both detectors agree
// the OpenCV quad is confirmed; when OpenCV misses the paper (e.g. a low-contrast
// sheet that Otsu still segments), jscanify rescues the frame.
//
// It never touches the node `canvas`/`jsdom` deps of the package entry point;
// only the client subpath (`jscanify/client`) is imported, keeping it out of the
// server bundle.

import { loadOpenCV, type CVModule } from './opencv-detect';
import { orderQuad, type Quad } from './image-utils';

type JsCorner = { x: number; y: number } | undefined;
type JsCorners = {
  topLeftCorner: JsCorner;
  topRightCorner: JsCorner;
  bottomRightCorner: JsCorner;
  bottomLeftCorner: JsCorner;
};

interface JScanifyInstance {
  findPaperContour: (img: any) => any | null;
  getCornerPoints: (contour: any) => JsCorners;
}

type JScanifyCtor = new () => JScanifyInstance;

let jscanifyPromise: Promise<JScanifyCtor | null> | null = null;

function loadJscanify(): Promise<JScanifyCtor | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!jscanifyPromise) {
    jscanifyPromise = import('jscanify/client')
      .then((m: any) => {
        const ctor = m?.default ?? m;
        return typeof ctor === 'function' ? (ctor as JScanifyCtor) : null;
      })
      .catch(() => null);
  }
  return jscanifyPromise;
}

// jscanify's client expects a global `cv`. Our OpenCV.js is loaded lazily by
// opencv-detect (same wasm build the package ships), so point the global at it.
function exposeGlobalCV(cv: CVModule) {
  try {
    (window as any).cv = cv;
  } catch {
    // ignore
  }
}

// Run jscanify's largest-contour detector on an RGBA frame. Returns an ordered
// quad in the frame's pixel space, or null (no paper / engine unavailable).
export async function detectQuadJscanify(
  frame: { data: Uint8ClampedArray; w: number; h: number }
): Promise<Quad | null> {
  if (typeof window === 'undefined') return null;
  const cv = await loadOpenCV();
  if (!cv) return null;
  const ctor = await loadJscanify();
  if (!ctor) return null;

  const { data, w, h } = frame;
  if (w < 48 || h < 48) return null;

  exposeGlobalCV(cv);

  const src = new cv.Mat(h, w, cv.CV_8UC4);
  const gray = new cv.Mat();
  let contour: any = null;
  try {
    src.data.set(data);
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    const instance = new ctor();
    contour = instance.findPaperContour(gray);
    if (!contour) return null;

    const corners = instance.getCornerPoints(contour);
    const pts: Array<{ x: number; y: number }> = [
      corners.topLeftCorner,
      corners.topRightCorner,
      corners.bottomRightCorner,
      corners.bottomLeftCorner,
    ].filter((p): p is { x: number; y: number } => Boolean(p));

    if (pts.length !== 4) return null;
    const ordered = orderQuad(pts);
    if (ordered.length !== 4) return null;
    return ordered;
  } catch {
    return null;
  } finally {
    if (contour) contour.delete();
    gray.delete();
    src.delete();
  }
}
