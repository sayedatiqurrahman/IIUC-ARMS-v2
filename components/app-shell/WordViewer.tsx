'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// .docx rendered natively in the browser with docx-preview — no external
// Microsoft Office embed, so it works on slow/restricted networks too.
// The bytes come from the same-origin proxy (never raw.githubusercontent).
// Toolbar mirrors the PDF viewer: zoom in/out, fit-to-screen (the default on
// open), Ctrl+/-/0 and Ctrl+wheel zoom.
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
    });
    return () => cancelAnimationFrame(raf);
  }, [status, applyFit, recenter]);

  // Re-center after every zoom step (buttons, Ctrl+/-, Ctrl+wheel).
  useEffect(() => {
    if (status !== 'ready') return;
    recenter();
  }, [zoomLevel, status, recenter]);

  // Re-fit / re-center on window resize.
  useEffect(() => {
    const onResize = () => {
      if (fitModeRef.current) applyFit();
      recenter();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [applyFit, recenter]);

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
          <button className="pdf-btn" onClick={() => zoomBy(-1)} title="Zoom out (Ctrl + -)" disabled={status !== 'ready'}><i className="fas fa-minus"></i></button>
          <span className="text-neutral-400 text-[0.72rem] font-mono min-w-[38px] text-center select-none">{Math.round(zoomLevel * 100)}%</span>
          <button className="pdf-btn" onClick={() => zoomBy(1)} title="Zoom in (Ctrl + +)" disabled={status !== 'ready'}><i className="fas fa-plus"></i></button>
          <button className="pdf-btn" onClick={applyFit} title="Fit to screen (Ctrl + 0)" disabled={status !== 'ready'}><i className="fas fa-expand-arrows-alt"></i></button>
          <a className="pdf-btn no-underline" href={src} download={item.name} title="Download" style={{ textDecoration: 'none' }}><i className="fas fa-download"></i></a>
          <button className="pdf-btn" onClick={onClose} title="Close" style={{ background: '#ef4444', color: 'white', borderRadius: '7px' }}><i className="fas fa-times"></i></button>
        </div>
      </div>

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
