import { useEffect, useRef } from 'react';
import type { MutableRefObject, RefObject } from 'react';

interface UsePdfPinchOptions {
  isPdf: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  zoomRef: MutableRefObject<number>;
  setZoom: (z: number) => void;
}

export function usePdfPinch({ isPdf, scrollRef, zoomRef, setZoom }: UsePdfPinchOptions) {
  const pinchRef = useRef<any>(null);

  useEffect(() => {
    if (!isPdf) return;
    const el = scrollRef.current;
    if (!el) return;

    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      pinchRef.current = {
        active: true,
        startDist: dist(e.touches),
        startScale: zoomRef.current,
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
        zoomRef.current = next;
        setZoom(next);
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
  }, [isPdf, scrollRef, zoomRef, setZoom]);

  return pinchRef;
}
