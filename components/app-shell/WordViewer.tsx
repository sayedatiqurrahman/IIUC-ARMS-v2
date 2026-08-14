'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ANNO_COLORS, clamp01, drawAnno, type Annotation, type AnnoPoint, type AnnoType } from '@/lib/annotations';

// .docx rendered natively in the browser with docx-preview — no external
// Microsoft Office embed, so it works on slow/restricted networks too.
// The bytes come from the same-origin proxy (never raw.githubusercontent).
// Toolbar mirrors the PDF viewer: zoom in/out, fit-to-screen (the default on
// open), Ctrl+/-/0 and Ctrl+wheel zoom.
//
// Annotation: the toolbar "Annotate" button toggles the same pen / highlighter
// / text tools as the PDF viewer. Marks are stored in normalized coordinates
// relative to each rendered .docx section, drawn on overlay canvases that are
// re-synced on every zoom / layout change so they stay perfectly aligned.
export default function WordViewer({ item, onClose }: { item: any; onClose: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [pages, setPages] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [fitMode, setFitMode] = useState(true);

  const src = `${window.location.origin}/api/github/raw?url=${encodeURIComponent(item.rawUrl)}`;

  // Refs mirror so event handlers always read the latest zoom/fit state.
  const zoomLevelRef = useRef(1);
  const fitModeRef = useRef(true);
  const sectionWidthRef = useRef(0);

  // ---- Annotation state --------------------------------------------------

  const [annotating, setAnnotating] = useState(false);
  const [annoTool, setAnnoTool] = useState<AnnoType>('pen');
  const [annoColor, setAnnoColor] = useState(ANNO_COLORS[0]);
  const [annos, setAnnos] = useState<Annotation[]>([]);

  const overlayRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const sectionsRef = useRef<HTMLElement[]>([]);
  const annosRef = useRef<Annotation[]>([]);
  annosRef.current = annos;
  const drawingRef = useRef<{ idx: number; el: HTMLElement; points: AnnoPoint[]; id: string } | null>(null);
  const textDraftRef = useRef<{ idx: number; x: number; y: number; input: HTMLInputElement } | null>(null);
  const annoToolRef = useRef<AnnoType>('pen');
  annoToolRef.current = annoTool;
  const annoColorRef = useRef(ANNO_COLORS[0]);
  annoColorRef.current = annoColor;
  const annotatingRef = useRef(false);
  annotatingRef.current = annotating;

  // Fit the page to the screen width. The docx section width is fixed by the
  // Word page setup, so we scale it down with the CSS `zoom` property. Never
  // upscale beyond 100% — natural size on desktop, shrunk to fit on phones.
  const applyFit = useCallback(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    let w = sectionWidthRef.current;
    if (!w) {
      const section = bodyRef.current?.querySelector('.docx-wrapper > section.docx') as HTMLElement | null;
      if (section) w = section.getBoundingClientRect().width / zoomLevelRef.current;
    }
    if (!w) w = 800;
    sectionWidthRef.current = w;
    const z = Math.min(Math.max((scroll.clientWidth - 16) / w, 0.2), 1);
    zoomLevelRef.current = z;
    fitModeRef.current = true;
    setZoomLevel(z);
    setFitMode(true);
  }, []);

  const zoomBy = useCallback((dir: 1 | -1) => {
    const next = Math.min(4, Math.max(0.2, +(zoomLevelRef.current * (dir > 0 ? 1.25 : 0.8)).toFixed(3)));
    zoomLevelRef.current = next;
    fitModeRef.current = false;
    setZoomLevel(next);
    setFitMode(false);
  }, []);

  const fitFnRef = useRef(applyFit);
  fitFnRef.current = applyFit;
  const zoomFnRef = useRef(zoomBy);
  zoomFnRef.current = zoomBy;

  // Always re-center the page horizontally after any zoom/layout change so the
  // document never drifts off to one side (double-rAF waits for layout).
  const recenter = useCallback(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scroll.scrollLeft = (scroll.scrollWidth - scroll.clientWidth) / 2;
      });
    });
  }, []);

  // ---- Annotation drawing ------------------------------------------------

  // Repaint the overlay canvas for one section. The backing store is sized to
  // the section's current visual (post-zoom) size so marks stay crisp.
  const paintPage = useCallback((idx: number) => {
    const canvas = overlayRefs.current[idx];
    const sec = sectionsRef.current[idx];
    if (!canvas || !sec) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = sec.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (!w || !h) return;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    for (const a of annosRef.current) {
      if (a.page === idx) drawAnno(ctx, a, w, h);
    }
  }, []);

  // Create one overlay canvas per rendered .docx section and paint it.
  const syncOverlays = useCallback(() => {
    const body = bodyRef.current;
    if (!body) return;
    const sections = Array.from(body.querySelectorAll('.docx-wrapper > section.docx')) as HTMLElement[];
    sectionsRef.current = sections;
    overlayRefs.current = [];
    sections.forEach((sec, idx) => {
      let canvas = sec.querySelector('canvas.docx-anno') as HTMLCanvasElement | null;
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.className = 'docx-anno';
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '10';
        sec.style.position = 'relative';
        sec.appendChild(canvas);
      }
      overlayRefs.current[idx] = canvas;
      paintPage(idx);
    });
  }, [paintPage]);

  const commitText = useCallback(() => {
    const d = textDraftRef.current;
    if (!d) return;
    const t = (d.input.value || '').trim();
    if (t) {
      setAnnos((prev) => [
        ...prev,
        {
          id: Math.random().toString(36).slice(2),
          page: d.idx,
          type: 'text',
          color: annoColorRef.current,
          points: [{ x: d.x, y: d.y }],
          text: t,
          lineWidth: 0.0035,
          fontSize: 0.018,
        },
      ]);
    }
    d.input.remove();
    textDraftRef.current = null;
  }, []);

  // Pointer handling is delegated on the scroll container because the .docx
  // sections are created by docx-preview outside React.
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;

    const findSection = (e: PointerEvent): { sec: HTMLElement; idx: number } | null => {
      const target = e.target as HTMLElement | null;
      const sec = target?.closest?.('section.docx') as HTMLElement | null;
      if (!sec) return null;
      const idx = sectionsRef.current.indexOf(sec);
      if (idx < 0) return null;
      return { sec, idx };
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!annotatingRef.current) return;
      const hit = findSection(e);
      if (!hit) return;
      e.preventDefault();
      const r = hit.sec.getBoundingClientRect();
      const p = {
        x: clamp01(r.width ? (e.clientX - r.left) / r.width : 0),
        y: clamp01(r.height ? (e.clientY - r.top) / r.height : 0),
      };

      if (annoToolRef.current === 'text') {
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Type…';
        input.className = 'docx-anno-text';
        input.style.position = 'absolute';
        input.style.left = `${(p.x * 100).toFixed(3)}%`;
        input.style.top = `${(p.y * 100).toFixed(3)}%`;
        input.style.transform = 'translateY(-100%)';
        input.style.zIndex = '20';
        hit.sec.appendChild(input);
        input.focus();
        textDraftRef.current = { idx: hit.idx, x: p.x, y: p.y, input };
        const cancel = () => {
          const d = textDraftRef.current;
          if (d && d.input) d.input.remove();
          textDraftRef.current = null;
        };
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            commitText();
          } else if (ev.key === 'Escape') {
            cancel();
          }
        });
        input.addEventListener('blur', commitText);
        return;
      }

      drawingRef.current = { idx: hit.idx, el: hit.sec, points: [p], id: Math.random().toString(36).slice(2) };
      hit.sec.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      const d = drawingRef.current;
      if (!d) return;
      e.preventDefault();
      const r = d.el.getBoundingClientRect();
      d.points.push({
        x: clamp01(r.width ? (e.clientX - r.left) / r.width : 0),
        y: clamp01(r.height ? (e.clientY - r.top) / r.height : 0),
      });
      const canvas = overlayRefs.current[d.idx];
      const sec = sectionsRef.current[d.idx];
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx || !sec) return;
      const rect = sec.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      for (const a of annosRef.current) {
        if (a.page === d.idx) drawAnno(ctx, a, w, h);
      }
      const temp: Annotation = {
        id: d.id,
        page: d.idx,
        type: annoToolRef.current,
        color: annoColorRef.current,
        points: d.points,
        lineWidth: 0.0035,
        fontSize: 0.018,
      };
      drawAnno(ctx, temp, w, h);
    };

    const onPointerUp = (e: PointerEvent) => {
      const d = drawingRef.current;
      if (!d) return;
      drawingRef.current = null;
      const pts = d.points;
      if (pts.length < 2) return;
      const first = pts[0];
      const last = pts[pts.length - 1];
      if (Math.hypot(last.x - first.x, last.y - first.y) < 0.004) return;
      setAnnos((prev) => [
        ...prev,
        {
          id: d.id,
          page: d.idx,
          type: annoToolRef.current,
          color: annoColorRef.current,
          points: pts,
          lineWidth: 0.0035,
          fontSize: 0.018,
        },
      ]);
    };

    const onPointerCancel = () => {
      drawingRef.current = null;
    };

    sc.addEventListener('pointerdown', onPointerDown);
    sc.addEventListener('pointermove', onPointerMove);
    sc.addEventListener('pointerup', onPointerUp);
    sc.addEventListener('pointercancel', onPointerCancel);
    return () => {
      sc.removeEventListener('pointerdown', onPointerDown);
      sc.removeEventListener('pointermove', onPointerMove);
      sc.removeEventListener('pointerup', onPointerUp);
      sc.removeEventListener('pointercancel', onPointerCancel);
    };
  }, [commitText]);

  // While annotating, block touch-scroll / selection on the pages and show a
  // crosshair cursor so clicks draw instead of panning the document.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    body.querySelectorAll('.docx-wrapper > section.docx').forEach((sec) => {
      const el = sec as HTMLElement;
      el.style.touchAction = annotating ? 'none' : '';
      el.style.userSelect = annotating ? 'none' : '';
      el.style.cursor = annotating ? 'crosshair' : '';
    });
  }, [annotating, status]);

  // ---- Load + render the document ----------------------------------------

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { renderAsync } = await import('docx-preview');

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
          throw new Error(res ? `Failed to load file (HTTP ${res.status})` : 'Failed to load this file. Please check your connection.');
        }

        const data = await res.arrayBuffer();
        if (cancelled || !bodyRef.current) return;
        // CRITICAL: never pass document.body (or any app-owned node) as the
        // style container — docx-preview does `styleContainer.innerHTML = ""`,
        // which wipes React's root (#__next) and blacks out the whole app.
        // The container div is owned by this viewer, so clearing it is safe.
        await renderAsync(data, bodyRef.current, bodyRef.current, {
          className: 'docx',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          ignoreLastRenderedPageBreak: false,
        });
        if (cancelled) return;
        setPages(bodyRef.current.querySelectorAll('.docx-wrapper > section.docx').length);
        setStatus('ready');
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || String(e));
          setStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
      if (bodyRef.current) bodyRef.current.innerHTML = '';
    };
  }, [src]);

  // Once rendered, make the page fit on screen by default and stop the
  // left-edge clipping: the docx page is wider than a phone screen and the
  // centered wrapper hid its left side. max-content keeps both edges reachable
  // and auto margins keep the page centered no matter the zoom level.
  useEffect(() => {
    if (status !== 'ready') return;
    const wrapper = bodyRef.current?.querySelector('.docx-wrapper') as HTMLElement | null;
    if (wrapper) {
      wrapper.style.width = 'max-content';
      wrapper.style.margin = '0 auto';
    }
    const raf = requestAnimationFrame(() => {
      applyFit();
      recenter();
      syncOverlays();
    });
    return () => cancelAnimationFrame(raf);
  }, [status, applyFit, recenter, syncOverlays]);

  // Re-center + re-sync annotation overlays after every zoom step (buttons,
  // Ctrl+/-, Ctrl+wheel).
  useEffect(() => {
    if (status !== 'ready') return;
    recenter();
    syncOverlays();
  }, [zoomLevel, status, recenter, syncOverlays]);

  // Re-paint overlays whenever annotations change.
  useEffect(() => {
    if (status !== 'ready') return;
    syncOverlays();
  }, [annos, status, syncOverlays]);

  // Re-fit / re-center / re-sync on window resize.
  useEffect(() => {
    const onResize = () => {
      if (fitModeRef.current) applyFit();
      recenter();
      syncOverlays();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [applyFit, recenter, syncOverlays]);

  // Watch the rendered document for layout changes (fonts loading, etc.) so
  // the annotation overlays never drift out of alignment.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body || status !== 'ready') return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(syncOverlays);
    });
    ro.observe(body);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [status, syncOverlays]);

  // ---- Keyboard + wheel zoom ---------------------------------------------

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
          fitFnRef.current();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomFnRef.current(e.deltaY < 0 ? 1 : -1);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const toggleAnnotate = () => {
    setAnnotating((v) => {
      if (v) {
        drawingRef.current = null;
        if (textDraftRef.current) {
          textDraftRef.current.input.remove();
          textDraftRef.current = null;
        }
      }
      return !v;
    });
  };

  return (
    <div ref={rootRef} className="fixed inset-0 z-[1500] bg-[#0a0f1e] flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 bg-neutral-900 border-b border-neutral-800 shrink-0 flex-wrap wco-aware">
        <i className="fas fa-file-word text-[#3b82f6] flex-shrink-0"></i>
        <span className="text-neutral-300 text-[0.8rem] font-semibold truncate max-w-[30vw]">{item.name}</span>
        {status === 'ready' && pages > 0 && (
          <span className="text-neutral-500 text-[0.72rem] hidden sm:block">
            {pages} page{pages === 1 ? '' : 's'}
          </span>
        )}

        <div className="flex items-center gap-1 ml-auto">
          <button
            className="pdf-btn"
            onClick={toggleAnnotate}
            title="Annotate — show/hide the annotation toolbar"
            disabled={status === 'error'}
            style={annotating ? { background: 'rgba(251,146,60,0.25)', border: '1px solid rgba(251,146,60,0.6)' } : undefined}
          >
            <i className="fas fa-marker"></i>
          </button>
          <button className="pdf-btn" onClick={() => zoomBy(-1)} title="Zoom out (Ctrl + -)" disabled={status !== 'ready'}><i className="fas fa-minus"></i></button>
          <span className="text-neutral-400 text-[0.72rem] font-mono min-w-[38px] text-center select-none">{Math.round(zoomLevel * 100)}%</span>
          <button className="pdf-btn" onClick={() => zoomBy(1)} title="Zoom in (Ctrl + +)" disabled={status !== 'ready'}><i className="fas fa-plus"></i></button>
          <button className="pdf-btn" onClick={applyFit} title="Fit to screen (Ctrl + 0)" disabled={status !== 'ready'}><i className="fas fa-expand-arrows-alt"></i></button>
          <a className="pdf-btn no-underline" href={src} download={item.name} title="Download" style={{ textDecoration: 'none' }}><i className="fas fa-download"></i></a>
          <button className="pdf-btn" onClick={onClose} title="Close" style={{ background: '#ef4444', color: 'white', borderRadius: '7px' }}><i className="fas fa-times"></i></button>
        </div>
      </div>

      {annotating && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 border-b border-neutral-800 shrink-0 flex-wrap wco-aware">
          <button
            className="pdf-btn"
            onClick={() => setAnnoTool('pen')}
            title="Pen"
            style={annoTool === 'pen' ? { background: 'rgba(251,146,60,0.25)', border: '1px solid rgba(251,146,60,0.6)' } : undefined}
          >
            <i className="fas fa-pen"></i>
          </button>
          <button
            className="pdf-btn"
            onClick={() => setAnnoTool('highlight')}
            title="Highlighter"
            style={annoTool === 'highlight' ? { background: 'rgba(251,146,60,0.25)', border: '1px solid rgba(251,146,60,0.6)' } : undefined}
          >
            <i className="fas fa-highlighter"></i>
          </button>
          <button
            className="pdf-btn"
            onClick={() => setAnnoTool('text')}
            title="Text"
            style={annoTool === 'text' ? { background: 'rgba(251,146,60,0.25)', border: '1px solid rgba(251,146,60,0.6)' } : undefined}
          >
            <i className="fas fa-font"></i>
          </button>
          <span className="w-px h-5 bg-neutral-700 mx-1"></span>
          {ANNO_COLORS.map((c) => (
            <button
              key={c}
              className="h-6 w-6 rounded-full border-2"
              style={{ background: c, borderColor: annoColor === c ? '#fff' : 'transparent' }}
              onClick={() => setAnnoColor(c)}
              title={c}
            />
          ))}
          <span className="w-px h-5 bg-neutral-700 mx-1"></span>
          <button className="pdf-btn" onClick={() => setAnnos((prev) => prev.slice(0, -1))} title="Undo last annotation" disabled={!annos.length}><i className="fas fa-undo"></i></button>
          <button className="pdf-btn" onClick={() => setAnnos([])} title="Clear all annotations" disabled={!annos.length}><i className="fas fa-trash-alt"></i></button>
          <span className="ml-auto text-neutral-500 text-[0.7rem] hidden sm:block">
            {annoTool === 'text' ? 'Click a page to add text' : 'Click & drag on a page to draw'}
          </span>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-auto min-h-0" style={{ background: '#0a0f1e' }}>
        {status === 'loading' && (
          <div className="flex flex-col items-center justify-center text-dark-text2 min-h-[60vh]">
            <div className="w-8 h-8 border-2 border-qsis border-t-transparent rounded-full animate-spin mb-3"></div>
            <p className="text-sm">Loading document…</p>
          </div>
        )}
        {status === 'error' && (
          <div className="flex flex-col items-center justify-center text-dark-text2 min-h-[60vh] px-6 text-center">
            <i className="fas fa-file-word text-4xl mb-3 text-red-400"></i>
            <p className="text-sm mb-1">Could not open this document.</p>
            <p className="text-[0.78rem] text-dark-text3 mb-4">{error}</p>
            <a href={src} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl bg-qsis text-white text-sm font-semibold no-underline">
              <i className="fas fa-external-link-alt mr-1"></i>Open in new tab
            </a>
          </div>
        )}
        <div
          ref={bodyRef}
          className="px-3 py-4 flex flex-col"
          style={{ zoom: zoomLevel, alignItems: 'flex-start' }}
        />
      </div>
    </div>
  );
}
