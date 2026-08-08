'use client';

import { useState, useEffect, useRef } from 'react';
import { toggleFullscreen } from '@/lib/fullscreen';

interface PdfViewerProps {
  url: string;
  name: string;
  filePath: string;
  onClose: () => void;
}

export default function PdfViewer({ url, name, filePath, onClose }: PdfViewerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [savedPage, setSavedPage] = useState(1);
  const [failed, setFailed] = useState(false);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`pdf-page-${filePath}`);
      if (saved) {
        const pageNum = parseInt(saved);
        if (pageNum > 0) setSavedPage(pageNum);
      }
    } catch {}
  }, [filePath]);

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === 'pdf-close') onClose();
      if (e.data?.type === 'pdf-fullscreen') toggleFullscreen(rootRef.current);
      if (e.data?.type === 'pdf-error') {
        setFailed(true);
        setFallback(true);
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onClose]);

  const viewerUrl = `/pdfjs/viewer.html?file=${encodeURIComponent(url)}&path=${encodeURIComponent(filePath)}#page=${savedPage}`;

  const btnCls = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.75rem] font-semibold border border-neutral-700 text-neutral-200 bg-neutral-900 hover:bg-neutral-800 cursor-pointer";

  return (
    <div ref={rootRef} className="fixed inset-0 z-[1500] bg-black">
      {fallback ? (
        <div className="w-full h-full flex flex-col">
          <div className="flex items-center gap-2 px-3 py-2 bg-neutral-900 border-b border-neutral-800 shrink-0">
            <span className="text-neutral-300 text-[0.8rem] font-semibold truncate flex-1">{name}</span>
            <button className={btnCls} onClick={() => setFallback(false)} title="Try the advanced viewer">
              <i className="fas fa-expand-arrows-alt"></i> Advanced
            </button>
            <button className={btnCls} onClick={() => toggleFullscreen(rootRef.current)} title="Fullscreen">
              <i className="fas fa-expand"></i> Fullscreen
            </button>
            <button
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.75rem] font-semibold text-white cursor-pointer"
              style={{ background: '#ef4444' }}
              onClick={onClose}
              title="Close"
            >
              <i className="fas fa-times"></i> Close
            </button>
          </div>
          {failed && (
            <div className="px-3 py-1.5 text-[0.7rem] text-amber-300 bg-amber-950/40 border-b border-amber-900/40">
              Advanced viewer couldn't render this PDF — showing the browser's default viewer instead.
            </div>
          )}
          <iframe src={url} title={name} className="flex-1 w-full border-none bg-white" style={{ overflow: 'auto' }} />
        </div>
      ) : (
        <>
          <iframe src={viewerUrl} className="w-full h-full border-none" title={name} />
          <button
            className="absolute top-2 right-[52px] z-10 px-3 py-1.5 rounded-lg bg-neutral-900/90 border border-neutral-700 text-neutral-200 text-[0.75rem] font-semibold hover:bg-neutral-800 cursor-pointer"
            onClick={() => setFallback(true)}
            title="Use the browser's default PDF viewer (plain iframe)"
          >
            Default view
          </button>
        </>
      )}
    </div>
  );
}
