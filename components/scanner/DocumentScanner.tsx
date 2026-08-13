'use client';

import { useEffect, useRef } from 'react';
import { buildSearchablePdf } from '@/lib/ocr';
import { showToast } from '@/lib/utils';
import { applyFilter, type FilterMode } from '@/lib/image-enhance';

// The camera scanner is now powered by `eduone-scanner-sdk`, which runs OpenCV.js
// + an ONNX document-detection model in a Web Worker and renders its own
// fullscreen overlay (live framing, auto-capture, perspective crop, review grid
// and page reordering). This component is a thin bridge: it launches the SDK
// overlay and converts the cropped page DataURLs it returns into the same
// onResult/onDone contract the upload flow and the standalone ScannerTool expect.

export interface CapturedPage {
  blob: Blob;
  width: number;
  height: number;
  thumb: string;
  preview: string;
  src: string;
  quad: unknown;
}

interface DocumentScannerProps {
  onDone: (pages: CapturedPage[]) => void;
  onCancel: () => void;
  onResult?: (file: File, usedOcr: boolean) => void;
  maxPages?: number;
  // When true the scan is emitted as a PDF even for a single page (e.g. Notes).
  docOnly?: boolean;
  // Build the multi-page output as a searchable PDF via OCR. Defaults to false.
  ocrEnabled?: boolean;
  // Post-capture filter applied to every scanned page. Defaults to 'enhance',
  // which sharpens + boosts contrast so small text stays readable.
  filterMode?: FilterMode;
}

// Base URL of the OpenCV.js / ONNX Runtime / detection-model assets the SDK
// worker loads. Overridable per-environment; defaults to the hosted CDN.
const SCANNER_ASSETS =
  process.env.NEXT_PUBLIC_SCANNER_ASSETS_URL ||
  'https://fonixedugrading.blob.core.windows.net/scanner-assets/';

function pad(n: number) {
  return String(n).padStart(2, '0');
}
function stamp() {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function dataUrlToBlob(dataUrl: string): { blob: Blob; mime: string } {
  const [head, b64] = dataUrl.split(',');
  const mime = (head.match(/data:(.*?);base64/) || [])[1] || 'image/jpeg';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return { blob: new Blob([arr], { type: mime }), mime };
}

function blobSize(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = URL.createObjectURL(blob);
  });
}

export default function DocumentScanner({ onDone, onCancel, onResult, docOnly = false, ocrEnabled = false, filterMode = 'enhance' }: DocumentScannerProps) {
  const startedRef = useRef(false);
  const stopRef = useRef<(() => void) | null>(null);

  // Keep the latest callbacks/options reachable from the SDK's async callbacks
  // without re-launching the scanner on every parent re-render.
  const cbRef = useRef({ onDone, onCancel, onResult, docOnly, ocrEnabled, filterMode });
  cbRef.current = { onDone, onCancel, onResult, docOnly, ocrEnabled, filterMode };

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        const { DocumentScanner: EduOneScanner } = await import('eduone-scanner-sdk');
        if (cancelled) return;

        const ui = EduOneScanner.startUI({
          assetsPath: SCANNER_ASSETS,
          logoHTML: '<span style="color:#fff;font-weight:700;font-size:0.95rem">IIUC-ARMS</span>',
          // Skip the Sinhala "Scan Guidelines" intro and go straight to capture.
          skipGuidelines: true,
          onComplete: async (pages: string[]) => {
            const { onDone, onCancel, onResult, docOnly, ocrEnabled, filterMode } = cbRef.current;
            try {
              if (!pages.length) {
                onDone([]);
                return;
              }
              const converted = await Promise.all(
                pages.map(async (url) => {
                  const filteredUrl = await applyFilter(url, filterMode || 'enhance');
                  const { blob } = dataUrlToBlob(filteredUrl);
                  const { width, height } = await blobSize(blob);
                  return { blob, width, height };
                })
              );

              if (converted.length === 1 && !docOnly) {
                const { blob } = converted[0];
                const file = new File([blob], `scan-${stamp()}.jpg`, { type: 'image/jpeg' });
                onResult?.(file, false);
                onDone([]);
                return;
              }

              const usedOcr = ocrEnabled;
              if (usedOcr) showToast('Building searchable PDF with OCR…', 'info');
              const file = await buildSearchablePdf(
                converted.map((c) => ({ blob: c.blob, width: c.width, height: c.height })),
                usedOcr,
                `scan-${stamp()}.pdf`
              );
              onResult?.(file, usedOcr);
              onDone([]);
            } catch (e: any) {
              showToast(e?.message || 'Failed to process scan', 'error');
              onCancel();
            }
          },
          onCancel: () => {
            cbRef.current.onCancel();
          },
        });
        stopRef.current = ui.stop;
      } catch (e: any) {
        showToast(e?.message || 'Scanner failed to start', 'error');
        cbRef.current.onCancel();
      }
    })();

    return () => {
      cancelled = true;
      try {
        stopRef.current?.();
      } catch {}
      stopRef.current = null;
      startedRef.current = false;
    };
    // Launch exactly once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

// Proactively preload the SDK's Web Worker + ONNX model so that when the user
// actually opens the scanner the heavy "Preparing Scanner Engine…" step is
// already done and capture starts near-instantly. Safe to call multiple times;
// it only warms once.
let warmedUp = false;
export function warmupScannerEngine() {
  if (typeof window === 'undefined' || warmedUp) return;
  warmedUp = true;
  import('eduone-scanner-sdk')
    .then(({ DocumentScanner: EduOneScanner }) => {
      try {
        EduOneScanner.warmUp(SCANNER_ASSETS, 'lcnet');
      } catch {
        warmedUp = false;
      }
    })
    .catch(() => {
      warmedUp = false;
    });
}

