'use client';

import { useRef, useEffect, useState } from 'react';

// .docx rendered natively in the browser with docx-preview — no external
// Microsoft Office embed, so it works on slow/restricted networks too.
// The bytes come from the same-origin proxy (never raw.githubusercontent).
export default function WordViewer({ item, onClose }: { item: any; onClose: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [pages, setPages] = useState(0);

  const src = `${window.location.origin}/api/github/raw?url=${encodeURIComponent(item.rawUrl)}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { renderAsync } = await import('docx-preview');

        let res: Response | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            res = await fetch(src);
            if (res.ok) break;
          } catch {
            res = null;
          }
          if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        }
        if (!res || !res.ok) {
          throw new Error(res ? `Failed to load file (HTTP ${res.status})` : 'Failed to load this file. Please check your connection.');
        }

        const data = await res.arrayBuffer();
        if (cancelled || !bodyRef.current) return;
        await renderAsync(data, bodyRef.current, document.body, {
          className: 'docx',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          ignoreLastRenderedPageBreak: false,
        });
        if (cancelled) return;
        setPages(bodyRef.current.querySelectorAll('.docx-wrapper > section.docx').length);
        setStatus('ready');
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || String(e));
          setStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
      if (bodyRef.current) bodyRef.current.innerHTML = '';
    };
  }, [src]);

  return (
    <div ref={rootRef} className="image-viewer-container">
      <div className="image-toolbar">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <i className="fas fa-file-word text-[#3b82f6] flex-shrink-0"></i>
          <span className="text-[0.85rem] font-semibold truncate">{item.name}</span>
          {status === 'ready' && pages > 0 && (
            <span className="text-[0.72rem] text-dark-text3 hidden sm:block">
              {pages} page{pages === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <a className="pdf-btn no-underline" href={src} download={item.name} title="Download"><i className="fas fa-download"></i></a>
        <button className="pdf-btn" onClick={onClose} title="Close" style={{ background: '#ef4444', color: 'white', borderRadius: '7px' }}><i className="fas fa-times"></i></button>
      </div>

      <div className="flex-1 overflow-auto" style={{ background: '#0a0f1e' }}>
        {status === 'loading' && (
          <div className="flex flex-col items-center justify-center text-dark-text2 min-h-[40vh]">
            <div className="w-8 h-8 border-2 border-qsis border-t-transparent rounded-full animate-spin mb-3"></div>
            <p className="text-sm">Loading document…</p>
          </div>
        )}
        {status === 'error' && (
          <div className="flex flex-col items-center justify-center text-dark-text2 min-h-[40vh] px-6 text-center">
            <i className="fas fa-file-word text-4xl mb-3 text-red-400"></i>
            <p className="text-sm mb-1">Could not open this document.</p>
            <p className="text-[0.78rem] text-dark-text3 mb-4">{error}</p>
            <a href={src} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl bg-qsis text-white text-sm font-semibold no-underline">
              <i className="fas fa-external-link-alt mr-1"></i>Open in new tab
            </a>
          </div>
        )}
        <div ref={bodyRef} className="px-3 py-4 flex flex-col items-center" />
      </div>
    </div>
  );
}
