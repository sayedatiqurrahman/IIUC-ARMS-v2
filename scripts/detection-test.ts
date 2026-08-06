// Regression test for the document-quad detectors and the B&W binarizer.
//
// Detectors:  detectQuadCore (built-in CV, lib/image-utils.ts) and
//             detectQuadOpenCV (OpenCV.js contour pipeline, lib/opencv-detect.ts)
// Binarizer:  binarizeGray (shadow-aware B&W, lib/image-utils.ts)
//
// Builds synthetic "camera frames" — a paper quadrilateral on a background, with
// text lines, distractors, shadows, rotation, low contrast, etc. — and verifies
// each detector recovers the paper corners and the B&W filter preserves text
// while keeping shadows white.
//
// Run:  npx tsc lib/image-utils.ts lib/opencv-detect.ts scripts/detection-test.ts
//         --outDir .tmp-detection-test --module commonjs --target es2020 --skipLibCheck
//       node .tmp-detection-test/scripts/detection-test.js
//
// Exits non-zero if any scenario fails.

import { binarizeGray, detectQuadCore, orderQuad, type GrayImage, type Point, type Quad } from '../lib/image-utils';
import { detectQuadOpenCV, type RgbaFrame } from '../lib/opencv-detect';

interface Scenario {
  name: string;
  build: (w: number, h: number) => { gray: GrayImage; truth: Quad | null };
  maxMean: number; // max allowed mean corner error (px)
  expectNull?: boolean;
  // skipCV: the built-in detector merges touching objects into the paper; the
  // OpenCV contour path (the primary detector) handles it. Only fallback.
  skipCV?: boolean;
}

function makeGray(w: number, h: number, fill: number): GrayImage {
  const data = new Uint8ClampedArray(w * h);
  for (let i = 0; i < data.length; i++) data[i] = fill;
  return { data, w, h };
}

function grayToRgba(gray: GrayImage): RgbaFrame {
  const data = new Uint8ClampedArray(gray.w * gray.h * 4);
  for (let i = 0; i < gray.w * gray.h; i++) {
    const v = gray.data[i];
    const o = i * 4;
    data[o] = v;
    data[o + 1] = v;
    data[o + 2] = v;
    data[o + 3] = 255;
  }
  return { data, w: gray.w, h: gray.h };
}

function pointInQuad(p: Point, q: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(cross) < 1e-9) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

function fillQuad(g: GrayImage, quad: Quad, value: number) {
  const { w, h, data } = g;
  let minX = w, maxX = 0, minY = h, maxY = 0;
  for (const p of quad) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  minX = Math.max(0, Math.floor(minX)); maxX = Math.min(w - 1, Math.ceil(maxX));
  minY = Math.max(0, Math.floor(minY)); maxY = Math.min(h - 1, Math.ceil(maxY));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (pointInQuad({ x, y }, quad)) data[y * w + x] = value;
    }
  }
}

// Horizontal text-line bars inside the paper quad.
function drawTextLines(g: GrayImage, quad: Quad, count: number, value: number) {
  const { w, h, data } = g;
  const cy = (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4;
  const spread = Math.abs(quad[2].y - quad[0].y) * 0.7;
  for (let i = 0; i < count; i++) {
    const y0 = Math.round(cy - spread / 2 + (i / (count - 1)) * spread);
    for (let y = y0; y <= y0 + 5; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (y >= 0 && y < h && data[idx] !== 0 && pointInQuad({ x, y }, quad)) data[idx] = value;
      }
    }
  }
}

function rotateQuad(q: Quad, deg: number, cx: number, cy: number): Quad {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return q.map(p => {
    const dx = p.x - cx, dy = p.y - cy;
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  }) as Quad;
}

