'use client';

import { useRef } from 'react';
import { toggleFullscreen } from '@/lib/fullscreen';

export default function MediaViewer({ item, onClose }: { item: any; onClose: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const isVideo = item.mimeType === 'video';

  return (
    <div ref={rootRef} className="image-viewer-container">
      <div className="image-toolbar">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <i className={`fas ${isVideo ? 'fa-video' : 'fa-music'} text-dark-text3 flex-shrink-0`}></i>
          <span className="text-[0.85rem] font-semibold truncate">{item.name}</span>
        </div>
        <button className="pdf-btn" onClick={() => toggleFullscreen(rootRef.current)} title="Fullscreen"><i className="fas fa-expand"></i></button>
        <a className="pdf-btn no-underline" href={item.rawUrl} target="_blank" rel="noreferrer" title="Download"><i className="fas fa-download"></i></a>
        <button className="pdf-btn" onClick={onClose} title="Close" style={{ background: '#ef4444', color: 'white', borderRadius: '7px' }}><i className="fas fa-times"></i></button>
      </div>
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden" style={{ background: '#000' }}>
        {isVideo ? (
          <video src={item.rawUrl} controls autoPlay className="max-h-full max-w-full rounded shadow-2xl" />
        ) : (
          <audio src={item.rawUrl} controls autoPlay className="w-full max-w-xl" />
        )}
      </div>
    </div>
  );
}
