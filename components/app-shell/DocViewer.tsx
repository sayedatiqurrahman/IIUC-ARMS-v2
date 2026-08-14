'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ANNO_COLORS, type Annotation, type AnnoType } from '@/lib/annotations';
import DocToolbar from './doc-viewer/DocToolbar';
import AnnoToolbar from './doc-viewer/AnnoToolbar';
import PdfStage from './doc-viewer/PdfStage';
import DocxStage from './doc-viewer/DocxStage';
import { useDocxAnnotations } from './doc-viewer/useDocxAnnotations';
import { usePdfAnnotations } from './doc-viewer/usePdfAnnotations';
import { usePdfLaser } from './doc-viewer/usePdfLaser';
import { usePdfPinch } from './doc-viewer/usePdfPinch';
import { useViewerShortcuts } from './doc-viewer/useViewerShortcuts';

// Unified document viewer: renders both PDF (pdf.js) and .docx (docx-preview)
// through a single toolbar + annotation system, so one lazy-loaded chunk covers
// every "document" file type. Bytes always come from the same-origin proxy.
//
// Zoom: Ctrl+/-/0 and Ctrl+wheel on both formats; pinch on touch for PDF.
// Annotation: pen / highlighter / text with colour swatches, undo and clear.
// Marks live in normalized page coordinates and are redrawn on any zoom /
// layout change so they stay aligned for both canvas pages (PDF) and
// docx-preview sections (DOCX).
//
// The feature is split into small parts under ./doc-viewer/:
//   DocToolbar / AnnoToolbar / StatusOverlay  — pure UI
//   PdfStage / PdfPage / DocxStage           — layout of each format
//   usePdfAnnotations / useDocxAnnotations   — drawing logic
//   usePdfLaser / usePdfPinch / useViewerShortcuts — input handling
export default function DocViewer({ item, onClose }: { item: any; onClose: () => void }) {
  const ext = item.path?.split('.').pop()?.toLowerCase() || '';
  const isPdf = ext === 'pdf';
  const src = `${window.location.origin}/api/github/raw?url=${encodeURIComponent(item.rawUrl)}`;

  // ---- Shared state -------------------------------------------------------

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [pages, setPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [fitMode, setFitMode] = useState(true);
  const [annotating, setAnnotating] = useState(false);
  const [annoTool, setAnnoTool] = useState<AnnoType>('pen');
  const [annoColor, setAnnoColor] = useState(ANNO_COLORS[0]);
  const [annos, setAnnos] = useState<Annotation[]>([]);
  const [textDraft, setTextDraft] = useState<{ page: number; x: number; y: number } | null>(null);
  const [draftText, setDraftText] = useState('');

  // PDF-only tool state (laser / hand / annotate).
  const [tool, setTool] = useState<'laser' | 'hand' | 'annotate'>('hand');
  const [grabbing, setGrabbing] = useState(false);
  const [centerV, setCenterV] = useState(true);

  // ---- Shared refs (mirrors for async handlers) ---------------------------

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const annosRef = useRef<Annotation[]>([]);
  annosRef.current = annos;
  const drawingRef = useRef<any>(null);
  const zoomRef = useRef(1);
  const annotatingRef = useRef(false);
  annotatingRef.current = annotating;

  // ---- PDF refs -----------------------------------------------------------

  const stageRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<any>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const annCanvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const textInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef({ active: false, x: 0, y: 0, left: 0, top: 0 });

  // ---- DOCX refs ----------------------------------------------------------

  const bodyRef = useRef<HTMLDivElement>(null);
  const sectionWidthRef = useRef(0);
  const fitModeRef = useRef(true);

  // ---- Shared helpers -----------------------------------------------------

  const recenter = useCallback(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scroll.scrollLeft = (scroll.scrollWidth - scroll.clientWidth) / 2;
      });
    });
  }, []);

  const zoomBy = useCallback(
    (dir: 1 | -1) => {
      let next: number;
      if (isPdf) {
        next = Math.min(3, Math.max(0.5, +(zoomRef.current + dir * 0.2).toFixed(2)));
      } else {
        next = Math.min(4, Math.max(0.2, +(zoomRef.current * (dir > 0 ? 1.25 : 0.8)).toFixed(3)));
        fitModeRef.current = false;
        setFitMode(false);
      }
      zoomRef.current = next;
      setZoom(next);
    },
    [isPdf]
  );

  const fit = useCallback(() => {
    if (isPdf) {
      zoomRef.current = 1;
      setZoom(1);
      return;
    }
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
  }, [isPdf]);

  const zoomFnRef = useRef(zoomBy);
  zoomFnRef.current = zoomBy;
  const fitFnRef = useRef(fit);
  fitFnRef.current = fit;

  const toggleAnnotate = () => {
    const next = !annotating;
    if (!next) {
      setTextDraft(null);
      setDraftText('');
      drawingRef.current = null;
      cancelDocxTextDraft();
    }
    if (isPdf) setTool(next ? 'annotate' : 'hand');
    setAnnotating(next);
  };

  const selectTool = (t: 'laser' | 'hand') => {
    setTool(t);
    setAnnotating(false);
    setTextDraft(null);
    setDraftText('');
    drawingRef.current = null;
  };

  // ---- Load + render ------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError('');

    (async () => {
      try {
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
        if (cancelled) return;

        if (isPdf) {
          const pdfjs: any = await import(/* webpackIgnore: true */ '/pdfjs/pdf.min.mjs');
          pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
          const pdf = await pdfjs.getDocument({ data }).promise;
          if (cancelled) {
            pdf.destroy?.();
            return;
          }
          pdfRef.current = pdf;
          canvasRefs.current = [];
          setPages(pdf.numPages);
        } else {
          if (!bodyRef.current) return;
          const { renderAsync } = await import('docx-preview');
          if (cancelled) return;
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
        }
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
      if (isPdf) {
        pdfRef.current?.destroy?.();
        pdfRef.current = null;
        canvasRefs.current = [];
      }
      if (bodyRef.current) bodyRef.current.innerHTML = '';
    };
  }, [src, isPdf]);

  // ---- PDF: render pages --------------------------------------------------

  const renderAllPages = useCallback(async () => {
    const pdf = pdfRef.current;
    const container = scrollRef.current;
    if (!isPdf || !pdf || !container) return;
    const base = Math.max(container.clientWidth - 24, 320);
    for (let i = 0; i < canvasRefs.current.length; i++) {
      const canvas = canvasRefs.current[i];
      if (!canvas) continue;
      try {
        const page = await pdf.getPage(i + 1);
        const vp = page.getViewport({ scale: 1 });
        const fit = (base / vp.width) * zoomRef.current;
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
    recenter();
    requestAnimationFrame(() => {
      const sc = scrollRef.current;
      if (!sc) return;
      setCenterV(sc.scrollHeight <= sc.clientHeight + 2);
    });
  }, [isPdf, recenter, zoom]);

  useEffect(() => {
    if (status === 'ready' && isPdf) renderAllPages();
  }, [status, isPdf, renderAllPages]);

  // ---- Feature hooks (each owns its own DOM side-effects) ------------------

  const { syncOverlays, cancelDocxTextDraft } = useDocxAnnotations({
    scrollRef,
    bodyRef,
    annosRef,
    drawingRef,
    annotatingRef,
    setAnnos,
    isPdf,
    status,
    annotating,
    annoTool,
    annoColor,
  });

  const { paintPdfPage, onPdfPagePointerDown, onPdfPagePointerMove, onPdfPagePointerUp } = usePdfAnnotations({
    isPdf,
    annotating,
    annoTool,
    annoColor,
    setAnnos,
    annosRef,
    drawingRef,
    annCanvasRefs,
    setTextDraft,
    setDraftText,
  });

  const pinchRef = usePdfPinch({ isPdf, scrollRef, zoomRef, setZoom });
  usePdfLaser({ isPdf, tool, overlayRef, stageRef });
  useViewerShortcuts({ zoomFnRef, fitFnRef, scrollRef });

  // ---- Shared: repaint annotation overlays --------------------------------

  useEffect(() => {
    if (status !== 'ready') return;
    if (isPdf) annCanvasRefs.current.forEach((_, i) => paintPdfPage(i));
    else syncOverlays();
  }, [status, annos, zoom, isPdf, paintPdfPage, syncOverlays]);

  // ---- DOCX: initial layout + resize --------------------------------------

  useEffect(() => {
    if (status !== 'ready' || isPdf) return;
    const wrapper = bodyRef.current?.querySelector('.docx-wrapper') as HTMLElement | null;
    if (wrapper) {
      wrapper.style.width = 'max-content';
      wrapper.style.margin = '0 auto';
    }
    const raf = requestAnimationFrame(() => {
      fit();
      recenter();
      syncOverlays();
    });
    return () => cancelAnimationFrame(raf);
  }, [status, isPdf, fit, recenter, syncOverlays]);

  useEffect(() => {
    if (status !== 'ready' || isPdf) return;
    recenter();
    syncOverlays();
  }, [zoom, status, isPdf, recenter, syncOverlays]);

  useEffect(() => {
    const onResize = () => {
      const sc = scrollRef.current;
      if (!sc) return;
      if (isPdf) {
        sc.scrollLeft = (sc.scrollWidth - sc.clientWidth) / 2;
        setCenterV(sc.scrollHeight <= sc.clientHeight + 2);
        renderAllPages();
      } else if (fitModeRef.current) {
        fit();
      }
      recenter();
      if (!isPdf) syncOverlays();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isPdf, fit, recenter, syncOverlays, renderAllPages]);

  // ---- PDF: hand tool -----------------------------------------------------

  const onStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPdf || tool !== 'hand') return;
    const sc = scrollRef.current;
    if (!sc) return;
    dragRef.current = { active: true, x: e.clientX, y: e.clientY, left: sc.scrollLeft, top: sc.scrollTop };
    setGrabbing(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const sc = scrollRef.current;
    if (isPdf && tool === 'hand' && d.active && sc && !pinchRef.current?.active) {
      sc.scrollLeft = d.left - (e.clientX - d.x);
      sc.scrollTop = d.top - (e.clientY - d.y);
    }
  };

  const endStageDrag = () => {
    dragRef.current.active = false;
    setGrabbing(false);
  };

  // ---- PDF: text annotation commit -----------------------------------------

  const commitText = () => {
    if (!textDraft) return;
    const t = draftText.trim();
    if (t) {
      setAnnos((prev) => [
        ...prev,
        {
          id: Math.random().toString(36).slice(2),
          page: textDraft.page,
          type: 'text',
          color: annoColor,
          points: [{ x: textDraft.x, y: textDraft.y }],
          text: t,
          lineWidth: 0.0035,
          fontSize: 0.018,
        },
      ]);
    }
    setTextDraft(null);
    setDraftText('');
  };

  useEffect(() => {
    if (textDraft) textInputRef.current?.focus();
  }, [textDraft]);

  // ---- UI -------------------------------------------------------------------

  const stageCursor =
    !isPdf ? undefined : tool === 'laser' ? 'none' : tool === 'annotate' ? 'crosshair' : grabbing ? 'grabbing' : 'grab';

  return (
    <div ref={rootRef} className="fixed inset-0 z-[1500] bg-[#0a0f1e] flex flex-col wco-titlebar-pad">
      <DocToolbar
        isPdf={isPdf}
        name={item.name}
        status={status}
        pages={pages}
        zoom={zoom}
        annotating={annotating}
        tool={tool}
        downloadHref={src}
        onSelectTool={selectTool}
        onToggleAnnotate={toggleAnnotate}
        onZoomBy={zoomBy}
        onFit={fit}
        onClose={onClose}
      />

      {annotating && (
        <AnnoToolbar
          annoTool={annoTool}
          annoColor={annoColor}
          canUndo={annos.length > 0}
          onSetAnnoTool={setAnnoTool}
          onSetAnnoColor={setAnnoColor}
          onUndo={() => setAnnos((prev) => prev.slice(0, -1))}
          onClear={() => setAnnos([])}
        />
      )}

      {isPdf ? (
        <PdfStage
          stageRef={stageRef}
          scrollRef={scrollRef}
          overlayRef={overlayRef}
          canvasRefs={canvasRefs}
          annCanvasRefs={annCanvasRefs}
          textInputRef={textInputRef}
          status={status}
          error={error}
          pages={pages}
          tool={tool}
          grabbing={grabbing}
          centerV={centerV}
          annotating={annotating}
          textDraft={textDraft}
          draftText={draftText}
          openHref={src}
          stageCursor={stageCursor}
          onStagePointerDown={onStagePointerDown}
          onStagePointerMove={onStagePointerMove}
          onStagePointerUp={endStageDrag}
          onPagePointerDown={onPdfPagePointerDown}
          onPagePointerMove={onPdfPagePointerMove}
          onPagePointerUp={onPdfPagePointerUp}
          onPagePointerCancel={() => {
            drawingRef.current = null;
          }}
          onTextChange={setDraftText}
          onTextCommit={commitText}
          onTextCancel={() => {
            setTextDraft(null);
            setDraftText('');
          }}
        />
      ) : (
        <DocxStage
          scrollRef={scrollRef}
          bodyRef={bodyRef}
          status={status}
          error={error}
          zoom={zoom}
          annotating={annotating}
          openHref={src}
        />
      )}
    </div>
  );
}
