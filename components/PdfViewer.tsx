'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface PdfViewerProps {
  url: string;
  name: string;
  filePath?: string;
  onClose: () => void;
}

// Simple in-app PDF viewer built on pdf.js (v6.1.200, served from /public).
// The PDF bytes are fetched through the same-origin proxy (no download, no
// iframe, no X-Frame-Options) and rendered page-by-page into canvases inside a
// scrollable container — full control over the design.
export default function PdfViewer({ url, name, onClose }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [scale, setScale] = useState(1);
  const pagesRef = useRef<{ canvas: HTMLCanvasElement; render: (s: number) => Promise<void> }[]>([]);
  const disposeRef = useRef<(() => void) | null>(null);

  const src = `${window.location.origin}/api/github/raw?url=${encodeURIComponent(url)}`;

  const renderAll = useCallback(async (s: number) => {
    for (const p of pagesRef.current) {
      await p.render(s).catch(() => {});
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    (async () => {
      try {
        const pdfjs: any = await import(/* webpackIgnore: true */ '/pdfjs/pdf.min.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';

        const res = await fetch(src);
        if (!res.ok) throw new Error(`Failed to load file (${res.status})`);
        const pdf = await pdfjs.getDocument({ data: await res.arrayBuffer() }).promise;

        const container = containerRef.current;
        if (!container || cancelled) {
          pdf.destroy();
          return;
        }
        container.innerHTML = '';

        const baseWidth = container.clientWidth || 800;
        const dpr = window.devicePixelRatio || 1;
        pagesRef.current = [];

        const mount = (canvas: HTMLCanvasElement, pageNum: number, page: any, viewportScale: number) => {
          const viewport = page.getViewport({ scale: viewportScale });
          canvas.width = Math.floor(viewport.width * dpr);
          canvas.height = Math.floor(viewport.height * dpr);
          const ctx = canvas.getContext('2d')!;
          return page.render({
            canvasContext: ctx,
            viewport: page.getViewport({ scale: viewportScale * dpr }),
          }).promise;
        };

        for (let n = 1; n <= pdf.numPages; n++) {
          const page = await pdf.getPage(n);
          const vp = page.getViewport({ scale: 1 });
          const fit = (baseWidth - 24) / vp.width;
          const canvas = document.createElement('canvas');
          canvas.style.width = '100%';
          canvas.style.height = 'auto';
          const wrap = document.createElement('div');
          wrap.style.cssText = 'margin:0 auto 12px;box-shadow:0 2px 16px rgba(0,0,0,.35);border-radius:4px;overflow:hidden;';
          wrap.style.width = 'calc(100% - 24px)';
          wrap.appendChild(canvas);
          container.appendChild(wrap);
          const entry = { canvas, render: (s: number) => mount(canvas, n, page, fit * s) };
          pagesRef.current.push(entry);
        }

        await renderAll(scale);
        if (!cancelled) setStatus('ready');
        disposeRef.current = () => pdf.destroy();
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Could not load this PDF.');
          setStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      if (disposeRef.current) {
        disposeRef.current();
        disposeRef.current = null;
      }
      const container = containerRef.current;
      if (container) container.innerHTML = '';
      pagesRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const zoom = async (dir: 1 | -1) => {
    const next = Math.min(3, Math.max(0.5, +(scale + dir * 0.2).toFixed(2)));
    setScale(next);
    await renderAll(next);
  };

  return (
    <div className="fixed inset-0 z-[1500] bg-[#0a0f1e] flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 bg-neutral-900 border-b border-neutral-800 shrink-0">
        <span className="text-neutral-300 text-[0.8rem] font-semibold truncate flex-1">{name}</span>
        <span className="text-neutral-500 text-[0.72rem] hidden sm:block">{status === 'ready' ? `${pagesRef.current.length} page(s)` : ''}</span>
        <button className="pdf-btn" onClick={() => zoom(-1)} title="Zoom out" disabled={status !== 'ready'}><i className="fas fa-minus"></i></button>
        <button className="pdf-btn" onClick={() => zoom(1)} title="Zoom in" disabled={status !== 'ready'}><i className="fas fa-plus"></i></button>
        <a className="pdf-btn no-underline" href={url} download={name} title="Download" style={{ textDecoration: 'none' }}><i className="fas fa-download"></i></a>
        <button
          className="pdf-btn"
          onClick={onClose}
          title="Close"
          style={{ background: '#ef4444', color: 'white', borderRadius: '7px' }}
        >
          <i className="fas fa-times"></i>
        </button>
      </div>
      <div ref={containerRef} className="flex-1 overflow-auto bg-[#0a0f1e] p-3">
        {status === 'loading' && (
          <div className="flex flex-col items-center justify-center h-full text-dark-text2">
            <div
              style={{
                width: 36,
                height: 36,
                border: '3px solid rgba(255,255,255,0.15)',
                borderTopColor: '#fff',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            ></div>
            <p className="text-[0.8rem] mt-3">Loading PDF...</p>
          </div>
        )}
        {status === 'error' && (
          <div className="flex flex-col items-center justify-center h-full text-dark-text2 px-6 text-center">
            <i className="fas fa-file-pdf text-4xl mb-3 text-red-400"></i>
            <p className="text-sm mb-1">Could not open this PDF.</p>
            <p className="text-[0.78rem] text-dark-text3 mb-4">{error}</p>
            <a href={url} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl bg-qsis text-white text-sm font-semibold no-underline">
              <i className="fas fa-external-link-alt mr-1"></i>Open in new tab
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