function quadFromRect(x0: number, y0: number, x1: number, y1: number): Quad {
  return orderQuad([{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]);
}

// Match result corners to ground truth over cyclic rotations; returns mean error.
function cornerError(a: Quad, b: Quad): number {
  let best = Infinity;
  for (let r = 0; r < 4; r++) {
    let sum = 0;
    for (let i = 0; i < 4; i++) {
      const p = a[(i + r) % 4];
      const q = b[i];
      sum += Math.hypot(p.x - q.x, p.y - q.y);
    }
    best = Math.min(best, sum);
  }
  return best / 4;
}

const W = 640;
const H = 480;

const scenarios: Scenario[] = [
  {
    name: 'A4 paper, dark background',
    maxMean: 4,
    build: (w, h) => {
      const gray = makeGray(w, h, 70);
      const truth = quadFromRect(170, 28, 470, 452);
      fillQuad(gray, truth, 235);
      drawTextLines(gray, truth, 14, 40);
      return { gray, truth };
    },
  },
  {
    name: 'A4 paper, rotated 25°',
    maxMean: 5,
    build: (w, h) => {
      const gray = makeGray(w, h, 80);
      const base = quadFromRect(190, 60, 450, 420);
      const truth = rotateQuad(base, 25, W / 2, H / 2);
      fillQuad(gray, truth, 235);
      drawTextLines(gray, truth, 12, 45);
      return { gray, truth };
    },
  },
  {
    name: 'Low contrast (paper on light desk)',
    maxMean: 6,
    build: (w, h) => {
      const gray = makeGray(w, h, 150);
      const truth = quadFromRect(120, 60, 520, 420);
      fillQuad(gray, truth, 205);
      drawTextLines(gray, truth, 10, 120);
      return { gray, truth };
    },
  },
  {
    name: 'Paper nearly fills the frame',
    maxMean: 6,
    build: (w, h) => {
      const gray = makeGray(w, h, 90);
      const truth = quadFromRect(8, 8, W - 8, H - 8);
      fillQuad(gray, truth, 235);
      drawTextLines(gray, truth, 20, 45);
      return { gray, truth };
    },
  },
  {
    name: 'Paper with a bright distractor object',
    maxMean: 5,
    build: (w, h) => {
      const gray = makeGray(w, h, 75);
      const truth = quadFromRect(200, 120, 500, 400);
      fillQuad(gray, truth, 235);
      drawTextLines(gray, truth, 12, 45);
      // Bright object in the top-left corner — smaller than the paper.
      fillQuad(gray, quadFromRect(30, 30, 130, 110), 240);
      return { gray, truth };
    },
  },
  {
    name: 'Paper with a dark object touching its edge',
    maxMean: 8,
    skipCV: true,
    build: (w, h) => {
      const gray = makeGray(w, h, 75);
      const truth = quadFromRect(180, 100, 500, 400);
      fillQuad(gray, truth, 235);
      drawTextLines(gray, truth, 12, 45);
      // Dark object glued to the paper's right edge — the union has >4 corners,
      // so the brightness path must still isolate the paper itself.
      fillQuad(gray, quadFromRect(496, 150, 560, 320), 45);
      return { gray, truth };
    },
  },
  {
    name: 'Off-center paper + background table edge',
    maxMean: 5,
    build: (w, h) => {
      const gray = makeGray(w, h, 85);
      // Bright horizontal band across the top that touches the borders — a
      // classic false-positive that must lose to the real paper.
      for (let y = 0; y < 120; y++) for (let x = 0; x < w; x++) gray.data[y * w + x] = 215;
      const truth = quadFromRect(80, 220, 520, 460);
      fillQuad(gray, truth, 238);
      drawTextLines(gray, truth, 12, 50);
      return { gray, truth };
    },
  },
  {
    name: 'A4 paper + JPEG-style noise',
    maxMean: 6,
    skipCV: true,
    build: (w, h) => {
      const gray = makeGray(w, h, 70);
      const truth = quadFromRect(170, 28, 470, 452);
      fillQuad(gray, truth, 235);
      drawTextLines(gray, truth, 14, 40);
      // Deterministic salt-and-pepper-ish noise (camera sensor / JPEG artifacts).
      let seed = 42;
      const rnd = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
      };
      for (let i = 0; i < gray.data.length; i++) {
        const v = gray.data[i] + Math.round((rnd() - 0.5) * 28);
        gray.data[i] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
      return { gray, truth };
    },
  },
  {
    name: 'White paper on white desk (near-invisible edge)',
    maxMean: 8,
    skipCV: true,
    build: (w, h) => {
      const gray = makeGray(w, h, 178);
      const truth = quadFromRect(120, 60, 520, 420);
      fillQuad(gray, truth, 196);
      drawTextLines(gray, truth, 10, 90);
      return { gray, truth };
    },
  },
  {
    name: 'Textured background + paper',
    maxMean: 8,
    skipCV: true,
    build: (w, h) => {
      const gray = makeGray(w, h, 120);
      let seed = 7;
      const rnd = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
      };
      // Wood-grain / carpet texture: random speckle everywhere.
      for (let i = 0; i < gray.data.length; i++) {
        gray.data[i] = 80 + Math.round(rnd() * 140);
      }
      const truth = quadFromRect(140, 90, 520, 400);
      fillQuad(gray, truth, 236);
      drawTextLines(gray, truth, 12, 60);
      return { gray, truth };
    },
  },
  {
    name: 'Uneven illumination (shadow gradient over everything)',
    maxMean: 10,
    skipCV: true,
    build: (w, h) => {
      const gray = makeGray(w, h, 95);
      const truth = quadFromRect(120, 50, 520, 430);
      fillQuad(gray, truth, 240);
      drawTextLines(gray, truth, 12, 55);
      // Diagonal light falloff: left bright, right ~55% brightness.
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const t = (x + y) / (w + h);
          const v = Math.round(gray.data[y * w + x] * (1 - 0.45 * t));
          gray.data[y * w + x] = v;
        }
      }
      return { gray, truth };
    },
  },
  {
    name: 'No paper (flat background) -> null',
    maxMean: 0,
    expectNull: true,
    build: (w, h) => ({ gray: makeGray(w, h, 128), truth: null }),
  },
];

