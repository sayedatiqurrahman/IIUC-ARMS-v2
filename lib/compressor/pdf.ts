'use client';

// PDF compression, kept on the main thread (it renders pages via pdf.js + a 2D
// canvas, which is awkward inside a nested worker). This mirrors what online
// tools do server-side with Ghostscript: first recompress embedded raster
// images in place (text/vectors stay crisp), then fall back to rasterising the
// whole document when there are no recompressible images (scanned PDFs). Never
// returns a larger file.

import { optimizePdf, compressPdf } from '@/lib/image-utils';
import type { CompressMode } from './engines';

const PDF_MODE_OPTS: Record<CompressMode, { optimize: { quality: number; maxDim: number }; raster: { qualities: number[]; maxWidth: number } }> = {
  recommended: { optimize: { quality: 0.8, maxDim: 2200 }, raster: { qualities: [0.8, 0.68], maxWidth: 2200 } },
  strong: { optimize: { quality: 0.68, maxDim: 1600 }, raster: { qualities: [0.68, 0.55], maxWidth: 1600 } },
  maximum: { optimize: { quality: 0.5, maxDim: 1100 }, raster: { qualities: [0.55, 0.4], maxWidth: 1100 } },
};

export async function compressPdfFile(file: File, mode: CompressMode): Promise<File | null> {
  const o = PDF_MODE_OPTS[mode];
  const optimized = await optimizePdf(file, o.optimize);
  if (optimized) return optimized;
  return compressPdf(file, o.raster);
}
