import { useEffect } from 'react';
import type { MutableRefObject, RefObject } from 'react';

interface UseViewerShortcutsOptions {
  zoomFnRef: MutableRefObject<(dir: 1 | -1) => void>;
  fitFnRef: MutableRefObject<() => void>;
  scrollRef: RefObject<HTMLDivElement | null>;
}

export function useViewerShortcuts({ zoomFnRef, fitFnRef, scrollRef }: UseViewerShortcutsOptions) {
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
  }, [zoomFnRef, fitFnRef]);

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
  }, [scrollRef, zoomFnRef]);
}
