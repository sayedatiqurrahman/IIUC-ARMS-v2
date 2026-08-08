'use client';

import { useRef } from 'react';
import dynamic from 'next/dynamic';
import { toggleFullscreen } from '@/lib/fullscreen';

// react-doc-viewer is browser-only and heavy (pdf.js + office embed), so it is
// loaded lazily in a separate chunk — only when a document is actually opened.
const DocViewerInner = dynamic(() => import('./DocViewerInner'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#0a0f1e]">
      <div className="text-center">
        <div
          className="mx-auto mb-3"
          style={{
            width: 36,
            height: 36,
            border: '3px solid rgba(255,255,255,0.15)',
            borderTopColor: '#fff',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        ></div>
        <p className="text-[0.8rem] text-dark-text2">Loading viewer...</p>
      </div>
    </div>
  ),
});

// Inline viewer for pdf / doc / docx / xls / xlsx / ppt / pptx. Files are fetched
// and rendered inline (pdf.js for PDFs, Microsoft Office embed for docs) — they
// are never downloaded unless the user clicks the Download button.
export default function ReactDocViewer({ item, onClose }: { item: any; onClose: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const ext = item.path?.split('.').pop()?.toLowerCase() || '';
  const fileType = ext;

  return (
    <div ref={rootRef} className="fixed inset-0 z-[1500] bg-black flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 bg-neutral-900 border-b border-neutral-800 shrink-0">
        <span className="text-neutral-300 text-[0.8rem] font-semibold truncate flex-1">{item.name}</span>
        <button className="pdf-btn" onClick={() => toggleFullscreen(rootRef.current)} title="Fullscreen">
          <i className="fas fa-expand"></i>
        </button>
        <a className="pdf-btn no-underline" href={item.rawUrl} download={item.name} title="Download" style={{ textDecoration: 'none' }}>
          <i className="fas fa-download"></i>
        </a>
        <button
          className="pdf-btn"
          onClick={onClose}
          title="Close"
          style={{ background: '#ef4444', color: 'white', borderRadius: '7px' }}
        >
          <i className="fas fa-times"></i>
        </button>
      </div>
      <div className="flex-1 overflow-hidden relative">
        <DocViewerInner uri={item.rawUrl} fileType={fileType} />
      </div>
    </div>
  );
}
