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
    <div className="fixed inset-0 z-[1500] bg-black">
      <button
        onClick={onClose}
        title="Close (Esc)"
        className="absolute top-[6px] right-[8px] z-[9999] w-[32px] h-[32px] rounded-md bg-[#ef4444] hover:bg-[#dc2626] text-white border-none cursor-pointer flex items-center justify-center text-[0.8rem] shadow-md transition-all"
      >
        <i className="fas fa-times"></i>
      </button>
      <iframe
        src={viewerUrl}
        className="w-full h-full border-none"
        title={name}
      />
    </div>
  );
}
