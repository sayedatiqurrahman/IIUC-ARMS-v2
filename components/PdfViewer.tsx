'use client';

import { useRef } from 'react';
import { toggleFullscreen } from '@/lib/fullscreen';

interface PdfViewerProps {
  url: string;
  name: string;
  filePath?: string;
  onClose: () => void;
}

// Plain browser-native iframe PDF viewer (scrolling). The browser renders the
// PDF inline at full quality — no downloads unless the user clicks Download.
export default function PdfViewer({ url, name, onClose }: PdfViewerProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={rootRef} className="fixed inset-0 z-[1500] bg-black flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 bg-neutral-900 border-b border-neutral-800 shrink-0">
        <span className="text-neutral-300 text-[0.8rem] font-semibold truncate flex-1">{name}</span>
        <button className="pdf-btn" onClick={() => toggleFullscreen(rootRef.current)} title="Fullscreen">
          <i className="fas fa-expand"></i>
        </button>
        <a className="pdf-btn no-underline" href={url} download={name} title="Download" style={{ textDecoration: 'none' }}>
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
      <iframe src={url} title={name} className="flex-1 w-full border-none bg-white" style={{ overflow: 'auto' }} />
    </div>
  );
}
