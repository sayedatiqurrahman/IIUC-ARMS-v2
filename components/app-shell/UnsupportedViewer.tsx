'use client';

import { useRef } from 'react';
import { toggleFullscreen } from '@/lib/fullscreen';

export default function UnsupportedViewer({ item, onClose, kindle = false }: { item: any; onClose: () => void; kindle?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const ext = item.path?.split('.').pop()?.toUpperCase() || '';

  return (
    <div ref={rootRef} className="image-viewer-container">
      <div className="image-toolbar">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <i className={`fas ${kindle ? 'fa-book-open' : 'fa-file'} text-dark-text3 flex-shrink-0`}></i>
          <span className="text-[0.85rem] font-semibold truncate">{item.name}</span>
        </div>
        <button className="pdf-btn" onClick={() => toggleFullscreen(rootRef.current)} title="Fullscreen"><i className="fas fa-expand"></i></button>
        <a className="pdf-btn no-underline" href={item.rawUrl} target="_blank" rel="noreferrer" title="Download"><i className="fas fa-download"></i></a>
        <button className="pdf-btn" onClick={onClose} title="Close" style={{ background: '#ef4444', color: 'white', borderRadius: '7px' }}><i className="fas fa-times"></i></button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center text-dark-text2 min-h-[calc(100vh-50px)] px-6 text-center" style={{ background: '#0a0f1e' }}>
        {kindle ? (
          <>
            <i className="fab fa-kindle text-5xl mb-4 text-amber-400"></i>
            <p className="text-base font-semibold text-dark-text mb-1">{ext || 'Kindle'} e-book</p>
            <p className="text-sm max-w-md mb-1">
              {ext || 'Kindle'} files can&apos;t be previewed in the browser — they&apos;re Amazon Kindle formats.
            </p>
            <p className="text-[0.78rem] text-dark-text3 max-w-md mb-5">
              Download the file and open it with the <strong className="text-dark-text">Kindle app</strong> on your phone/tablet, Kindle device, or the free <strong className="text-dark-text">Calibre</strong> desktop app (which can also convert it to EPUB/PDF).
            </p>
            <div className="flex gap-2">
              <a href={item.rawUrl} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl bg-amber-500 text-black text-sm font-semibold no-underline">
                <i className="fas fa-download mr-1"></i> Download {ext}
              </a>
              <a href={item.rawUrl} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl bg-dark-bg3 border border-dark-border text-dark-text text-sm font-semibold no-underline">
                <i className="fas fa-external-link-alt mr-1"></i> Open
              </a>
            </div>
          </>
        ) : (
          <>
            <i className="fas fa-file text-5xl mb-4 opacity-50"></i>
            <p className="text-sm mb-1">Preview not available for this file type.</p>
            <p className="text-[0.78rem] text-dark-text3 mb-5">Download it or open it in a new tab.</p>
            <div className="flex gap-2">
              <a href={item.rawUrl} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl bg-qsis text-white text-sm font-semibold no-underline">
                <i className="fas fa-download mr-1"></i> Download
              </a>
              <a href={item.rawUrl} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl bg-dark-bg3 border border-dark-border text-dark-text text-sm font-semibold no-underline">
                <i className="fas fa-external-link-alt mr-1"></i> Open in new tab
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
