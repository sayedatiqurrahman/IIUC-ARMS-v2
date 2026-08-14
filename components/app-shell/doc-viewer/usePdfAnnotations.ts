import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, PointerEvent as RPointerEvent, SetStateAction } from 'react';
import { clamp01, drawAnno, type Annotation, type AnnoPoint, type AnnoType } from '@/lib/annotations';

interface UsePdfAnnotationsOptions {
  isPdf: boolean;
  annotating: boolean;
  annoTool: AnnoType;
  annoColor: string;
  setAnnos: Dispatch<SetStateAction<Annotation[]>>;
  annosRef: MutableRefObject<Annotation[]>;
  drawingRef: MutableRefObject<any>;
  annCanvasRefs: MutableRefObject<(HTMLCanvasElement | null)[]>;
  setTextDraft: Dispatch<SetStateAction<{ page: number; x: number; y: number } | null>>;
  setDraftText: Dispatch<SetStateAction<string>>;
}

export function usePdfAnnotations({
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
}: UsePdfAnnotationsOptions) {
  const paintPdfPage = useCallback(
    (pageIndex: number, extra?: Annotation) => {
      const canvas = annCanvasRefs.current[pageIndex];
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      if (!cw || !ch) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.floor(cw * dpr) || canvas.height !== Math.floor(ch * dpr)) {
        canvas.width = Math.floor(cw * dpr);
        canvas.height = Math.floor(ch * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      for (const a of annosRef.current) {
        if (a.page === pageIndex + 1) drawAnno(ctx, a, cw, ch);
      }
      if (extra && extra.page === pageIndex + 1) drawAnno(ctx, extra, cw, ch);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const getNorm = (e: RPointerEvent<HTMLDivElement>, el: HTMLDivElement): AnnoPoint => {
    const r = el.getBoundingClientRect();
    return {
      x: r.width ? clamp01((e.clientX - r.left) / r.width) : 0,
      y: r.height ? clamp01((e.clientY - r.top) / r.height) : 0,
    };
  };

  const onPdfPagePointerDown = (pageIndex: number, e: RPointerEvent<HTMLDivElement>) => {
    if (!isPdf || !annotating) return;
    e.preventDefault();
    e.stopPropagation();
    if (annoTool === 'text') {
      const p = getNorm(e, e.currentTarget);
      setTextDraft({ page: pageIndex + 1, x: p.x, y: p.y });
      setDraftText('');
      return;
    }
    drawingRef.current = {
      page: pageIndex + 1,
      points: [getNorm(e, e.currentTarget)],
      id: Math.random().toString(36).slice(2),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPdfPagePointerMove = (pageIndex: number, e: RPointerEvent<HTMLDivElement>) => {
    const d = drawingRef.current;
    if (!isPdf || !d) return;
    e.preventDefault();
    d.points.push(getNorm(e, e.currentTarget));
    const temp: Annotation = {
      id: d.id,
      page: d.page,
      type: annoTool,
      color: annoColor,
      points: d.points,
      lineWidth: 0.0035,
      fontSize: 0.018,
    };
    paintPdfPage(pageIndex, temp);
  };

  const onPdfPagePointerUp = (pageIndex: number, e: RPointerEvent<HTMLDivElement>) => {
    const d = drawingRef.current;
    if (!isPdf || !d) return;
    drawingRef.current = null;
    e.preventDefault();
    const pts = d.points;
    if (pts.length < 2) return;
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (Math.hypot(last.x - first.x, last.y - first.y) < 0.004) return;
    setAnnos((prev) => [
      ...prev,
      {
        id: d.id,
        page: d.page,
        type: annoTool,
        color: annoColor,
        points: pts,
        lineWidth: 0.0035,
        fontSize: 0.018,
      },
    ]);
  };

  return { paintPdfPage, onPdfPagePointerDown, onPdfPagePointerMove, onPdfPagePointerUp };
}
