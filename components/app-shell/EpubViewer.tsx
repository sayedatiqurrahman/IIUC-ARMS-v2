'use client';

import { useRef, useState, useEffect } from 'react';
import { toggleFullscreen } from '@/lib/fullscreen';

interface TocItem { id: string; label: string; href: string }

export default function EpubViewer({ item, onClose }: { item: any; onClose: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<any>(null);
  const renditionRef = useRef<any>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [toc, setToc] = useState<TocItem[]>([]);
  const [tocOpen, setTocOpen] = useState(false);
  const [font, setFont] = useState(100);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const epubjs = await import('epubjs');
        const book = epubjs.default(item.rawUrl);
        bookRef.current = book;
        const rendition = book.renderTo(containerRef.current, {
          width: '100%',
          height: '100%',
          flow: 'paginated',
          spread: 'none',
          allowScriptedContent: false,
        });
        renditionRef.current = rendition;
        await rendition.display();
        if (cancelled) return;
        try {
          const nav = await book.loaded.navigation;
          const items = (nav.toc || []).map((t: any) => ({ id: t.id, label: t.label, href: t.href }));
          if (items.length) setToc(items);
        } catch {}
        setStatus('ready');
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || String(e));
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      try { renditionRef.current?.destroy?.(); } catch {}
      try { bookRef.current?.destroy?.(); } catch {}
    };
  }, [item.rawUrl]);

  const changeFont = (delta: number) => {
    const next = Math.max(70, Math.min(200, font + delta));
    setFont(next);
    try { renditionRef.current?.themes?.fontSize(next + '%'); } catch {}
  };

  const navToc = async (href: string) => {
    setTocOpen(false);
    try { await renditionRef.current?.display(href); } catch {}
  };

  return (
    <div ref={rootRef} className="image-viewer-container" style={{ background: '#0a0f1e' }}>
      <div className="image-toolbar">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <i className="fas fa-book text-purple-400 flex-shrink-0"></i>
          <span className="text-[0.85rem] font-semibold truncate">{item.name}</span>
        </div>
        {toc.length > 0 && (
          <div className="relative">
            <button className="pdf-btn" onClick={() => setTocOpen(o => !o)} title="Table of Contents"><i className="fas fa-list"></i></button>
            {tocOpen && (
              <>
                <div className="fixed inset-0 z-[205]" onClick={() => setTocOpen(false)} />
                <div className="absolute right-0 top-9 z-[210] w-64 max-h-80 overflow-auto rounded-xl border border-dark-border bg-dark-bg3 shadow-2xl p-2">
                  {toc.map((t) => (
                    <button key={t.id} onClick={() => navToc(t.href)}
                      className="w-full text-left px-3 py-2 rounded-lg text-[0.78rem] text-dark-text hover:bg-dark-bg2 cursor-pointer border-none truncate">
                      {t.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        <button className="pdf-btn" onClick={() => changeFont(-10)} title="Smaller text"><i className="fas fa-font" style={{ fontSize: '0.75rem' }}></i></button>
        <button className="pdf-btn" onClick={() => changeFont(10)} title="Bigger text"><i className="fas fa-font" style={{ fontSize: '1.05rem' }}></i></button>
        <button className="pdf-btn" onClick={() => { try { renditionRef.current?.prev(); } catch {} }} title="Previous page"><i className="fas fa-chevron-left"></i></button>
        <button className="pdf-btn" onClick={() => { try { renditionRef.current?.next(); } catch {} }} title="Next page"><i className="fas fa-chevron-right"></i></button>
        <button className="pdf-btn" onClick={() => toggleFullscreen(rootRef.current)} title="Fullscreen"><i className="fas fa-expand"></i></button>
        <a className="pdf-btn no-underline" href={item.rawUrl} target="_blank" rel="noreferrer" title="Download"><i className="fas fa-download"></i></a>
        <button className="pdf-btn" onClick={onClose} title="Close" style={{ background: '#ef4444', color: 'white', borderRadius: '7px' }}><i className="fas fa-times"></i></button>
      </div>
      <div className="flex-1 relative overflow-hidden">
        {status === 'loading' && (
          <div className="flex flex-col items-center justify-center text-dark-text2 h-full">
            <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin mb-3"></div>
            <p className="text-sm">Opening e-book…</p>
          </div>
        )}
        {status === 'error' && (
          <div className="flex flex-col items-center justify-center text-dark-text2 h-full px-6 text-center">
            <i className="fas fa-book-open text-3xl mb-3"></i>
            <p className="text-sm mb-4">{error || 'Could not open this e-book.'}</p>
            <a href={item.rawUrl} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl bg-qsis text-white text-sm font-semibold no-underline">
              <i className="fas fa-download mr-1"></i> Download
            </a>
          </div>
        )}
        {status === 'ready' && <div ref={containerRef} className="absolute inset-0" />}
      </div>
    </div>
  );
}
