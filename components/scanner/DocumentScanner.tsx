'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { buildSearchablePdf } from '@/lib/ocr';
import { showToast } from '@/lib/utils';
import {
  applyFilter,
  FILTER_LABELS,
  type FilterMode,
} from '@/lib/image-enhance';
import { warpPerspectiveColor, type NormPoint } from '@/lib/perspective';
import type { Point2D } from 'eduone-scanner-sdk';

// The scanner is powered by the low-level `DocumentScanner` class of
// eduone-scanner-sdk (OpenCV.js + ONNX detection model in a Web Worker). We
// build our OWN UI on top of it instead of using the SDK's startUI overlay,
// because the SDK review screen is white/orange and its warp always hard-
// binarizes the crop (so filter modes never changed the paper). Here the whole
// capture / crop / review flow matches the ARMS dark theme, and the crop is
// done colour-preserving so the app's filter modes visibly take effect.

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

const SCANNER_CONTAINER_ID = 'arms-scanner-container';

const DEFAULT_CORNERS: NormPoint[] = [
  { x: 0.15, y: 0.15 },
  { x: 0.85, y: 0.15 },
  { x: 0.85, y: 0.85 },
  { x: 0.15, y: 0.85 },
];

type ScanMode = 'auto' | 'manual';
type Phase = 'capture' | 'crop' | 'review';

interface PageItem {
  id: string;
  raw: string;
}

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

