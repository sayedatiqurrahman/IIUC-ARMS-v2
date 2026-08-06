// Regression test for the document-quad detector (lib/image-utils.ts).
//
// Builds synthetic grayscale "camera frames" — a paper quadrilateral on a
// background, with text lines, distractors, low contrast, rotation, etc. — and
// verifies detectQuadCore recovers the paper corners accurately.
//
// Run:  npx tsc lib/image-utils.ts scripts/detection-test.ts
//         --outDir .tmp-detection-test --module commonjs --target es2020 --skipLibCheck
//       node .tmp-detection-test/scripts/detection-test.js
//
// Exits non-zero if any scenario fails.

import { detectQuadCore, orderQuad, type GrayImage, type Point, type Quad } from '../lib/image-utils';

interface Scenario {
  name: string;
  build: (w: number, h: number) => { gray: GrayImage; truth: Quad | null };
  maxMean: number; // max allowed mean corner error (px)
  expectNull?: boolean;
}

function makeGray(w: number, h: number, fill: number): GrayImage {
  const data = new Uint8ClampedArray(w * h);
  for (let i = 0; i < data.length; i++) data[i] = fill;
  return { data, w, h };
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
    name: 'Off-center paper + background table edge',
    maxMean: 5,
    build: (w, h) => {
      const gray = makeGray(w, h, 85);
      // Bright horizontal band across the top that touches the borders — a
      // classic false-positive that must be skipped by interior-only search.
      for (let y = 0; y < 120; y++) for (let x = 0; x < w; x++) gray.data[y * w + x] = 215;
      const truth = quadFromRect(80, 220, 520, 460);
      fillQuad(gray, truth, 238);
      drawTextLines(gray, truth, 12, 50);
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

let failed = 0;
for (const s of scenarios) {
  const { gray, truth } = s.build(W, H);
  const result = detectQuadCore(gray);
  const resQuad = result ? orderQuad(result) : null;

  if (s.expectNull) {
    if (resQuad) {
      failed++;
      console.log(`FAIL  ${s.name}: expected null but got corners ${JSON.stringify(resQuad)}`);
    } else {
      console.log(`PASS  ${s.name}`);
    }
    continue;
  }

  if (!resQuad || !truth) {
    failed++;
    console.log(`FAIL  ${s.name}: detection returned null (no document found)`);
    continue;
  }

  const err = cornerError(resQuad, truth);
  const ok = err <= s.maxMean;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${s.name}: mean corner error ${err.toFixed(2)}px (limit ${s.maxMean}px)`);
}

console.log(failed === 0 ? `\nAll ${scenarios.length} scenarios passed.` : `\n${failed} scenario(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
