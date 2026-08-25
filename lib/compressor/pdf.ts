'use client';

// PDF compression via pdf-lib (in-place JPEG recompression).
// Raster-based compression (pdf.js) was removed for lightweight viewing.
// optimizePdf still works for recompressing embedded JPEG images.

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
