'use client';

import { useCallback, useRef, type RefObject } from 'react';
import StatusOverlay from './StatusOverlay';

interface DocxStageProps {
  scrollRef: RefObject<HTMLDivElement | null>;
  bodyRef: RefObject<HTMLDivElement | null>;
  status: 'loading' | 'ready' | 'error';
  error: string;
  zoom: number;
  annotating: boolean;
  openHref: string;
  onZoomChange?: (zoom: number) => void;
}

export default function DocxStage({ scrollRef, bodyRef, status, error, zoom, annotating, openHref, onZoomChange }: DocxStageProps) {
  const pinchRef = useRef({ dist: 0, zoom: 1 });

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = { dist: Math.hypot(dx, dy), zoom };
    }
  }, [zoom]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const scale = dist / pinchRef.current.dist;
      const newZoom = Math.min(4, Math.max(0.2, pinchRef.current.zoom * scale));
      if (bodyRef.current) {
        bodyRef.current.style.zoom = String(newZoom);
      }
    }
  }, [bodyRef]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2 && bodyRef.current) {
      const currentZoom = parseFloat(bodyRef.current.style.zoom || '1');
      if (onZoomChange) onZoomChange(currentZoom);
    }
  }, [bodyRef, onZoomChange]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-auto min-h-0"
      style={{ background: '#0a0f1e', cursor: annotating ? 'crosshair' : undefined, touchAction: 'auto' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <StatusOverlay status={status} error={error} variant="docx" openHref={openHref} />
      <div ref={bodyRef} className="px-3 py-4 flex flex-col" style={{ zoom, alignItems: 'flex-start' }} />
    </div>
  );
}
