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
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const viewerUrl = `https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(url)}#page=${savedPage}`;

  return (
    <div className="fixed inset-0 z-[1500] flex flex-col bg-black" onClick={onClose}>
      <div className="w-full h-[3px] bg-gradient-to-r from-[#34d399] via-[#10b981] to-[#059669] flex-shrink-0" />
      <div className="relative flex-1" onClick={e => e.stopPropagation()}>
        <button
          onClick={onClose}
          title="Close (Esc)"
          className="absolute top-2 right-2 z-[9999] w-9 h-9 rounded-lg bg-[#ef4444]/90 hover:bg-[#dc2626] text-white border-none cursor-pointer flex items-center justify-center text-sm shadow-lg transition-all backdrop-blur-sm"
        >
          <i className="fas fa-times"></i>
        </button>
        <iframe
          src={viewerUrl}
          className="w-full h-full border-none"
          title={name}
        />
      </div>
    </div>
  );
}