function runDetector(label: string, detect: (g: GrayImage) => Quad | null): number {
  let failed = 0;
  for (const s of scenarios) {
    if (s.skipCV) {
      console.log(`SKIP  [${label}] ${s.name} (touching-object case is OpenCV-only)`);
      continue;
    }
    const { gray, truth } = s.build(W, H);
    const result = detect(gray);
    const resQuad = result ? orderQuad(result) : null;

    if (s.expectNull) {
      if (resQuad) {
        failed++;
        console.log(`FAIL  [${label}] ${s.name}: expected null but got corners ${JSON.stringify(resQuad)}`);
      } else {
        console.log(`PASS  [${label}] ${s.name}`);
      }
      continue;
    }

    if (!resQuad || !truth) {
      failed++;
      console.log(`FAIL  [${label}] ${s.name}: detection returned null (no document found)`);
      continue;
    }

    const err = cornerError(resQuad, truth);
    const ok = err <= s.maxMean;
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  [${label}] ${s.name}: mean corner error ${err.toFixed(2)}px (limit ${s.maxMean}px)`);
  }
  return failed;
}

// ---- Binarization (B&W) checks -------------------------------------------------

function inkRatio(gray: GrayImage, bw: Uint8ClampedArray, predicate: (x: number, y: number) => boolean): number {
  let black = 0;
  let total = 0;
  for (let y = 0; y < gray.h; y++) {
    for (let x = 0; x < gray.w; x++) {
      if (!predicate(x, y)) continue;
      total++;
      if (bw[y * gray.w + x] === 0) black++;
    }
  }
  return total === 0 ? 0 : black / total;
}

function runBinarize(): number {
  let failed = 0;
  const check = (name: string, ok: boolean, detail: string) => {
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  [B&W] ${name}: ${detail}`);
  };

  // Build a full-frame page: paper 235, text bars 60, plus a soft shadow that
  // darkens the right half down to ~55% brightness (a crease/fold gradient).
  const gray = makeGray(W, H, 235);
  const truth = quadFromRect(0, 0, W, H);
  drawTextLines(gray, truth, 14, 60);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = Math.max(0, Math.min(1, (x - W * 0.35) / (W * 0.35)));
      const v = Math.round(gray.data[y * W + x] * (1 - 0.45 * t));
      gray.data[y * W + x] = v;
    }
  }
  const bw = binarizeGray(gray);

  // Text bands: the 5px-tall bars (every ~23px). Ink must survive on both the
  // bright side and the shadowed side.
  const barY = (y: number) => {
    const cy = H / 2;
    const spread = H * 0.7;
    for (let i = 0; i < 14; i++) {
      const y0 = Math.round(cy - spread / 2 + (i / 13) * spread);
      if (y >= y0 && y <= y0 + 5) return true;
    }
    return false;
  };
  const inkInBarsBright = inkRatio(gray, bw, (x, y) => barY(y) && x < W * 0.3);
  const inkInBarsShadow = inkRatio(gray, bw, (x, y) => barY(y) && x > W * 0.7);
  check('text ink preserved on bright side', inkInBarsBright > 0.5, `bar ink ${(inkInBarsBright * 100).toFixed(0)}%`);
  check('text ink preserved inside shadow', inkInBarsShadow > 0.5, `bar ink in shadow ${(inkInBarsShadow * 100).toFixed(0)}%`);

  // Paper (non-text) areas must stay white — including inside the shadow.
  const inkPaperBright = inkRatio(gray, bw, (x, y) => !barY(y) && x < W * 0.3);
  const inkPaperShadow = inkRatio(gray, bw, (x, y) => !barY(y) && x > W * 0.7);
  check('no blackening on bright paper', inkPaperBright < 0.01, `noise ${(inkPaperBright * 100).toFixed(2)}%`);
  check('shadow stays white (no black blob)', inkPaperShadow < 0.01, `shadow noise ${(inkPaperShadow * 100).toFixed(2)}%`);

  // A flat page with no shadow must be perfectly clean outside text.
  const clean = makeGray(W, H, 235);
  drawTextLines(clean, quadFromRect(0, 0, W, H), 14, 60);
  const bwClean = binarizeGray(clean);
  const inkCleanPaper = inkRatio(clean, bwClean, (x, y) => !barY(y));
  check('clean page stays white outside text', inkCleanPaper < 0.01, `noise ${(inkCleanPaper * 100).toFixed(2)}%`);

  return failed;
}

