'use client';

import { optimizePdf, compressPdf } from '@/lib/image-utils';
import { compressImageFile, optimizeArchive, isImageFile, isArchiveFile } from '@/lib/compressor/engines';

export interface CompressResult {
  file: File;
  saved: number; // bytes saved vs the original (0 when untouched)
}

// Best-effort client-side compression before upload. Images go through the
// format-specific engine (MozJPEG / lossless PNG / WebP / AVIF); PDFs are
// recompressed like iLovePDF (embedded-image pass, then rasterize fallback);
// Office / EPUB / ZIP containers are re-zipped and their embedded media is
// re-encoded. Anything that fails or doesn't get smaller is returned as-is
// (never upsized).
export async function compressUploadFile(file: File): Promise<CompressResult> {
  const name = file.name.toLowerCase();
  const original = file.size;

  // Compression is strictly best-effort: if any path stalls (pdf.js worker
  // startup, an oversized scan, a slow rezip) we must never leave the UI stuck
  // on "Compressing…" — the original file is returned after the cap so the
  // upload always proceeds.
  const capped = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
    Promise.race([p, new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms))]);

  try {
    if (isImageFile(name)) {
      const c = await capped(compressImageFile(file, 'recommended'), 20000, null);
      if (c) return { file: c, saved: Math.max(0, original - c.size) };
    }

    // Prefer recompressing embedded images (keeps text crisp, like iLovePDF);
    // fall back to rasterizing pages if there are no recompressible images.
    if (name.endsWith('.pdf') && original > 300 * 1024 && original <= 30 * 1024 * 1024) {
      const c = await capped(optimizePdf(file, { quality: 0.7, maxDim: 1600 }), 40000, null);
      if (c) return { file: c, saved: Math.max(0, original - c.size) };
      const c2 = await capped(compressPdf(file), 40000, null);
      if (c2) return { file: c2, saved: Math.max(0, original - c.size) };
    }

    // ZIP-based containers (Office Open XML, ODF, EPUB, raw ZIP, comic books).
    // Lossless re-zip + embedded-media re-encode — never damages the file.
    if (isArchiveFile(name) && original <= 25 * 1024 * 1024) {
      const c = await capped(optimizeArchive(file, 'recommended'), 15000, null);
      if (c) return { file: c, saved: Math.max(0, original - c.size) };
    }
  } catch {}

  return { file, saved: 0 };
}
