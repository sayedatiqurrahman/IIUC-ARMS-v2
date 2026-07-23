'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    WebViewer?: any;
  }
}

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
          fullScreen: true,
          header: false,
        },
        viewerRef.current,
      );

      if (cancelled) return;
      instanceRef.current = instance;

      const { documentViewer, annotationManager } = instance.Core;

      annotationManager.setIsAdminUser(true);

      instance.UI.setToolbarPosition({ top: 0, left: 0, right: 0 });
      instance.UI.setHeaderPosition({ top: 0 });

      documentViewer.addEventListener('documentLoaded', () => {
        instance.UI.setActiveToolGroup('markup');
      });

      documentViewer.addEventListener('finishedRendering', () => {
        const currentDoc = documentViewer.getDocument();
        if (currentDoc) {
          const pdfDocRef = { getPages: () => currentDoc.getPageCount ? [] : [] };
          try {
            if (typeof window !== 'undefined') {
              const savedPage = localStorage.getItem(`pdf-page-${filePath}`);
              if (savedPage) {
                const pageNum = parseInt(savedPage);
                if (pageNum > 0) {
                  documentViewer.setCurrentPage(pageNum, false);
                }
              }
            }
          } catch {}
        }
      });

      documentViewer.addEventListener('pageChanged', (e: any) => {
        try {
          if (typeof window !== 'undefined') {
            localStorage.setItem(`pdf-page-${filePath}`, String(e.pageNumber));
          }
        } catch {}
      });
    }

    init();

    return () => {
      cancelled = true;
      if (instanceRef.current) {
        try {
          instanceRef.current.Core?.documentViewer?.closeAllDocuments();
        } catch {}
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