// ---- Run everything --------------------------------------------------------------

async function main() {
  let failed = 0;
  failed += runDetector('CV', detectQuadCore);
  failed += await (async () => {
    let f = 0;
    for (const s of scenarios) {
      const { gray, truth } = s.build(W, H);
      const result = await detectQuadOpenCV(grayToRgba(gray));
      const resQuad = result ? orderQuad(result) : null;
      if (s.expectNull) {
        if (resQuad) {
          f++;
          console.log(`FAIL  [OpenCV] ${s.name}: expected null but got corners ${JSON.stringify(resQuad)}`);
        } else {
          console.log(`PASS  [OpenCV] ${s.name}`);
        }
        continue;
      }
      if (!resQuad || !truth) {
        f++;
        console.log(`FAIL  [OpenCV] ${s.name}: detection returned null`);
        continue;
      }
      const err = cornerError(resQuad, truth);
      const ok = err <= s.maxMean;
      if (!ok) f++;
      console.log(`${ok ? 'PASS' : 'FAIL'}  [OpenCV] ${s.name}: mean corner error ${err.toFixed(2)}px (limit ${s.maxMean}px)`);
    }
    return f;
  })();
  failed += runBinarize();

  console.log(failed === 0 ? '\nAll scenarios passed.' : `\n${failed} check(s) FAILED.`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
