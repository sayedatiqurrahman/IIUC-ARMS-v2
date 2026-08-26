'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ANNO_COLORS, clearXdrawCache, preloadXdraw, type Annotation, type AnnoTool } from '@/lib/annotations';
import { cachedFetch } from '@/lib/file-cache';
import DocToolbar from './doc-viewer/DocToolbar';
import DocxStage from './doc-viewer/DocxStage';
import { useDocxAnnotations } from './doc-viewer/useDocxAnnotations';
import { useViewerShortcuts } from './doc-viewer/useViewerShortcuts';

// DOCX-only document viewer (PDFs use PdfViewer with native embed rendering).
// Renders .docx via docx-preview with annotation support, toolbar, zoom.
export default function DocViewer({ item, onClose }: { item: any; onClose: () => void }) {
  const src = `${window.location.origin}/api/github/raw?url=${encodeURIComponent(item.rawUrl)}`;

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [pages, setPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [fitMode, setFitMode] = useState(true);
  const [annotating, setAnnotating] = useState(false);
  const [annoTool, setAnnoTool] = useState<AnnoTool>('pen');
  const [annoColor, setAnnoColor] = useState(ANNO_COLORS[0]);
  const [annos, setAnnos] = useState<Annotation[]>([]);
  const [textDraft, setTextDraft] = useState<{ page: number; x: number; y: number } | null>(null);
  const [draftText, setDraftText] = useState('');

  const [xdrawTick, setXdrawTick] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const annosRef = useRef<Annotation[]>([]);
  annosRef.current = annos;
  const drawingRef = useRef<any>(null);
  const zoomRef = useRef(1);
  const annotatingRef = useRef(false);
  annotatingRef.current = annotating;

  const bodyRef = useRef<HTMLDivElement>(null);
  const sectionWidthRef = useRef(0);
  const fitModeRef = useRef(true);

  const recenter = useCallback(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (zoomRef.current > 1) {
          scroll.scrollLeft = (scroll.scrollWidth - scroll.clientWidth) / 2;
        } else {
          scroll.scrollLeft = 0;
        }
      });
    });
  }, []);

  const zoomBy = useCallback(
    (dir: 1 | -1) => {
      const next = Math.min(4, Math.max(0.2, +(zoomRef.current * (dir > 0 ? 1.25 : 0.8)).toFixed(3)));
      zoomRef.current = next;
      setZoom(next);
      fitModeRef.current = false;
      setFitMode(false);
    },
    []
  );

  const fit = useCallback(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    let w = sectionWidthRef.current;
    if (!w) {
      const section = bodyRef.current?.querySelector('.docx-wrapper > section.docx') as HTMLElement | null;
      if (section) w = section.getBoundingClientRect().width / zoomRef.current;
    }
    if (!w) w = 800;
    sectionWidthRef.current = w;
    const z = Math.min(Math.max((scroll.clientWidth - 16) / w, 0.2), 1);
    zoomRef.current = z;
    fitModeRef.current = true;
    setZoom(z);
    setFitMode(true);
  }, []);

  const zoomFnRef = useRef(zoomBy);
  zoomFnRef.current = zoomBy;
  const fitFnRef = useRef(fit);
  fitFnRef.current = fit;

  const toggleAnnotate = () => {
    if (annotating) drawingRef.current = null;
    setAnnotating((v) => !v);
  };

  useEffect(() => {
    const images = annos.filter((a) => a.type === 'xdraw' && a.image);
    if (!images.length) return;
    let pending = false;
    for (const a of images) {
      if (preloadXdraw(a, () => setXdrawTick((t) => t + 1))) pending = true;
    }
    if (pending) setXdrawTick((t) => t + 1);
  }, [annos]);

  useEffect(() => () => clearXdrawCache(), []);

  // Load and render DOCX
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError('');

    (async () => {
      try {
        let res: Response | null = null;
        try { res = await cachedFetch(src); } catch { res = null; }

        if (!res || !res.ok) {
          for (let attempt = 0; attempt < 3; attempt++) {
            try { res = await fetch(src); if (res.ok) break; } catch { res = null; }
            if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          }
        }

        if (!res || !res.ok) throw new Error(res ? `Failed to load file (HTTP ${res.status})` : 'Failed to load this file.');

        const data = await res.arrayBuffer();
        if (cancelled) return;

        if (!bodyRef.current) return;
        const { renderAsync } = await import('docx-preview');
        if (cancelled) return;
        await renderAsync(data, bodyRef.current, bodyRef.current, {
          className: 'docx', inWrapper: true, ignoreWidth: false, ignoreHeight: false,
          ignoreFonts: false, breakPages: true, ignoreLastRenderedPageBreak: false,
        });
        if (cancelled) return;
        setPages(bodyRef.current.querySelectorAll('.docx-wrapper > section.docx').length);
        setStatus('ready');
      } catch (e: any) {
        if (!cancelled) { setError(e?.message || String(e)); setStatus('error'); }
      }
    })();

    return () => { cancelled = true; if (bodyRef.current) bodyRef.current.innerHTML = ''; };
  }, [src]);

  const { syncOverlays } = useDocxAnnotations({
    scrollRef, bodyRef, annosRef, drawingRef, annotatingRef, setAnnos,
    isPdf: false, status, annotating, annoTool, annoColor,
  });

  useViewerShortcuts({ zoomFnRef, fitFnRef, scrollRef });

  useEffect(() => {
    if (status !== 'ready') return;
    syncOverlays();
  }, [status, annos, zoom, xdrawTick, syncOverlays]);

  useEffect(() => {
    if (status !== 'ready') return;
    const wrapper = bodyRef.current?.querySelector('.docx-wrapper') as HTMLElement | null;
    if (wrapper) { wrapper.style.width = 'max-content'; wrapper.style.margin = '0 auto'; }
    const raf = requestAnimationFrame(() => { fit(); recenter(); syncOverlays(); });
    return () => cancelAnimationFrame(raf);
  }, [status, fit, recenter, syncOverlays]);

  useEffect(() => {
    if (status !== 'ready') return;
    recenter();
    syncOverlays();
  }, [zoom, status, recenter, syncOverlays]);

  useEffect(() => {
    const onResize = () => {
      const sc = scrollRef.current;
      if (!sc) return;
      if (fitModeRef.current) fit();
      recenter();
      syncOverlays();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [fit, recenter, syncOverlays]);

  return (
    <div ref={rootRef} className="fixed inset-0 z-[1500] bg-[#0a0f1e] flex flex-col wco-titlebar-pad">
      <DocToolbar
        isPdf={false}
        name={item.name}
        status={status}
        pages={pages}
        zoom={zoom}
        downloadHref={src}
        annotating={annotating}
        canDownloadAnnotated={false}
        annotatedExporting={false}
        onToggleAnnotate={toggleAnnotate}
        onDownloadAnnotated={() => {}}
        onZoomBy={zoomBy}
        onFit={fit}
        onClose={onClose}
      />
      <DocxStage
        scrollRef={scrollRef}
        bodyRef={bodyRef}
        status={status}
        error={error}
        zoom={zoom}
        annotating={annotating}
        openHref={src}
        onZoomChange={(z) => { zoomRef.current = z; setZoom(z); setFitMode(false); }}
      />
    </div>
  );
}
