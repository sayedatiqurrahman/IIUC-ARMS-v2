import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import { ANNO_COLORS, clamp01, drawAnno, makeAnno, type Annotation, type AnnoTool } from '@/lib/annotations';

interface UseDocxAnnotationsOptions {
  scrollRef: RefObject<HTMLDivElement | null>;
  bodyRef: RefObject<HTMLDivElement | null>;
  annosRef: MutableRefObject<Annotation[]>;
  drawingRef: MutableRefObject<any>;
  annotatingRef: MutableRefObject<boolean>;
  setAnnos: Dispatch<SetStateAction<Annotation[]>>;
  isPdf: boolean;
  status: 'loading' | 'ready' | 'error';
  annotating: boolean;
  annoTool: AnnoTool;
  annoColor: string;
}

export function useDocxAnnotations({
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
}: UseDocxAnnotationsOptions) {
  const overlayRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const sectionsRef = useRef<HTMLElement[]>([]);
  const textDraftDocxRef = useRef<{ idx: number; x: number; y: number; input: HTMLInputElement } | null>(null);

  const annoToolRef = useRef<AnnoTool>('pen');
  annoToolRef.current = annoTool;
  const annoColorRef = useRef(ANNO_COLORS[0]);
  annoColorRef.current = annoColor;

  const isShapeTool = (t: AnnoTool) => t === 'rect' || t === 'ellipse' || t === 'line' || t === 'arrow';

  const paintDocxSection = useCallback(
    (idx: number) => {
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
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

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
      paintDocxSection(idx);
    });
  }, [paintDocxSection]);

  const commitDocxText = useCallback(() => {
    const d = textDraftDocxRef.current;
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
    textDraftDocxRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancelDocxTextDraft = useCallback(() => {
    const d = textDraftDocxRef.current;
    if (d && d.input) d.input.remove();
    textDraftDocxRef.current = null;
  }, []);

  useEffect(() => {
    if (isPdf) return;
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
        textDraftDocxRef.current = { idx: hit.idx, x: p.x, y: p.y, input };
        const cancel = () => {
          const d = textDraftDocxRef.current;
          if (d && d.input) d.input.remove();
          textDraftDocxRef.current = null;
        };
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            commitDocxText();
          } else if (ev.key === 'Escape') {
            cancel();
          }
        });
        input.addEventListener('blur', commitDocxText);
        return;
      }

      drawingRef.current = { idx: hit.idx, el: hit.sec, tool: annoToolRef.current, start: p, points: [p], id: Math.random().toString(36).slice(2) };
      hit.sec.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      const d = drawingRef.current;
      if (!d) return;
      e.preventDefault();
      const r = d.el.getBoundingClientRect();
      const cur = {
        x: clamp01(r.width ? (e.clientX - r.left) / r.width : 0),
        y: clamp01(r.height ? (e.clientY - r.top) / r.height : 0),
      };
      if (isShapeTool(d.tool)) d.points = [d.start, cur];
      else d.points.push(cur);
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
      drawAnno(ctx, makeAnno(d.id, d.idx, d.tool, annoColorRef.current, d.points), w, h);
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
      setAnnos((prev) => [...prev, makeAnno(d.id, d.idx, d.tool, annoColorRef.current, pts)]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPdf, status, commitDocxText]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body || status !== 'ready' || isPdf) return;
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
  }, [status, isPdf, syncOverlays]);

  useEffect(() => {
    if (isPdf) return;
    const body = bodyRef.current;
    if (!body) return;
    body.querySelectorAll('.docx-wrapper > section.docx').forEach((sec) => {
      const el = sec as HTMLElement;
      el.style.touchAction = annotating ? 'none' : '';
      el.style.userSelect = annotating ? 'none' : '';
      el.style.cursor = annotating ? 'crosshair' : '';
    });
  }, [annotating, status, isPdf]);

  return { syncOverlays, paintDocxSection, cancelDocxTextDraft };
}
