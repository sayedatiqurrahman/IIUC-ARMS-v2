'use client';

import { useRef, useEffect, useState, useCallback } from 'react';

export default function DocViewer({ item, onClose }: { item: any; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(100);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [legacy, setLegacy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError('');
    const ext = item.path?.split('.').pop()?.toLowerCase() || '';
    const isDocx = ext === 'docx';

    (async () => {
      try {
        const res = await fetch(item.rawUrl);
        if (!res.ok) throw new Error(`Failed to load file (HTTP ${res.status})`);
        const data = await res.arrayBuffer();
        if (cancelled) return;
        if (!isDocx) {
          setLegacy(true);
          setStatus('error');
          return;
        }
        const docx = await import('docx-preview');
        if (cancelled) return;
        const el = containerRef.current;
        if (!el) return;
        el.innerHTML = '';
        await docx.renderAsync(data, el, null, {
          breakPages: true,
          experimental: true,
          useBase64URL: true,
        });
        if (cancelled) return;
        setStatus('ready');
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || String(e));
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [item.rawUrl, item.path]);

  const fit = useCallback(() => {
    const scroll = scrollRef.current;
    const inner = containerRef.current;
    if (!scroll || !inner) return;
    const avail = scroll.clientWidth - 48;
    const docW = inner.scrollWidth || 816;
    const z = Math.max(20, Math.min(200, Math.round((avail / docW) * 100)));
    setZoom(z);
  }, []);

  useEffect(() => {
    if (status === 'ready') fit();
  }, [status, fit]);

  return (
    <div className="image-viewer-container">
      <div className="image-toolbar">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <i className="fas fa-file-word text-qsis flex-shrink-0"></i>
          <span className="text-[0.85rem] font-semibold truncate">{item.name}</span>
        </div>
        <button className="pdf-btn" onClick={() => setZoom(z => Math.max(20, z - 15))} title="Zoom Out"><i className="fas fa-minus"></i></button>
        <span className="text-[0.8rem] font-semibold min-w-[40px] text-center">{zoom}%</span>
        <button className="pdf-btn" onClick={() => setZoom(z => Math.min(200, z + 15))} title="Zoom In"><i className="fas fa-plus"></i></button>
        <button className="pdf-btn" onClick={fit} title="Fit"><i className="fas fa-expand"></i></button>
        <a className="pdf-btn no-underline" href={item.rawUrl} target="_blank" rel="noreferrer" title="Download" style={{textDecoration:'none'}}><i className="fas fa-download"></i></a>
        <button className="pdf-btn" onClick={onClose} title="Close" style={{background:'#ef4444',color:'white',borderRadius:'7px'}}><i className="fas fa-times"></i></button>
      </div>
      <div className="doc-scroll-area" ref={scrollRef}>
        {status === 'loading' && (
          <div className="flex flex-col items-center justify-center text-dark-text2 min-h-[40vh]">
            <div className="w-8 h-8 border-2 border-qsis border-t-transparent rounded-full animate-spin mb-3"></div>
            <p className="text-sm">Rendering document…</p>
          </div>
        )}
        {status === 'error' && (
          <div className="flex flex-col items-center justify-center text-dark-text2 min-h-[40vh] px-6 text-center">
            <i className="fas fa-file-exclamation text-3xl mb-3"></i>
            <p className="text-sm mb-4">{legacy ? 'Legacy .doc files cannot be rendered in-browser. Download it below or open with MS Word.' : (error || 'Could not render this document.')}</p>
            <a href={item.rawUrl} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl bg-qsis text-white text-sm font-semibold no-underline">
              <i className="fas fa-download mr-1"></i> Download
            </a>
          </div>
        )}
        {status === 'ready' && (
          <div className="doc-zoom-wrap" style={{ zoom: zoom / 100 }}>
            <div ref={containerRef} className="docx-container-inner"></div>
          </div>
        )}
      </div>
    </div>
  );
}
