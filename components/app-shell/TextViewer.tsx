'use client';

import { useRef, useEffect, useState } from 'react';
import { toggleFullscreen } from '@/lib/fullscreen';

export default function TextViewer({ item, onClose }: { item: any; onClose: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [text, setText] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(item.rawUrl);
        if (!res.ok) throw new Error(`Failed to load file (HTTP ${res.status})`);
        const data = await res.text();
        if (cancelled) return;
        setText(data);
        setStatus('ready');
      } catch (e: any) {
        if (cancelled) return;
        setText(e?.message || String(e));
        setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [item.rawUrl]);

  return (
    <div ref={rootRef} className="image-viewer-container">
      <div className="image-toolbar">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <i className="fas fa-file-alt text-dark-text3 flex-shrink-0"></i>
          <span className="text-[0.85rem] font-semibold truncate">{item.name}</span>
        </div>
        <button className="pdf-btn" onClick={() => toggleFullscreen(rootRef.current)} title="Fullscreen"><i className="fas fa-expand"></i></button>
        <a className="pdf-btn no-underline" href={item.rawUrl} target="_blank" rel="noreferrer" title="Download"><i className="fas fa-download"></i></a>
        <button className="pdf-btn" onClick={onClose} title="Close" style={{ background: '#ef4444', color: 'white', borderRadius: '7px' }}><i className="fas fa-times"></i></button>
      </div>
      <div className="flex-1 overflow-auto p-4" style={{ background: '#0a0f1e' }}>
        {status === 'loading' && (
          <div className="flex flex-col items-center justify-center text-dark-text2 min-h-[40vh]">
            <div className="w-8 h-8 border-2 border-qsis border-t-transparent rounded-full animate-spin mb-3"></div>
            <p className="text-sm">Loading…</p>
          </div>
        )}
        <pre className="text-[0.8rem] leading-relaxed text-dark-text whitespace-pre-wrap break-words font-mono" style={{ fontFamily: '"Cascadia Code", Consolas, monospace' }}>{text}</pre>
      </div>
    </div>
  );
}
