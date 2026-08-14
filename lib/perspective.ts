// Color-preserving perspective crop for the document scanner.
// The eduone-scanner-sdk binarizes every crop (hard adaptive threshold) before
// returning it, which is why the app's filter modes never visibly changed the
// paper. This performs the same 4-corner warp but keeps the page in full
// colour, so the app's own filters (Original / B&W / Enhance / Balance) can
// actually take effect on the result.

export interface NormPoint {
  x: number;
  y: number;
}

function gaussSolve(A: number[][], B: number[]): number[] {
  const n = B.length;
  const M = A.map((row, i) => [...row, B[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) continue;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const piv = M[col][col];
    for (let j = col; j <= n; j++) M[col][j] /= piv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let j = col; j <= n; j++) M[r][j] -= f * M[col][j];
    }
  }
  return M.map((row) => row[n]);
}

// 3x3 matrix (row-major, last element = 1) mapping src -> dst.
function buildHomography(src: number[], dst: number[]): number[] | null {
  const A: number[][] = [];
  const B: number[] = [];
  for (let i = 0; i < 4; i++) {
    const sx = src[i * 2];
    const sy = src[i * 2 + 1];
    const dx = dst[i * 2];
    const dy = dst[i * 2 + 1];
    A.push([sx, sy, 1, 0, 0, 0, -sx * dx, -sy * dx]);
    A.push([0, 0, 0, sx, sy, 1, -sx * dy, -sy * dy]);
    B.push(dx, dy);
  }
  const h = gaussSolve(A, B);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function mat3Inverse(m: number[]): number[] | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  return [
    (e * i - f * h) * inv,
    (c * h - b * i) * inv,
    (b * f - c * e) * inv,
    (f * g - d * i) * inv,
    (a * i - c * g) * inv,
    (c * d - a * f) * inv,
    (d * h - e * g) * inv,
    (b * g - a * h) * inv,
    (a * e - b * d) * inv,
  ];
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

export async function warpPerspectiveColor(
  dataUrl: string,
  corners: NormPoint[]
): Promise<string> {
  if (!corners || corners.length < 4) throw new Error('Missing crop corners');
  const img = await loadImage(dataUrl);
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const [p0, p1, p2, p3] = corners;
  const sx0 = p0.x * W;
  const sy0 = p0.y * H;
  const sx1 = p1.x * W;
  const sy1 = p1.y * H;
  const sx2 = p2.x * W;
  const sy2 = p2.y * H;
  const sx3 = p3.x * W;
  const sy3 = p3.y * H;

  const len = (ax: number, ay: number, bx: number, by: number) =>
    Math.hypot(bx - ax, by - ay);
  const quadW = (len(sx0, sy0, sx1, sy1) + len(sx3, sy3, sx2, sy2)) / 2;
  const quadH = (len(sx0, sy0, sx3, sy3) + len(sx1, sy1, sx2, sy2)) / 2;
  if (quadW < 8 || quadH < 8) throw new Error('Crop area is too small');

  const MAX = 1800;
  let outW: number;
  let outH: number;
  if (quadW >= quadH) {
    outW = MAX;
    outH = Math.max(1, Math.round((MAX * quadH) / quadW));
  } else {
    outH = MAX;
    outW = Math.max(1, Math.round((MAX * quadW) / quadH));
  }

  const src = [sx0, sy0, sx1, sy1, sx2, sy2, sx3, sy3];
  const dst = [0, 0, outW, 0, outW, outH, 0, outH];
  const M = buildHomography(src, dst);
  if (!M) throw new Error('Could not compute perspective crop');
  const Minv = mat3Inverse(M);
  if (!Minv) throw new Error('Could not compute perspective crop');

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = W;
  srcCanvas.height = H;
  const srcCtx = srcCanvas.getContext('2d');
  if (!srcCtx) throw new Error('Canvas not supported');
  srcCtx.drawImage(img, 0, 0);
  const srcData = srcCtx.getImageData(0, 0, W, H).data;

  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const denom = Minv[6] * x + Minv[7] * y + Minv[8];
      const u = (Minv[0] * x + Minv[1] * y + Minv[2]) / denom;
      const v = (Minv[3] * x + Minv[4] * y + Minv[5]) / denom;
      const o = (y * outW + x) * 4;
      out[o] = 255;
      out[o + 1] = 255;
      out[o + 2] = 255;
      out[o + 3] = 255;
      if (u >= 0 && v >= 0 && u <= W - 1 && v <= H - 1) {
        const x0 = Math.floor(u);
        const y0 = Math.floor(v);
        const x1 = Math.min(x0 + 1, W - 1);
        const y1 = Math.min(y0 + 1, H - 1);
        const fx = u - x0;
        const fy = v - y0;
        const i00 = (y0 * W + x0) * 4;
        const i10 = (y0 * W + x1) * 4;
        const i01 = (y1 * W + x0) * 4;
        const i11 = (y1 * W + x1) * 4;
        for (let c = 0; c < 3; c++) {
          const top = srcData[i00 + c] * (1 - fx) + srcData[i10 + c] * fx;
          const bot = srcData[i01 + c] * (1 - fx) + srcData[i11 + c] * fx;
          out[o + c] = top * (1 - fy) + bot * fy;
        }
      }
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.putImageData(new ImageData(out, outW, outH), 0, 0);
  return canvas.toDataURL('image/jpeg', 0.92);
}
