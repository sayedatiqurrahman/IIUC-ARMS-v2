'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  detectDocumentQuad,
  processFrame,
  canvasToBlob,
  orderQuad,
  type Quad,
  type Point,
  type ScanMode,
  MAX_DIM_DEFAULT,
} from '@/lib/image-utils';
import { buildSearchablePdf } from '@/lib/ocr';

interface CapturedPage {
  blob: Blob;
  width: number;
  height: number;
  thumb: string;
}

interface DocumentScannerProps {
  onDone: (pages: CapturedPage[]) => void;
  onCancel: () => void;
  onResult?: (file: File, usedOcr: boolean) => void;
  maxPages?: number;
}

const MAX_PAGES = 8;

export default function DocumentScanner({ onDone, onCancel, onResult, maxPages = MAX_PAGES }: DocumentScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<ScanMode>('bw');
  const [ocrEnabled, setOcrEnabled] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [pages, setPages] = useState<CapturedPage[]>([]);
  const [busy, setBusy] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');

  const quadRef = useRef<Quad | null>(null);
  const modeRef = useRef<ScanMode>('bw');
  modeRef.current = mode;

  // ---- Camera setup ----
  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }
      } catch {
        setError('Camera access denied or unavailable. Please allow camera permission.');
      }
    }
    start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, []);

  // ---- Edge detection loop (throttled) ----
  useEffect(() => {
    if (!ready) return;
    let lastDetect = 0;
    let disposed = false;

    function draw() {
      if (disposed) return;
      const video = videoRef.current;
      const overlay = overlayRef.current;
      if (video && overlay && video.readyState >= 2) {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (vw && vh) {
          const now = Date.now();
          if (now - lastDetect > 350) {
            lastDetect = now;
            const scale = Math.min(1, 400 / Math.max(vw, vh));
            const dw = Math.round(vw * scale);
            const dh = Math.round(vh * scale);
            const quad = detectDocumentQuad(video, dw, dh);
            if (quad) {
              quadRef.current = quad.map(p => ({ x: p.x / scale, y: p.y / scale })) as Quad;
            }
          }
        }
      }
      rafRef.current = requestAnimationFrame(draw);
    }
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      disposed = true;
      cancelAnimationFrame(rafRef.current);
    };
  }, [ready]);

  // ---- Overlay: draw quad + corner handles ----
  useEffect(() => {
    if (!ready) return;
    let disposed = false;
    function drawOverlay() {
      if (disposed) return;
      const video = videoRef.current;
      const overlay = overlayRef.current;
      if (video && overlay && video.readyState >= 2) {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const cssW = overlay.clientWidth;
        const cssH = overlay.clientHeight;
        if (vw && vh && cssW && cssH) {
          overlay.width = cssW * devicePixelRatio;
          overlay.height = cssH * devicePixelRatio;
          const ctx = overlay.getContext('2d')!;
          ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
          ctx.clearRect(0, 0, cssW, cssH);

          // Fit video into CSS box (contain)
          const scale = Math.min(cssW / vw, cssH / vh);
          const offX = (cssW - vw * scale) / 2;
          const offY = (cssH - vh * scale) / 2;

          const quad = quadRef.current;
          if (quad) {
            const pts = quad.map(p => ({ x: offX + p.x * scale, y: offY + p.y * scale }));
            ctx.strokeStyle = 'rgba(52, 211, 153, 0.9)';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.closePath();
            ctx.stroke();
            ctx.setLineDash([]);
            for (const p of pts) {
              ctx.fillStyle = '#fff';
              ctx.strokeStyle = '#34d399';
              ctx.lineWidth = 2.5;
              ctx.beginPath();
              ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
            }
          }
        }
      }
      requestAnimationFrame(drawOverlay);
    }
    const id = requestAnimationFrame(drawOverlay);
    return () => {
      disposed = true;
      cancelAnimationFrame(id);
    };
  }, [ready]);

  // ---- Drag corners to adjust ----
  const dragRef = useRef<{ idx: number; start: Point } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    if (!quadRef.current) return;
    const video = videoRef.current!;
    const rect = video.getBoundingClientRect();
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const scale = Math.min(rect.width / vw, rect.height / vh);
    const offX = (rect.width - vw * scale) / 2;
    const offY = (rect.height - vh * scale) / 2;
    const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    let best = -1;
    let bestDist = 30;
    quadRef.current.forEach((q, i) => {
      const sx = offX + q.x * scale;
      const sy = offY + q.y * scale;
      const d = Math.hypot(p.x - sx, p.y - sy);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    if (best >= 0) {
      dragRef.current = { idx: best, start: p };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag || !quadRef.current) return;
    const rect = videoRef.current!.getBoundingClientRect();
    const vw = videoRef.current!.videoWidth;
    const vh = videoRef.current!.videoHeight;
    const scale = Math.min(rect.width / vw, rect.height / vh);
    const offX = (rect.width - vw * scale) / 2;
    const offY = (rect.height - vh * scale) / 2;
    const np = { x: (e.clientX - rect.left - offX) / scale, y: (e.clientY - rect.top - offY) / scale };
    const quad = quadRef.current.map(p => ({ ...p }));
    quad[drag.idx] = { x: Math.max(0, Math.min(vw, np.x)), y: Math.max(0, Math.min(vh, np.y)) };
    quadRef.current = orderQuad(quad);
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  // ---- Capture ----
  const capture = useCallback(async () => {
    if (busy || pages.length >= maxPages) return;
    const video = videoRef.current;
    if (!video || !video.readyState) return;
    setCapturing(true);
    setProgressMsg('Processing...');
    try {
      const result = processFrame(video, quadRef.current, modeRef.current, MAX_DIM_DEFAULT);
      const blob = await canvasToBlob(result.canvas, 'image/jpeg', 0.9);
      const thumb = result.canvas.toDataURL('image/jpeg', 0.5);
      setPages(prev => [...prev, { blob, width: result.width, height: result.height, thumb }]);
      setProgressMsg('');
    } catch {
      setError('Failed to capture frame');
    }
    setCapturing(false);
  }, [busy, pages.length, maxPages]);

  // ---- Finish: 1 image -> image; multiple -> merged PDF (OCR if enabled) ----
  const finish = useCallback(async () => {
    if (pages.length === 0) return;
    setBusy(true);
    setProgressMsg('Finalizing...');
    try {
      if (pages.length === 1) {
        const page = pages[0];
        const blob = page.blob;
        const name = `scan_${Date.now()}.jpg`;
        onResult?.(new File([blob], name, { type: 'image/jpeg' }), false);
        onDone(pages);
        return;
      }
      if (ocrEnabled) {
        setProgressMsg('Running OCR — this may take a while...');
      }
      const file = await buildSearchablePdf(
        pages.map(p => ({ blob: p.blob, width: p.width, height: p.height })),
        ocrEnabled,
        `scan_${Date.now()}.pdf`,
        p => setProgressMsg(`Building PDF... ${Math.round(p * 100)}%`)
      );
      onResult?.(file, ocrEnabled);
      onDone(pages);
    } catch (err: any) {
      setError('Failed to finalize: ' + (err?.message || 'Unknown error'));
    }
    setBusy(false);
  }, [pages, ocrEnabled, onDone, onResult]);

  // ---- Reset detection when no quad (allow full-frame) ----
  const noDetect = () => {
    quadRef.current = null;
  };

  return (
    <div className="fixed inset-0 z-[210] bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/90 border-b border-white/10">
        <button className="w-9 h-9 rounded-lg bg-white/10 text-white flex items-center justify-center cursor-pointer border-none" onClick={onCancel}>
          <i className="fas fa-arrow-left"></i>
        </button>
        <span className="text-white text-[0.9rem] font-semibold">Document Scanner</span>
        <span className="text-white/60 text-[0.75rem] w-9 text-right">{pages.length}/{maxPages}</span>
      </div>

      {/* Viewfinder */}
      <div className="relative flex-1 overflow-hidden bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-contain"
          style={{ display: ready ? 'block' : 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
        <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />

        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-white/70 flex flex-col items-center gap-2">
              <i className="fas fa-spinner fa-spin text-2xl"></i>
              <span className="text-[0.8rem]">Starting camera...</span>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
            <i className="fas fa-video-slash text-3xl text-red-400"></i>
            <p className="text-white/80 text-[0.85rem]">{error}</p>
            <button className="px-4 py-2 rounded-lg bg-white/15 text-white text-[0.8rem] cursor-pointer border-none" onClick={onCancel}>
              Back
            </button>
          </div>
        )}

        {/* Mode toggle */}
        {ready && !error && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex rounded-xl overflow-hidden bg-black/60 border border-white/15">
            {([
              ['bw', 'B&W'],
              ['enhance', 'Enhance'],
              ['original', 'Original'],
            ] as [ScanMode, string][]).map(([val, label]) => (
              <button
                key={val}
                className={`px-3 py-1.5 text-[0.72rem] font-semibold cursor-pointer border-none transition-colors ${mode === val ? 'bg-qsis text-white' : 'bg-transparent text-white/70'}`}
                onClick={() => setMode(val)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* OCR toggle */}
        {ready && !error && (
          <button
            className={`absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[0.72rem] font-semibold cursor-pointer border border-white/15 transition-colors ${ocrEnabled ? 'bg-accent text-white' : 'bg-black/60 text-white/70'}`}
            onClick={() => setOcrEnabled(v => !v)}
          >
            <i className={`fas ${ocrEnabled ? 'fa-check' : 'fa-eye-slash'}`}></i>
            OCR
          </button>
        )}

        {/* No-detection fallback */}
        {ready && !error && !quadRef.current && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 translate-y-10 text-white/80 text-[0.7rem] bg-black/50 px-3 py-1 rounded-lg">
            No document detected — capture full frame
          </div>
        )}

        {progressMsg && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 text-white/90 text-[0.78rem] bg-black/70 px-3 py-1.5 rounded-lg">
            <i className="fas fa-spinner fa-spin mr-2"></i>{progressMsg}
          </div>
        )}

        {/* Captured thumbnails */}
        {pages.length > 0 && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 flex gap-2">
            {pages.map((p, i) => (
              <div key={i} className="relative w-14 h-20 rounded-lg overflow-hidden border-2 border-white/40 bg-white">
                <img src={p.thumb} alt={`page ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white text-[0.6rem] rounded-bl-lg cursor-pointer border-none flex items-center justify-center"
                  onClick={() => setPages(prev => prev.filter((_, j) => j !== i))}
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="px-4 py-4 bg-black/90 border-t border-white/10 flex items-center justify-center gap-6">
        <button
          className="flex flex-col items-center gap-1 text-white/60 text-[0.68rem] bg-transparent border-none cursor-pointer"
          onClick={noDetect}
          title="Clear detection"
        >
          <i className="fas fa-rotate-left text-lg"></i>
          No Auto-Crop
        </button>
        <button
          className="w-16 h-16 rounded-full border-4 border-white bg-white/10 flex items-center justify-center cursor-pointer hover:bg-white/20 transition-colors"
          onClick={capture}
          disabled={capturing || busy}
          title="Capture"
        >
          <i className={`fas ${capturing ? 'fa-spinner fa-spin' : 'fa-camera'} text-white text-xl`}></i>
        </button>
        <button
          className="flex flex-col items-center gap-1 text-qsis text-[0.68rem] bg-transparent border-none cursor-pointer disabled:opacity-40"
          onClick={finish}
          disabled={pages.length === 0 || busy}
          title="Finish"
        >
          <i className="fas fa-check-circle text-lg"></i>
          {pages.length > 1 ? 'Merge to PDF' : 'Done'}
        </button>
      </div>
    </div>
  );
}

export type { CapturedPage };
