'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface PdfViewerProps {
  url: string;
  name: string;
  filePath?: string;
  onClose: () => void;
}

// Simple in-app PDF viewer built on pdf.js (v6.1.200, served from /public).
// The PDF bytes are fetched through the same-origin proxy (no download, no
// iframe, no X-Frame-Options) and rendered page-by-page into canvases inside a
// scrollable container. A laser pointer replaces the OS cursor exactly (no
// lag), a hand tool allows drag-scrolling, and Ctrl+/- / Ctrl+wheel zoom.
export default function PdfViewer({ url, name, onClose }: PdfViewerProps) {
  const src = `${window.location.origin}/api/github/raw?url=${encodeURIComponent(url)}`;

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [scale, setScale] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [tool, setTool] = useState<'laser' | 'hand'>('hand');
  const [grabbing, setGrabbing] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<any>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  const cursorRef = useRef({ x: -100, y: -100, inside: false });
  const dragRef = useRef({ active: false, x: 0, y: 0, left: 0, top: 0 });
  const zoomRef = useRef<{ scale: number; status: string }>({ scale: 1, status: 'loading' });

  // ---- PDF rendering -----------------------------------------------------

  const renderAllPages = useCallback(async () => {
    const pdf = pdfRef.current;
    const container = scrollRef.current;
    if (!pdf || !container) return;
    const base = Math.max(container.clientWidth - 24, 320);
    for (let i = 0; i < canvasRefs.current.length; i++) {
      const canvas = canvasRefs.current[i];
      if (!canvas) continue;
      try {
        const page = await pdf.getPage(i + 1);
        const vp = page.getViewport({ scale: 1 });
        const fit = (base / vp.width) * scale;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(vp.width * fit * dpr);
        canvas.height = Math.floor(vp.height * fit * dpr);
        canvas.style.width = `${Math.floor(vp.width * fit)}px`;
        canvas.style.height = `${Math.floor(vp.height * fit)}px`;
        await page.render({
          canvasContext: canvas.getContext('2d')!,
          viewport: page.getViewport({ scale: fit * dpr }),
        }).promise;
      } catch {
        /* page destroyed during unmount — ignore */
      }
    }
  }, [scale]);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    (async () => {
      try {
        const pdfjs: any = await import(/* webpackIgnore: true */ '/pdfjs/pdf.min.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';

        let res: Response | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            res = await fetch(src);
            if (res.ok) break;
          } catch {
            res = null;
          }
          if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        }
        if (!res || !res.ok) {
          throw new Error(res ? `Failed to load file (${res.status})` : 'Failed to load this file. Please check your connection.');
        }
        const pdf = await pdfjs.getDocument({ data: await res.arrayBuffer() }).promise;
        if (cancelled) {
          pdf.destroy?.();
          return;
        }
        pdfRef.current = pdf;
        canvasRefs.current = [];
        setNumPages(pdf.numPages);
        setStatus('ready');
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Could not load this PDF.');
          setStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      pdfRef.current?.destroy?.();
      pdfRef.current = null;
      canvasRefs.current = [];
    };
  }, [src]);

  useEffect(() => {
    if (status === 'ready') renderAllPages();
  }, [status, renderAllPages]);

  // ---- Zoom --------------------------------------------------------------

  const zoom = useCallback((dir: 1 | -1) => {
    setScale((prev) => {
      const next = Math.min(3, Math.max(0.5, +(prev + dir * 0.2).toFixed(2)));
      zoomRef.current.scale = next;
      return next;
    });
  }, []);

  const resetZoom = useCallback(() => {
    setScale(1);
    zoomRef.current.scale = 1;
  }, []);

  // Keep a ref mirror so the keyboard handler always reads the latest zoom fn.
  const zoomFnRef = useRef(zoom);
  zoomFnRef.current = zoom;
  const resetFnRef = useRef(resetZoom);
  resetFnRef.current = resetZoom;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          zoomFnRef.current(1);
        } else if (e.key === '-') {
          e.preventDefault();
          zoomFnRef.current(-1);
        } else if (e.key === '0') {
          e.preventDefault();
          resetFnRef.current();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onWheel = useCallback(
    (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoom(e.deltaY < 0 ? 1 : -1);
      }
    },
    [zoom]
  );

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  // ---- Pinch zoom (two fingers) -------------------------------------------

  const pinchRef = useRef<{
    active: boolean;
    startDist: number;
    startScale: number;
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      pinchRef.current = {
        active: true,
        startDist: dist(e.touches),
        startScale: zoomRef.current.scale,
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        left: el.scrollLeft,
        top: el.scrollTop,
      };
    };

    const onTouchMove = (e: TouchEvent) => {
      const p = pinchRef.current;
      if (!p || e.touches.length !== 2) return;
      e.preventDefault();
      const d = dist(e.touches);
      if (p.startDist > 0) {
        const next = Math.min(3, Math.max(0.5, +(p.startScale * (d / p.startDist)).toFixed(2)));
        zoomRef.current.scale = next;
        setScale(next);
      }
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      el.scrollLeft = p.left - (mx - p.x);
      el.scrollTop = p.top - (my - p.y);
    };

    const endPinch = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchRef.current = null;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', endPinch, { passive: false });
    el.addEventListener('touchcancel', endPinch, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', endPinch);
      el.removeEventListener('touchcancel', endPinch);
    };
  }, []);

  // ---- Laser pointer -----------------------------------------------------

  const drawLaser = useCallback(() => {
    const canvas = overlayRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, stage.clientWidth, stage.clientHeight);

    const { x, y, inside } = cursorRef.current;
    if (!inside) return;

    const glow = ctx.createRadialGradient(x, y, 1, x, y, 26);
    glow.addColorStop(0, 'rgba(255,70,70,0.65)');
    glow.addColorStop(0.4, 'rgba(255,70,70,0.25)');
    glow.addColorStop(1, 'rgba(255,70,70,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, 26, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ff2d2d';
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  useEffect(() => {
    if (tool !== 'laser') return;

    const onMove = (e: MouseEvent) => {
      const canvas = overlayRef.current;
      const stage = stageRef.current;
      if (!canvas || !stage) return;
      const rect = canvas.getBoundingClientRect();
      // Convert viewport coords into the canvas's local CSS-px space, correcting
      // for browser zoom / any ancestor transform so the laser sits exactly on
      // the cursor.
      const scaleX = rect.width ? canvas.clientWidth / rect.width : 1;
      const scaleY = rect.height ? canvas.clientHeight / rect.height : 1;
      cursorRef.current = {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
        inside: true,
      };
    };
    const onLeave = () => {
      cursorRef.current.inside = false;
    };

    let raf = 0;
    const loop = () => {
      drawLaser();
      raf = requestAnimationFrame(loop);
    };

    window.addEventListener('mousemove', onMove);
    stageRef.current?.addEventListener('mouseleave', onLeave);
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('mousemove', onMove);
      stageRef.current?.removeEventListener('mouseleave', onLeave);
      cancelAnimationFrame(raf);
      const canvas = overlayRef.current;
      const stage = stageRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx && stage) ctx.clearRect(0, 0, stage.clientWidth, stage.clientHeight);
    };
  }, [tool, drawLaser]);

  // ---- Hand tool (drag to scroll) ---------------------------------------

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (tool !== 'hand') return;
    const sc = scrollRef.current;
    if (!sc) return;
    dragRef.current = { active: true, x: e.clientX, y: e.clientY, left: sc.scrollLeft, top: sc.scrollTop };
    setGrabbing(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const sc = scrollRef.current;
    if (tool === 'hand' && d.active && sc && !pinchRef.current?.active) {
      sc.scrollLeft = d.left - (e.clientX - d.x);
      sc.scrollTop = d.top - (e.clientY - d.y);
    }
  };

  const endDrag = () => {
    dragRef.current.active = false;
    setGrabbing(false);
  };

  // ---- Overlay sizing ----------------------------------------------------

  useEffect(() => {
    const canvas = overlayRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = stage.clientWidth * dpr;
      canvas.height = stage.clientHeight * dpr;
      canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawLaser();
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [drawLaser]);

  // ---- UI ------------------------------------------------------------------

  const ToolButton = ({ t, icon, title }: { t: 'laser' | 'hand'; icon: string; title: string }) => (
    <button
      className="pdf-btn"
      onClick={() => setTool(t)}
      title={title}
      style={tool === t ? { background: 'rgba(251,146,60,0.25)', border: '1px solid rgba(251,146,60,0.6)' } : undefined}
    >
      <i className={icon}></i>
    </button>
  );

  return (
    <div className="fixed inset-0 z-[1500] bg-[#0a0f1e] flex flex-col">
        <div className="flex items-center gap-2 px-3 py-2 bg-neutral-900 border-b border-neutral-800 shrink-0 flex-wrap wco-aware">
        <span className="text-neutral-300 text-[0.8rem] font-semibold truncate max-w-[40vw]">{name}</span>
        <span className="text-neutral-500 text-[0.72rem] hidden sm:block">
          {status === 'ready' ? `${numPages} page${numPages === 1 ? '' : 's'}` : ''}
        </span>

        <div className="flex items-center gap-1 ml-auto">
          <ToolButton t="laser" icon="fas fa-magic" title="Laser pointer (or use your cursor)" />
          <ToolButton t="hand" icon="fas fa-hand-paper" title="Hand tool — drag to scroll" />
          <button className="pdf-btn" onClick={() => zoom(-1)} title="Zoom out (Ctrl + -)" disabled={status !== 'ready'}><i className="fas fa-minus"></i></button>
          <span className="text-neutral-400 text-[0.72rem] font-mono min-w-[38px] text-center select-none">{Math.round(scale * 100)}%</span>
          <button className="pdf-btn" onClick={() => zoom(1)} title="Zoom in (Ctrl + +)" disabled={status !== 'ready'}><i className="fas fa-plus"></i></button>
          <button className="pdf-btn" onClick={resetZoom} title="Reset zoom (Ctrl + 0)" disabled={status !== 'ready'}><i className="fas fa-expand-arrows-alt"></i></button>
          <a className="pdf-btn no-underline" href={src} download={name} title="Download" style={{ textDecoration: 'none' }}><i className="fas fa-download"></i></a>
          <button
            className="pdf-btn"
            onClick={onClose}
            title="Close"
            style={{ background: '#ef4444', color: 'white', borderRadius: '7px' }}
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        className="flex-1 relative min-h-0 bg-[#0a0f1e]"
        style={{ cursor: tool === 'laser' ? 'none' : grabbing ? 'grabbing' : 'grab' }}
      >
        <div
          ref={scrollRef}
          className="absolute inset-0 overflow-auto"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{ cursor: tool === 'laser' ? 'none' : 'inherit', touchAction: 'pan-x pan-y' }}
        >
          <div className="p-3 flex flex-col gap-3">
            {Array.from({ length: numPages }).map((_, i) => (
              <canvas
                key={i}
                ref={(el) => {
                  canvasRefs.current[i] = el;
                }}
                className="rounded shadow-lg bg-white mx-auto"
              />
            ))}
          </div>
        </div>

        <canvas ref={overlayRef} className="absolute inset-0 pointer-events-none" />

        {status === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-dark-text2 bg-[#0a0f1e]">
            <div
              style={{
                width: 36,
                height: 36,
                border: '3px solid rgba(255,255,255,0.15)',
                borderTopColor: '#fff',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            ></div>
            <p className="text-[0.8rem] mt-3">Loading PDF...</p>
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-dark-text2 px-6 text-center bg-[#0a0f1e]">
            <i className="fas fa-file-pdf text-4xl mb-3 text-red-400"></i>
            <p className="text-sm mb-1">Could not open this PDF.</p>
            <p className="text-[0.78rem] text-dark-text3 mb-4">{error}</p>
            <a href={src} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl bg-qsis text-white text-sm font-semibold no-underline">
              <i className="fas fa-external-link-alt mr-1"></i>Open in new tab
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
