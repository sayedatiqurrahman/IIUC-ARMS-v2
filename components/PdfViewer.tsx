'use client';

import { useEffect, useRef } from 'react';

interface PdfViewerProps {
  url: string;
  name: string;
  filePath: string;
  onClose: () => void;
}

export default function PdfViewer({ url, name, filePath, onClose }: PdfViewerProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<any>(null);

  useEffect(() => {
    if (!viewerRef.current || instanceRef.current) return;

    let cancelled = false;

    async function init() {
      const WebViewerModule = (await import('@pdftron/pdfjs-express')).default;
      if (cancelled || !viewerRef.current) return;

      const instance = await WebViewerModule(
        {
          path: '/webviewer/lib',
          initialDoc: url,
          licenseKey: 'demo',
          disableLogs: true,
        },
        viewerRef.current,
      );

      if (cancelled) return;
      instanceRef.current = instance;

      const { documentViewer, annotationManager } = instance.Core;
      annotationManager.setIsAdminUser(true);

      documentViewer.addEventListener('documentLoaded', () => {
        try {
          const saved = localStorage.getItem(`pdf-page-${filePath}`);
          if (saved) {
            const pageNum = parseInt(saved);
            if (pageNum > 0) documentViewer.setCurrentPage(pageNum, false);
          }
        } catch {}
      });

      documentViewer.addEventListener('pageChanged', (e: any) => {
        try {
          localStorage.setItem(`pdf-page-${filePath}`, String(e.pageNumber));
        } catch {}
      });

      try {
        const iframe = viewerRef.current.querySelector('iframe');
        if (iframe?.contentDocument) {
          const style = iframe.contentDocument.createElement('style');
          style.textContent = `
            [class*="watermark"], [class*="Watermark"] { display: none !important; }
            [data-element="watermark"] { display: none !important; }
            .HeaderContainer, .ToolsContainer { background: #1e293b !important; }
            .HeaderContainer *, .ToolsContainer * { color: #e2e8f0 !important; }
            .PanelContainer, .LeftPanel { background: #0f172a !important; }
            .PanelContainer *, .LeftPanel * { color: #e2e8f0 !important; }
            .DocumentContainer { background: #1a1a2e !important; }
            .ScrollBar { background: #1e293b !important; }
            .Thumb { background: #475569 !important; }
          `;
          iframe.contentDocument.head.appendChild(style);
        }
      } catch {}
    }

    init();

    return () => {
      cancelled = true;
      if (instanceRef.current) {
        try { instanceRef.current.Core?.documentViewer?.closeAllDocuments(); } catch {}
        instanceRef.current = null;
      }
    };
  }, [url, filePath]);

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
        <div className="pdf-webviewer" ref={viewerRef}></div>
      </div>
    </div>
  );
}
