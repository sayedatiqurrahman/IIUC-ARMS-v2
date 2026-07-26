'use client';

import { useState, useEffect } from 'react';

interface PdfViewerProps {
  url: string;
  name: string;
  filePath: string;
  onClose: () => void;
}

export default function PdfViewer({ url, name, filePath, onClose }: PdfViewerProps) {
  const [savedPage, setSavedPage] = useState(1);

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
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onClose]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const viewerUrl = `https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(url)}#page=${savedPage}`;

  return (
    <div className="fixed inset-0 z-[1500]">
      <iframe
        src={viewerUrl}
        className="w-full h-full border-none"
        title={name}
      />
      <button
        onClick={onClose}
        title="Close (Esc)"
        className="fixed z-[9999] flex items-center justify-center border-none cursor-pointer font-bold transition-colors"
        style={{
          top: '4px',
          right: '6px',
          width: '32px',
          height: '32px',
          borderRadius: '4px',
          background: '#ef4444',
          color: '#fff',
          fontSize: '14px',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#dc2626'; }}
        onMouseLeave={e => { e.currentTarget.style.background = '#ef4444'; }}
      >
        ✕
      </button>
    </div>
  );
}
