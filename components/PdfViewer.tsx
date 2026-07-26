'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface PdfViewerProps {
  url: string;
  name: string;
  filePath: string;
  onClose: () => void;
}

export default function PdfViewer({ url, name, filePath, onClose }: PdfViewerProps) {
  const [savedPage, setSavedPage] = useState(1);
  const iframeRef = useRef<HTMLIFrameElement>(null);

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
      if (e.data?.type === 'pdf-page-change' && e.data.filePath === filePath) {
        try { localStorage.setItem(`pdf-page-${filePath}`, String(e.data.page)); } catch {}
      }
      if (e.data?.type === 'pdf-close') onClose();
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [filePath, onClose]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const viewerUrl = `/pdf-viewer/viewer.html?file=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}&path=${encodeURIComponent(filePath)}#page=${savedPage}`;

  return (
    <div className="pdf-viewer-overlay" onClick={onClose}>
      <div className="pdf-viewer-container" onClick={e => e.stopPropagation()}>
        <button className="pdf-close-btn" onClick={onClose} title="Close (Esc)">
          <i className="fas fa-times"></i>
        </button>
        <div className="pdf-viewer-header">
          <div className="pdf-viewer-filename">
            <i className="fas fa-file-pdf" style={{ color: '#ef4444' }}></i>
            <span>{name}</span>
          </div>
        </div>
        <div className="pdf-webviewer">
          <iframe
            ref={iframeRef}
            src={viewerUrl}
            className="w-full h-full border-none rounded-b-xl"
            title={name}
            allow="annotation"
            style={{ minHeight: 'calc(100vh - 120px)' }}
          />
        </div>
      </div>
    </div>
  );
}