export default function DocumentScanner({
  onDone,
  onCancel,
  onResult,
  docOnly = false,
  ocrEnabled = false,
  filterMode = 'enhance',
}: DocumentScannerProps) {
  // Keep the latest callbacks/options reachable from the SDK's async callbacks
  // without re-launching the scanner on every parent re-render.
  const cbRef = useRef({ onDone, onCancel, onResult, docOnly, ocrEnabled });
  cbRef.current = { onDone, onCancel, onResult, docOnly, ocrEnabled };

  const [phase, setPhase] = useState<Phase>('capture');
  const [mode, setMode] = useState<ScanMode>('auto');
  const [filter, setFilter] = useState<FilterMode>(filterMode);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [rawImageUrl, setRawImageUrl] = useState<string | null>(null);
  const [corners, setCorners] = useState<NormPoint[]>(DEFAULT_CORNERS);
  const [busy, setBusy] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const [engineState, setEngineState] = useState('Preparing scanner engine…');
  const [error, setError] = useState<string | null>(null);
  const [torch, setTorch] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraIdx, setCameraIdx] = useState(0);

  const scannerRef = useRef<any>(null);
  const phaseRef = useRef<Phase>('capture');
  phaseRef.current = phase;
  const busyRef = useRef(false);
  busyRef.current = busy;

  const [filteredMap, setFilteredMap] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const mod = await import('eduone-scanner-sdk');
        if (!alive) return;
        const sc = new mod.DocumentScanner({
          containerId: SCANNER_CONTAINER_ID,
          autoCapture: true,
          assetsPath: SCANNER_ASSETS,
          modelType: 'lcnet',
          onEngineReady: () => {
            if (!alive) return;
            setEngineReady(true);
            setEngineState('Camera ready');
            setTorchSupported(!!sc.hasTorchSupport());
            sc.fetchAvailableCameras()
              .then((devs: MediaDeviceInfo[]) => {
                if (alive) setCameras(devs);
              })
              .catch(() => {});
          },
          onProgress: (msg: string) => {
            if (alive) setEngineState(msg || 'Preparing scanner engine…');
          },
          onError: (err: Error) => {
            if (alive) setError(err?.message || 'Scanner failed');
          },
          onRawCapture: (rawUrl: string, rawCorners: Point2D[]) => {
            if (!alive || phaseRef.current !== 'capture' || busyRef.current) return;
            const norm = (rawCorners || []).map((c) => ({
              x: Math.max(0, Math.min(1, c.x)),
              y: Math.max(0, Math.min(1, c.y)),
            }));
            setRawImageUrl(rawUrl);
            setCorners(norm.length === 4 ? norm : DEFAULT_CORNERS);
            setPhase('crop');
          },
        });
        scannerRef.current = sc;
        await sc.start();
        if (alive) setTorchSupported(sc.hasTorchSupport());
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || 'Scanner failed to start');
      }
    })();

    return () => {
      alive = false;
      try {
        scannerRef.current?.stop?.();
      } catch {}
      scannerRef.current = null;
    };
    // Launch exactly once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recompute filtered previews whenever pages or the active filter change.
  useEffect(() => {
    let alive = true;
    (async () => {
      const entries = await Promise.all(
        pages.map(async (p) => [p.id, await applyFilter(p.raw, filter)] as const)
      );
      if (alive) setFilteredMap(Object.fromEntries(entries));
    })();
    return () => {
      alive = false;
    };
  }, [pages, filter]);

  const resumeScanner = useCallback(() => {
    const sc = scannerRef.current;
    if (!sc) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        sc.resume(SCANNER_CONTAINER_ID).catch((e: any) => {
          if (phaseRef.current === 'capture') setError(e?.message || 'Camera failed');
        });
      });
    });
  }, []);

  const handleClose = () => {
    try {
      scannerRef.current?.stop?.();
    } catch {}
    cbRef.current.onCancel();
  };

  const handleMode = (m: ScanMode) => {
    setMode(m);
    scannerRef.current?.setAutoCapture?.(m === 'auto');
  };

  const handleShutter = () => {
    const sc = scannerRef.current;
    if (!sc || busyRef.current || !engineReady) return;
    try {
      const { dataUrl, corners: c } = sc.captureRawFrame();
      sc.pause();
      const norm = (c || []).map((p: Point2D) => ({
        x: Math.max(0, Math.min(1, p.x)),
        y: Math.max(0, Math.min(1, p.y)),
      }));
      setRawImageUrl(dataUrl);
      setCorners(norm.length === 4 ? norm : DEFAULT_CORNERS);
      setPhase('crop');
    } catch {
      showToast('Capture failed, try again', 'error');
    }
  };

  const handleCropConfirm = async () => {
    if (!rawImageUrl || busyRef.current) return;
    setBusy(true);
    try {
      const warped = await warpPerspectiveColor(rawImageUrl, corners);
      setPages((prev) => [
        ...prev,
        { id: Math.random().toString(36).slice(2), raw: warped },
      ]);
    } catch (e: any) {
      showToast(e?.message || 'Crop failed, try again', 'error');
    } finally {
      setBusy(false);
      setRawImageUrl(null);
      setPhase('capture');
      resumeScanner();
    }
  };

  const handleCropCancel = () => {
    setRawImageUrl(null);
    setPhase('capture');
    resumeScanner();
  };

  const handleOpenReview = () => {
    try {
      scannerRef.current?.pause?.();
    } catch {}
    setPhase('review');
  };

  const handleBackToCapture = () => {
    setPhase('capture');
    resumeScanner();
  };

  const handleDeletePage = (id: string) => {
    setPages((prev) => prev.filter((p) => p.id !== id));
  };

  const handleMovePage = (idx: number, dir: -1 | 1) => {
    setPages((prev) => {
      const next = [...prev];
      const to = idx + dir;
      if (to < 0 || to >= next.length) return prev;
      [next[idx], next[to]] = [next[to], next[idx]];
      return next;
    });
  };

  const handleUpload = async () => {
    if (busyRef.current || !pages.length) return;
    setBusy(true);
    try {
      const { onDone, onCancel, onResult, docOnly, ocrEnabled } = cbRef.current;
      const converted = await Promise.all(
        pages.map(async (p) => {
          const url = filteredMap[p.id] ?? p.raw;
          const { blob } = dataUrlToBlob(url);
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
      cbRef.current.onCancel();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col overflow-hidden bg-[#05070d] text-white"
      style={{ minHeight: '100dvh' }}
    >
      {error ? (
        <ErrorScreen message={error} onClose={handleClose} />
      ) : phase === 'crop' && rawImageUrl ? (
        <CropScreen
          imageUrl={rawImageUrl}
          initialCorners={corners}
          busy={busy}
          pageCount={pages.length}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      ) : phase === 'review' ? (
        <ReviewScreen
          pages={pages}
          filteredMap={filteredMap}
          filter={filter}
          busy={busy}
          onFilter={setFilter}
          onDelete={handleDeletePage}
          onMove={handleMovePage}
          onBack={handleBackToCapture}
          onUpload={handleUpload}
        />
      ) : (
        <CaptureScreen
          containerId={SCANNER_CONTAINER_ID}
          mode={mode}
          filter={filter}
          pages={pages}
          filteredMap={filteredMap}
          engineReady={engineReady}
          engineState={engineState}
          torch={torch}
          torchSupported={torchSupported}
          cameras={cameras}
          cameraIdx={cameraIdx}
          busy={busy}
          onMode={handleMode}
          onFilter={setFilter}
          onTorch={async () => {
            const sc = scannerRef.current;
            if (!sc || !engineReady) return;
            const next = !torch;
            setTorch(next);
            const ok = await sc.setTorch(next);
            if (!ok) setTorch(!next);
          }}
          onSwitchCamera={async () => {
            const sc = scannerRef.current;
            if (!sc || !cameras.length) return;
            const next = (cameraIdx + 1) % cameras.length;
            setCameraIdx(next);
            setTorch(false);
            setTorchSupported(false);
            try {
              await sc.switchCamera(cameras[next].deviceId);
              setTorchSupported(sc.hasTorchSupport());
            } catch {}
          }}
          onShutter={handleShutter}
          onOpenReview={handleOpenReview}
          onClose={handleClose}
        />
      )}
    </div>
  );
}

function ErrorScreen({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 p-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#ef4444]/15 text-3xl">
        ⚠️
      </div>
      <p className="max-w-sm text-center text-sm text-[#cbd5e1]">
        {message || 'Scanner failed to start.'}
      </p>
      <p className="max-w-sm text-center text-xs text-[#64748b]">
        Make sure the camera is available and you grant permission.
      </p>
      <button
        onClick={onClose}
        className="rounded-lg bg-[#22c55e] px-5 py-2 text-sm font-semibold text-[#04140b] hover:bg-[#16a34a]"
      >
        Close
      </button>
    </div>
  );
}

interface CaptureScreenProps {
  containerId: string;
  mode: ScanMode;
  filter: FilterMode;
  pages: PageItem[];
  filteredMap: Record<string, string>;
  engineReady: boolean;
  engineState: string;
  torch: boolean;
  torchSupported: boolean;
  cameras: MediaDeviceInfo[];
  cameraIdx: number;
  busy: boolean;
  onMode: (m: ScanMode) => void;
  onFilter: (f: FilterMode) => void;
  onTorch: () => void;
  onSwitchCamera: () => void;
  onShutter: () => void;
  onOpenReview: () => void;
  onClose: () => void;
}

function CaptureScreen({
  containerId,
  mode,
  filter,
  pages,
  filteredMap,
  engineReady,
  engineState,
  torch,
  torchSupported,
  cameras,
  cameraIdx,
  busy,
  onMode,
  onFilter,
  onTorch,
  onSwitchCamera,
  onShutter,
  onOpenReview,
  onClose,
}: CaptureScreenProps) {
  const lastPage = pages[pages.length - 1];
  const thumbUrl = lastPage ? filteredMap[lastPage.id] ?? lastPage.raw : null;

  return (
    <div className="relative flex-1 overflow-hidden">
      {/* SDK renders the live camera feed + detection overlay into this box. */}
      <div id={containerId} className="absolute inset-0 pointer-events-none" />

      {!engineReady && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#05070d]/85 backdrop-blur-sm">
          <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-[#22c55e]/25 border-t-[#22c55e]" />
          <p className="text-sm text-[#94a3b8]">{engineState || 'Preparing scanner engine…'}</p>
        </div>
      )}

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 p-4">
        <button
          onClick={onClose}
          className="rounded-lg border border-white/10 bg-[#0b101c]/70 px-3 py-1.5 text-sm text-[#cbd5e1] backdrop-blur hover:bg-[#0b101c]"
        >
          ✕ Close
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-[#22c55e]">Document Scanner</p>
          <p className="text-xs text-[#64748b]">
            Place the page inside the frame — it captures automatically
          </p>
        </div>
        <div className="w-[76px]" />
      </div>

      {/* Auto / Manual mode tabs */}
      <div className="absolute left-1/2 top-16 z-20 flex -translate-x-1/2 overflow-hidden rounded-full border border-white/10 bg-[#0b101c]/80 backdrop-blur">
        {(['auto', 'manual'] as ScanMode[]).map((m) => (
          <button
            key={m}
            onClick={() => onMode(m)}
            disabled={busy}
            className={`px-4 py-1.5 text-xs font-semibold transition-colors ${
              mode === m ? 'bg-[#22c55e] text-[#04140b]' : 'text-white/60 hover:text-white'
            } disabled:opacity-50`}
          >
            {m === 'auto' ? 'Auto Scan' : 'Manual'}
          </button>
        ))}
      </div>

      {/* Filter modes — visible inside the scanner so the paper style is clear. */}
      <div className="absolute bottom-36 left-1/2 z-20 flex -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 rounded-full border border-white/10 bg-[#0b101c]/85 px-2.5 py-1.5 backdrop-blur">
        {(Object.keys(FILTER_LABELS) as FilterMode[]).map((f) => (
          <button
            key={f}
            onClick={() => onFilter(f)}
            disabled={busy}
            className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
              filter === f ? 'bg-[#22c55e] text-[#04140b]' : 'text-white/65 hover:bg-white/10 hover:text-white'
            } disabled:opacity-50`}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      {/* Right-side controls: torch + camera flip */}
      <div className="absolute right-4 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-3">
        {torchSupported && (
          <button
            onClick={onTorch}
            title="Torch"
            className={`flex h-11 w-11 items-center justify-center rounded-full border text-lg backdrop-blur transition-colors ${
              torch
                ? 'border-[#22c55e] bg-[#22c55e] text-[#04140b]'
                : 'border-white/15 bg-[#0b101c]/80 text-white/70 hover:text-white'
            }`}
          >
            🔦
          </button>
        )}
        {cameras.length > 1 && (
          <button
            onClick={onSwitchCamera}
            title="Switch camera"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-[#0b101c]/80 text-lg text-white/70 backdrop-blur hover:text-white"
          >
            🔄
          </button>
        )}
      </div>

      {/* Shutter (manual mode) */}
      <div className="absolute bottom-10 left-1/2 z-20 flex -translate-x-1/2 items-center gap-6">
        <div className="flex flex-col items-center">
          <button
            onClick={onShutter}
            disabled={!engineReady || busy || mode !== 'manual'}
            className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-[5px] border-white/85 bg-transparent transition-transform active:scale-95 disabled:opacity-40"
            aria-label="Capture"
          >
            <span className="h-14 w-14 rounded-full bg-[#22c55e] shadow-[0_0_24px_rgba(34,197,94,0.55)]" />
          </button>
          {mode === 'manual' && (
            <p className="mt-2 text-[11px] text-white/50">Tap to capture</p>
          )}
        </div>
      </div>

      {/* Last-page thumbnail -> opens review */}
      <button
        onClick={onOpenReview}
        disabled={!pages.length}
        className="absolute bottom-8 right-5 z-20 flex items-center gap-2 rounded-xl border border-white/10 bg-[#0b101c]/85 p-2 backdrop-blur transition-opacity disabled:opacity-40"
        title="Review pages"
      >
        {thumbUrl ? (
          <>
            <img src={thumbUrl} alt="last page" className="h-12 w-9 rounded-md object-cover" />
            <span className="pr-1 text-xs font-semibold text-white">{pages.length}</span>
          </>
        ) : (
          <span className="flex h-12 w-9 items-center justify-center rounded-md border border-dashed border-white/20 text-[10px] text-white/40">
            0
          </span>
        )}
      </button>

      {mode === 'auto' && (
        <p className="absolute bottom-2 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap text-[11px] text-white/40">
          Auto mode: hold the page steady — it scans on its own
        </p>
      )}
    </div>
  );
}

interface CropScreenProps {
  imageUrl: string;
  initialCorners: NormPoint[];
  busy: boolean;
  pageCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

function CropScreen({
  imageUrl,
  initialCorners,
  busy,
  pageCount,
  onConfirm,
  onCancel,
}: CropScreenProps) {
  const imgWrapRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [corners, setCorners] = useState<NormPoint[]>(initialCorners);
  const dragIdx = useRef<number | null>(null);

  useEffect(() => {
    const measure = () => {
      const el = imgWrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setBox({ w: r.width, h: r.height });
    };
    measure();
    window.addEventListener('resize', measure);
    const ro = new ResizeObserver(measure);
    if (imgWrapRef.current) ro.observe(imgWrapRef.current);
    return () => {
      window.removeEventListener('resize', measure);
      ro.disconnect();
    };
  }, []);

  const setCorner = (idx: number, cx: number, cy: number) => {
    const el = imgWrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0) return;
    const nx = Math.max(0, Math.min(1, (cx - r.left) / r.width));
    const ny = Math.max(0, Math.min(1, (cy - r.top) / r.height));
    setCorners((prev) => prev.map((c, i) => (i === idx ? { x: nx, y: ny } : c)));
  };

  const onPointerDown = (idx: number) => (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragIdx.current = idx;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const idx = dragIdx.current;
    if (idx === null) return;
    setCorner(idx, e.clientX, e.clientY);
  };
  const onPointerUp = () => {
    dragIdx.current = null;
  };

  const pts = corners.map((c) => `${c.x * box.w},${c.y * box.h}`).join(' ');

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4">
        <button
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg border border-white/10 bg-[#0b101c] px-3 py-1.5 text-sm text-[#cbd5e1] hover:bg-[#131a2b] disabled:opacity-40"
        >
          ✕ Cancel
        </button>
        <p className="text-sm text-[#cbd5e1]">Drag the corners to fit the page</p>
        <button
          onClick={onConfirm}
          disabled={busy}
          className="rounded-lg bg-[#22c55e] px-4 py-1.5 text-sm font-semibold text-[#04140b] hover:bg-[#16a34a] disabled:opacity-50"
        >
          {busy ? 'Cropping…' : `✓ Add${pageCount ? ` page ${pageCount + 1}` : ''}`}
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-hidden px-4 pb-4">
        <div ref={imgWrapRef} className="relative select-none">
          <img
            src={imageUrl}
            alt="captured page"
            draggable={false}
            className="block max-h-[calc(100dvh-150px)] max-w-full rounded-md"
          />
          {box.w > 0 && (
            <>
              <svg
                className="pointer-events-none absolute inset-0"
                width={box.w}
                height={box.h}
              >
                <polygon
                  points={pts}
                  fill="rgba(34,197,94,0.10)"
                  stroke="#22c55e"
                  strokeWidth={2}
                />
              </svg>
              {corners.map((c, i) => (
                <button
                  key={i}
                  onPointerDown={onPointerDown(i)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  className="absolute z-10 h-7 w-7 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-[3px] border-white bg-[#22c55e] shadow-[0_0_0_3px_rgba(34,197,94,0.35)] active:cursor-grabbing"
                  style={{ left: c.x * box.w, top: c.y * box.h }}
                  aria-label={`corner ${i + 1}`}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface ReviewScreenProps {
  pages: PageItem[];
  filteredMap: Record<string, string>;
  filter: FilterMode;
  busy: boolean;
  onFilter: (f: FilterMode) => void;
  onDelete: (id: string) => void;
  onMove: (idx: number, dir: -1 | 1) => void;
  onBack: () => void;
  onUpload: () => void;
}

function ReviewScreen({
  pages,
  filteredMap,
  filter,
  busy,
  onFilter,
  onDelete,
  onMove,
  onBack,
  onUpload,
}: ReviewScreenProps) {
  const [zoom, setZoom] = useState<string | null>(null);
  const pageCount = pages.length;

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 p-4">
        <button
          onClick={onBack}
          disabled={busy}
          className="rounded-lg border border-white/10 bg-[#0b101c] px-3 py-1.5 text-sm text-[#cbd5e1] hover:bg-[#131a2b] disabled:opacity-40"
        >
          ← Add more
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-[#22c55e]">
            {pageCount} page{pageCount === 1 ? '' : 's'} scanned
          </p>
          <p className="text-xs text-[#64748b]">Reorder or remove pages, then upload</p>
        </div>
        <button
          onClick={onUpload}
          disabled={busy || !pageCount}
          className="rounded-lg bg-[#22c55e] px-4 py-1.5 text-sm font-semibold text-[#04140b] hover:bg-[#16a34a] disabled:opacity-50"
        >
          {busy ? 'Processing…' : 'Upload'}
        </button>
      </div>

      {/* Filter row — live preview updates as you switch. */}
      <div className="flex flex-wrap items-center justify-center gap-1.5 px-4 pb-3">
        {(Object.keys(FILTER_LABELS) as FilterMode[]).map((f) => (
          <button
            key={f}
            onClick={() => onFilter(f)}
            disabled={busy}
            className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
              filter === f
                ? 'bg-[#22c55e] text-[#04140b]'
                : 'border border-white/10 text-white/65 hover:bg-white/10 hover:text-white'
            } disabled:opacity-50`}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      {/* Page grid */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {!pageCount ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-white/40">
            <p className="text-4xl">📄</p>
            <p className="text-sm">No pages yet — go back and scan</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {pages.map((p, i) => {
              const url = filteredMap[p.id] ?? p.raw;
              return (
                <div
                  key={p.id}
                  className="group relative overflow-hidden rounded-xl border border-white/10 bg-[#0b101c]"
                >
                  <button onClick={() => setZoom(url)} className="block w-full">
                    <img
                      src={url}
                      alt={`page ${i + 1}`}
                      className="aspect-[3/4] w-full object-cover"
                    />
                  </button>
                  <div className="absolute left-2 top-2 rounded-md bg-[#05070d]/80 px-2 py-0.5 text-xs font-semibold text-white">
                    {i + 1}
                  </div>
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-[#05070d]/90 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => onMove(i, -1)}
                      disabled={i === 0}
                      className="rounded-md bg-white/10 px-2.5 py-1 text-xs text-white hover:bg-white/20 disabled:opacity-30"
                    >
                      ←
                    </button>
                    <button
                      onClick={() => onDelete(p.id)}
                      className="rounded-md bg-[#ef4444]/80 px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#ef4444]"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => onMove(i, 1)}
                      disabled={i === pageCount - 1}
                      className="rounded-md bg-white/10 px-2.5 py-1 text-xs text-white hover:bg-white/20 disabled:opacity-30"
                    >
                      →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Zoom preview */}
      {zoom && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-[#05070d]/90 p-6"
          onClick={() => setZoom(null)}
        >
          <img
            src={zoom}
            alt="preview"
            className="max-h-full max-w-full rounded-md object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setZoom(null)}
            className="absolute right-4 top-4 rounded-lg border border-white/10 bg-[#0b101c] px-3 py-1.5 text-sm text-[#cbd5e1] hover:bg-[#131a2b]"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
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
