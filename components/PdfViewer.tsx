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

  const viewerUrl = `/pdfjs/viewer.html?file=${encodeURIComponent(url)}&path=${encodeURIComponent(filePath)}#page=${savedPage}`;

  return (
    <div className="fixed inset-0 z-[1500] bg-black">
      <iframe
        src={viewerUrl}
        className="w-full h-full border-none"
        title={name}
      />
    </div>
  );
}
