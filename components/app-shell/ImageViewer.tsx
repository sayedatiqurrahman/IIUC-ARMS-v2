'use client';

import { useRef, useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { toggleFullscreen } from '@/lib/fullscreen';
import { cachedFetch } from '@/lib/file-cache';

export default function ImageViewer({ item, onClose }: { item: any; onClose: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const panRef = useRef({x:0,y:0});
  const dragRef = useRef({dragging:false,startX:0,startY:0});
  const blobUrlRef = useRef<string>('');

  const [imgSrc, setImgSrc] = useState('');
  const [loading, setLoading] = useState(true);

  const zoom = useAppStore(s => s.imgZoom);
  const rotation = useAppStore(s => s.imgRotation);
  const setZoom = useAppStore(s => s.setImgZoom);
  const setRotation = useAppStore(s => s.setImgRotation);

  // Load image via cache
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await cachedFetch(item.rawUrl);
        if (cancelled) return;
        const blob = await res.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setImgSrc(url);
      } catch {
        // Fallback to direct URL if cache fails
        if (!cancelled) setImgSrc(item.rawUrl);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = '';
      }
    };
  }, [item.rawUrl]);

  function applyTransform(z: number, r: number) {
    const img = imgRef.current;
    if (img) img.style.transform = `translate(${panRef.current.x}px,${panRef.current.y}px) scale(${z/100}) rotate(${r}deg)`;
  }

  function zoomIn() {
    const z = Math.min(zoom + 15, 400);
    setZoom(z);
    applyTransform(z, rotation);
  }

  function zoomOut() {
    const z = Math.max(zoom - 15, 20);
    setZoom(z);
    if (z <= 100) { panRef.current = {x:0,y:0}; applyTransform(z, rotation); }
    else applyTransform(z, rotation);
  }

  function fit() {
    setZoom(100); setRotation(0); panRef.current = {x:0,y:0};
    applyTransform(100, 0);
  }

  function rotate() {
    const r = (rotation + 90) % 360;
    setRotation(r);
    applyTransform(zoom, r);
  }

  function handToggle() {
    const z = zoom <= 100 ? 150 : zoom;
    setZoom(z);
    applyTransform(z, rotation);
  }

  useEffect(() => {
    const scrollArea = scrollRef.current;
    if (!scrollArea) return;

    function onMouseDown(e: MouseEvent) {
      if (zoom <= 100) return;
      e.preventDefault();
      dragRef.current = { dragging: true, startX: e.clientX - panRef.current.x, startY: e.clientY - panRef.current.y };
      scrollArea!.style.cursor = 'grabbing';
    }
    function onMouseMove(e: MouseEvent) {
      if (!dragRef.current.dragging) return;
      panRef.current = { x: e.clientX - dragRef.current.startX, y: e.clientY - dragRef.current.startY };
      applyTransform(zoom, rotation);
    }
    function onMouseUp() {
      if (dragRef.current.dragging) {
        dragRef.current.dragging = false;
        if (scrollArea) scrollArea.style.cursor = zoom > 100 ? 'grab' : 'default';
      }
    }
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      if (e.deltaY < 0) zoomIn(); else zoomOut();
    }

    scrollArea.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    scrollArea.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      scrollArea.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      scrollArea.removeEventListener('wheel', onWheel);
    };
  }, [zoom, rotation]);

  return (
    <div ref={rootRef} className="image-viewer-container">
      <div className="image-toolbar">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <i className="fas fa-image text-qsis flex-shrink-0"></i>
          <span className="text-[0.85rem] font-semibold truncate">{item.name}</span>
        </div>
        <button className="pdf-btn" onClick={zoomOut} title="Zoom Out"><i className="fas fa-minus"></i></button>
        <span className="text-[0.8rem] font-semibold min-w-[40px] text-center">{zoom}%</span>
        <button className="pdf-btn" onClick={zoomIn} title="Zoom In"><i className="fas fa-plus"></i></button>
        <button className="pdf-btn" onClick={fit} title="Fit"><i className="fas fa-arrows-to-bounds"></i></button>
        <button className="pdf-btn" onClick={rotate} title="Rotate"><i className="fas fa-redo"></i></button>
        <button className="pdf-btn" onClick={handToggle} title="Hand/Pan"><i className="fas fa-hand-paper"></i></button>
        <button className="pdf-btn" onClick={() => toggleFullscreen(rootRef.current)} title="Fullscreen"><i className="fas fa-expand"></i></button>
        <button className="pdf-btn" onClick={onClose} title="Close" style={{background:'#ef4444',color:'white',borderRadius:'7px'}}><i className="fas fa-times"></i></button>
      </div>
      <div className="image-scroll-area" ref={scrollRef} style={{cursor: zoom > 100 ? 'grab' : 'default'}}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <i className="fas fa-spinner fa-spin text-qsis text-2xl"></i>
          </div>
        )}
        {imgSrc && (
          <img ref={imgRef} src={imgSrc} alt={item.name} draggable={false} className="max-w-full max-h-full object-contain rounded transition-transform" />
        )}
      </div>
    </div>
  );
}
