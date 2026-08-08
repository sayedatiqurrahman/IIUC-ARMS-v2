'use client';

import { useState, useRef } from 'react';
import { toggleFullscreen } from '@/lib/fullscreen';

export default function OfficeViewer({ item, onClose }: { item: any; onClose: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [fallback, setFallback] = useState(false);

  const typeLabel = item.mimeType === 'doc' ? 'Word' : item.mimeType === 'sheet' ? 'Excel' : 'PowerPoint';
  const typeIcon = item.mimeType === 'doc' ? 'fa-file-word' : item.mimeType === 'sheet' ? 'fa-file-excel' : 'fa-file-powerpoint';
  const typeColor = item.mimeType === 'doc' ? '#3b82f6' : item.mimeType === 'sheet' ? '#22c55e' : '#f97316';

  const embedUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(item.rawUrl)}`;

  return (
    <div ref={rootRef} className="image-viewer-container">
      <div className="image-toolbar">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <i className={`fas ${typeIcon}`} style={{ color: typeColor, flexShrink: 0 }}></i>
          <span className="text-[0.85rem] font-semibold truncate">{item.name}</span>
        </div>
        <button className="pdf-btn" onClick={() => setFallback(!fallback)} title={fallback ? 'Switch to online preview' : 'Switch to default browser view (plain iframe)'}>
          <i className="fas fa-window-maximize"></i>
        </button>
        <button className="pdf-btn" onClick={() => toggleFullscreen(rootRef.current)} title="Fullscreen"><i className="fas fa-expand"></i></button>
        <a className="pdf-btn no-underline" href={item.rawUrl} target="_blank" rel="noreferrer" title="Download"><i className="fas fa-download"></i></a>
        <button className="pdf-btn" onClick={onClose} title="Close" style={{ background: '#ef4444', color: 'white', borderRadius: '7px' }}><i className="fas fa-times"></i></button>
      </div>
      <div className="flex-1 overflow-hidden relative bg-[#0a0f1e]">
        {fallback ? (
          <iframe src={item.rawUrl} title={item.name} className="w-full h-full border-none bg-white" style={{ overflow: 'auto' }} />
        ) : !failed ? (
          <>
            <iframe src={embedUrl} className="w-full border-none" style={{ minHeight: 'calc(100vh - 50px)' }} onError={() => { setFailed(true); setFallback(true); }} />
            <div className="absolute bottom-2 right-3 z-10">
              <a href={item.rawUrl} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg bg-qsis text-white text-[0.72rem] font-semibold no-underline">
                <i className="fas fa-external-link-alt mr-1"></i>Open in new tab
              </a>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-dark-text2 px-6 text-center">
            <i className={`fas ${typeIcon} text-4xl mb-3`} style={{ color: typeColor }}></i>
            <p className="text-sm mb-1">Online preview is unavailable for this {typeLabel} file.</p>
            <p className="text-[0.78rem] text-dark-text3 mb-4">Download it and open with Microsoft {typeLabel}, or use the link below.</p>
            <div className="flex gap-2">
              <a href={item.rawUrl} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl bg-qsis text-white text-sm font-semibold no-underline">
                <i className="fas fa-external-link-alt mr-1"></i>Open in new tab
              </a>
              <a href={item.rawUrl} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl bg-dark-bg3 border border-dark-border text-dark-text text-sm font-semibold no-underline">
                <i className="fas fa-download mr-1"></i>Download
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
