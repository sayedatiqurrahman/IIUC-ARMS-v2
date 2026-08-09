'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface PdfViewerProps {
  url: string;
  name: string;
  filePath?: string;
  onClose: () => void;
}

type Tool = 'laser' | 'pen' | 'highlighter' | 'eraser';

interface Stroke {
  tool: 'pen' | 'highlighter';
  color: string;
  size: number;
  points: { x: number; y: number }[];
}

interface Cursor {
  x: number;
  y: number;
}

const COLORS = ['#ff2d2d', '#ffd400', '#22c55e', '#3b82f6', '#ffffff'];

// Simple in-app PDF viewer built on pdf.js (v6.1.200, served from /public).
// The PDF bytes are fetched through the same-origin proxy (no download, no
// iframe, no X-Frame-Options) and rendered page-by-page into canvases inside a
// scrollable container. A teaching overlay adds a smooth magic laser pointer
// plus pen/highlighter/eraser annotations (Excalidraw-style strokes).
export default function PdfViewer({ url, name, onClose }: PdfViewerProps) {
  const src = `${window.location.origin}/api/github/raw?url=${encodeURIComponent(url)}`;

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [scale, setScale] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [tool, setTool] = useState<Tool>('laser');
  const [color, setColor] = useState(COLORS[0]);

  const stageRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<any>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const strokesRef = useRef<Stroke[]>([]);
  const activeStrokeRef = useRef<Stroke | null>(null);
  const erasingRef = useRef(false);

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
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
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

        const res = await fetch(src);
        if (!res.ok) throw new Error(`Failed to load file (${res.status})`);
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
      strokesRef.current = [];
    };
  }, [src]);

  useEffect(() => {
    if (status === 'ready') renderAllPages();
  }, [status, renderAllPages]);

  // ---- Annotation overlay ------------------------------------------------

  const drawStrokes = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    for (const s of strokesRef.current) {
      ctx.save();
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.lineWidth = s.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (s.tool === 'highlighter') ctx.globalAlpha = 0.35;
      if (s.points.length === 1) {
        ctx.beginPath();
        ctx.arc(s.points[0].x, s.points[0].y, s.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(s.points[0].x, s.points[0].y);
        for (let i = 1; i < s.points.length - 1; i++) {
          const mx = (s.points[i].x + s.points[i + 1].x) / 2;
          const my = (s.points[i].y + s.points[i + 1].y) / 2;
          ctx.quadraticCurveTo(s.points[i].x, s.points[i].y, mx, my);
        }
        const last = s.points[s.points.length - 1];
        ctx.lineTo(last.x, last.y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }, []);

  const redrawAll = useCallback(() => {
    const canvas = overlayRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawStrokes(ctx, stage.clientWidth, stage.clientHeight);
  }, [drawStrokes]);

  useEffect(() => {
    const canvas = overlayRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = stage.clientWidth * dpr;
      canvas.height = stage.clientHeight * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      redrawAll();
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [redrawAll, status]);

  // Magic laser pointer: lerped follow + glowing dot, drawn on rAF.
  useEffect(() => {
    if (tool !== 'laser' || status !== 'ready') return;

    let raf = 0;
    const target: Cursor = { x: -100, y: -100 };
    const cur: Cursor = { x: -100, y: -100 };
    let trail: Cursor[] = [];

    const onMove = (e: MouseEvent) => {
      target.x = e.clientX;
      target.y = e.clientY;
    };

    const loop = () => {
      cur.x += (target.x - cur.x) * 0.2;
      cur.y += (target.y - cur.y) * 0.2;
      trail.push({ x: cur.x, y: cur.y });
      if (trail.length > 10) trail.shift();

      const canvas = overlayRef.current;
      const stage = stageRef.current;
      if (canvas && stage) {
        const ctx = canvas.getContext('2d');
        const rect = stage.getBoundingClientRect();
        if (ctx) {
          drawStrokes(ctx, stage.clientWidth, stage.clientHeight);
          const lx = cur.x - rect.left;
          const ly = cur.y - rect.top;

          ctx.strokeStyle = 'rgba(255,45,45,0.22)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(rect.width / 2, rect.height);
          ctx.lineTo(lx, ly);
          ctx.stroke();

          trail.forEach((t, i) => {
            const a = ((i + 1) / trail.length) * 0.5;
            ctx.fillStyle = `rgba(255,70,70,${a.toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(t.x - rect.left, t.y - rect.top, (i / trail.length) * 8 + 1, 0, Math.PI * 2);
            ctx.fill();
          });

          const glow = ctx.createRadialGradient(lx, ly, 2, lx, ly, 32);
          glow.addColorStop(0, 'rgba(255,70,70,0.5)');
          glow.addColorStop(1, 'rgba(255,70,70,0)');
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(lx, ly, 32, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#ff2d2d';
          ctx.beginPath();
          ctx.arc(lx, ly, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(lx, ly, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      raf = requestAnimationFrame(loop);
    };

    window.addEventListener('mousemove', onMove);
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
      redrawAll();
    };
  }, [tool, status, drawStrokes, redrawAll]);

  const pointOf = (e: React.PointerEvent, rect: DOMRect): Cursor => ({
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  });

  const eraseAt = (p: Cursor) => {
    const RADIUS = 14;
    strokesRef.current = strokesRef.current.filter(
      (s) => !s.points.some((pt) => Math.hypot(pt.x - p.x, pt.y - p.y) < RADIUS)
    );
    redrawAll();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === 'eraser') {
      erasingRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      const rect = stageRef.current!.getBoundingClientRect();
      eraseAt(pointOf(e, rect));
      return;
    }
    if (tool === 'pen' || tool === 'highlighter') {
      e.currentTarget.setPointerCapture(e.pointerId);
      const rect = stageRef.current!.getBoundingClientRect();
      activeStrokeRef.current = {
        tool,
        color,
        size: tool === 'highlighter' ? 18 : 3,
        points: [pointOf(e, rect)],
      };
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const p = pointOf(e, rect);

    if (tool === 'eraser' && erasingRef.current) {
      eraseAt(p);
      return;
    }
    const s = activeStrokeRef.current;
    if ((tool === 'pen' || tool === 'highlighter') && s) {
      const last = s.points[s.points.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) < 1.5) return;
      s.points.push(p);
      const ctx = overlayRef.current?.getContext('2d');
      const c = overlayRef.current;
      if (ctx && c && stage) {
        ctx.clearRect(0, 0, stage.clientWidth, stage.clientHeight);
        drawStrokes(ctx, stage.clientWidth, stage.clientHeight);
        ctx.save();
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (s.tool === 'highlighter') ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.moveTo(s.points[0].x, s.points[0].y);
        for (let i = 1; i < s.points.length - 1; i++) {
          const mx = (s.points[i].x + s.points[i + 1].x) / 2;
          const my = (s.points[i].y + s.points[i + 1].y) / 2;
          ctx.quadraticCurveTo(s.points[i].x, s.points[i].y, mx, my);
        }
        const lastP = s.points[s.points.length - 1];
        ctx.lineTo(lastP.x, lastP.y);
        ctx.stroke();
        ctx.restore();
      }
    }
  };

  const endStroke = () => {
    erasingRef.current = false;
    const s = activeStrokeRef.current;
    if (s) {
      strokesRef.current.push(s);
      activeStrokeRef.current = null;
      redrawAll();
    }
  };

  const clearAnnotations = () => {
    strokesRef.current = [];
    redrawAll();
  };

  const zoom = (dir: 1 | -1) => {
    setScale((prev) => Math.min(3, Math.max(0.5, +(prev + dir * 0.2).toFixed(2))));
  };

  const drawing = tool === 'pen' || tool === 'highlighter' || tool === 'eraser';

  // ---- UI ------------------------------------------------------------------

  const ToolButton = ({ t, icon, title }: { t: Tool; icon: string; title: string }) => (
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
      <div className="flex items-center gap-2 px-3 py-2 bg-neutral-900 border-b border-neutral-800 shrink-0 flex-wrap">
        <span className="text-neutral-300 text-[0.8rem] font-semibold truncate max-w-[40vw]">{name}</span>
        <span className="text-neutral-500 text-[0.72rem] hidden sm:block">
          {status === 'ready' ? `${numPages} page${numPages === 1 ? '' : 's'}` : ''}
        </span>

        <div className="flex items-center gap-1 ml-auto">
          <ToolButton t="laser" icon="fas fa-magic" title="Laser pointer" />
          <ToolButton t="pen" icon="fas fa-pen" title="Pen" />
          <ToolButton t="highlighter" icon="fas fa-highlighter" title="Highlighter" />
          <ToolButton t="eraser" icon="fas fa-eraser" title="Eraser" />
          <button className="pdf-btn" onClick={clearAnnotations} title="Clear annotations" disabled={!drawing && strokesRef.current.length === 0}>
            <i className="fas fa-trash"></i>
          </button>
          {drawing && (
            <div className="flex items-center gap-1 mx-1 px-2 py-1 rounded-lg bg-black/30">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  title={c}
                  className="w-4 h-4 rounded-full border border-white/40"
                  style={{ background: c, boxShadow: color === c ? '0 0 0 2px rgba(251,146,60,0.9)' : undefined }}
                ></button>
              ))}
            </div>
          )}
          <button className="pdf-btn" onClick={() => zoom(-1)} title="Zoom out" disabled={status !== 'ready'}><i className="fas fa-minus"></i></button>
          <button className="pdf-btn" onClick={() => zoom(1)} title="Zoom in" disabled={status !== 'ready'}><i className="fas fa-plus"></i></button>
          <a className="pdf-btn no-underline" href={url} download={name} title="Download" style={{ textDecoration: 'none' }}><i className="fas fa-download"></i></a>
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

      <div ref={stageRef} className="flex-1 relative min-h-0 bg-[#0a0f1e]">
        <div ref={scrollRef} className="absolute inset-0 overflow-auto">
          <div className="p-3 flex flex-col items-center gap-3">
            {Array.from({ length: numPages }).map((_, i) => (
              <canvas
                key={i}
                ref={(el) => {
                  canvasRefs.current[i] = el;
                }}
                className="rounded shadow-lg bg-white"
              />
            ))}
          </div>
        </div>

        <canvas
          ref={overlayRef}
          className="absolute inset-0"
          style={{ pointerEvents: drawing ? 'auto' : 'none', touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
        />

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
            <a href={url} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl bg-qsis text-white text-sm font-semibold no-underline">
              <i className="fas fa-external-link-alt mr-1"></i>Open in new tab
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
