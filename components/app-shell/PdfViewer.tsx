'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getPdfFromCache, storePdfInCache } from '@/lib/pdf-cache';
import { getPdfMetadata, isValidPdf } from '@/lib/pdf-meta';

interface PdfViewerProps {
  item: any;
  onClose: () => void;
}

type Status = 'loading' | 'downloading' | 'ready' | 'error';

export default function PdfViewer({ item, onClose }: PdfViewerProps) {
  const proxyUrl = `/api/github/raw?url=${encodeURIComponent(item.rawUrl)}`;
  const fullUrl = typeof window !== 'undefined' ? `${window.location.origin}${proxyUrl}` : proxyUrl;

  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [progress, setProgress] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [useEmbed, setUseEmbed] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const embedRef = useRef<HTMLIFrameElement>(null);
  const objectRef = useRef<HTMLObjectElement>(null);
  const zoomTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
      abortRef.current?.abort();
    };
  }, []);

  // Main load sequence: cache → download → parse → render
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setStatus('loading');
        setError('');

        // 1. Check IndexedDB cache
        const cached = await getPdfFromCache(proxyUrl);
        if (cancelled) return;

        let bytes: ArrayBuffer;
        let fileName = item.name || 'document.pdf';

        if (cached && cached.bytes) {
          // Cache hit — use immediately
          bytes = cached.bytes;
          setProgress(100);
        } else {
          // 2. Download from proxy
          setStatus('downloading');
          abortRef.current = new AbortController();

          const res = await fetch(fullUrl, {
            signal: abortRef.current.signal,
            // Use incremental download for progress
          });

          if (!res.ok) {
            throw new Error(res.status === 404 ? 'PDF not found' : `Failed to load PDF (HTTP ${res.status})`);
          }

          // Get content length for progress
          const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
          const reader = res.body?.getReader();
          if (!reader) throw new Error('Failed to read PDF response');

          const chunks: Uint8Array[] = [];
          let received = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (cancelled) { reader.cancel(); return; }
            if (done) break;
            chunks.push(value);
            received += value.length;
            if (contentLength > 0) {
              setProgress(Math.round((received / contentLength) * 100));
            }
          }

          // Combine chunks into single ArrayBuffer
          const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
          const combined = new Uint8Array(totalLength);
          let offset = 0;
          for (const chunk of chunks) {
            combined.set(chunk, offset);
            offset += chunk.length;
          }
          bytes = combined.buffer;

          if (cancelled) return;

          // 3. Validate PDF
          if (!isValidPdf(bytes)) {
            throw new Error('The file is not a valid PDF document.');
          }

          // 4. Store in IndexedDB cache (non-blocking)
          storePdfInCache(proxyUrl, bytes, fileName).catch(() => {});
        }

        if (cancelled) return;

        // 5. Parse metadata for page count
        const meta = await getPdfMetadata(bytes);
        if (cancelled) return;
        if (meta) setPageCount(meta.pageCount);

        // 6. Create Blob URL for native rendering
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        if (cancelled) { URL.revokeObjectURL(url); return; }

        blobUrlRef.current = url;
        setBlobUrl(url);
        setStatus('ready');
      } catch (e: any) {
        if (cancelled) return;
        if (e?.name === 'AbortError') return;
        setError(e?.message || 'Failed to load PDF');
        setStatus('error');
      }
    })();

    return () => { cancelled = true; };
  }, [proxyUrl, fullUrl, item.rawUrl, item.name]);

  // CSS transform zoom with debounced settle
  const handleZoom = useCallback((newZoom: number) => {
    const clamped = Math.min(5, Math.max(0.25, newZoom));
    setZoom(clamped);
  }, []);

  const zoomIn = useCallback(() => handleZoom(zoom + 0.25), [zoom, handleZoom]);
  const zoomOut = useCallback(() => handleZoom(zoom - 0.25), [zoom, handleZoom]);
  const zoomFit = useCallback(() => handleZoom(1), [handleZoom]);

  // Mouse wheel zoom (Ctrl+wheel)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      handleZoom(zoom + delta);
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [zoom, handleZoom]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if ((e.ctrlKey || e.metaKey) && e.key === '=') { e.preventDefault(); zoomIn(); }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); zoomOut(); }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); zoomFit(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, zoomIn, zoomOut, zoomFit]);

  // Touch pinch zoom
  const touchRef = useRef({ dist: 0, zoom: 1 });
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchRef.current = { dist: Math.hypot(dx, dy), zoom };
    }
  }, [zoom]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const scale = dist / touchRef.current.dist;
      const newZoom = touchRef.current.zoom * scale;
      // Apply CSS-only during gesture (no state update = no re-render)
      if (containerRef.current) {
        containerRef.current.style.transform = `scale(${Math.min(5, Math.max(0.25, newZoom))})`;
        containerRef.current.style.transformOrigin = 'center center';
      }
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      // Read the CSS transform and commit to state
      if (containerRef.current) {
        const match = containerRef.current.style.transform.match(/scale\(([\d.]+)\)/);
        if (match) {
          const finalZoom = parseFloat(match[1]);
          setZoom(finalZoom);
          containerRef.current.style.transform = '';
        }
      }
    }
  }, []);

  return (
    <div className="fixed inset-0 z-[1500] bg-[#0a0f1e] flex flex-col">
      {/* ═══ TOOLBAR ═══ */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#111827] border-b border-[#1e293b] shrink-0 gap-2 wco-titlebar-pad">
        {/* Left: file info */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <button onClick={onClose} className="text-gray-400 hover:text-white transition p-1.5 shrink-0" title="Close (Esc)">
            <i className="fas fa-arrow-left text-base"></i>
          </button>
          <i className="fas fa-file-pdf text-red-400 shrink-0"></i>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate max-w-[150px] sm:max-w-[350px]">{item.name}</p>
            <p className="text-[0.6rem] text-gray-500">
              {status === 'loading' && 'Loading...'}
              {status === 'downloading' && (progress > 0 ? `Downloading ${progress}%` : 'Downloading...')}
              {status === 'ready' && pageCount > 0 ? `${pageCount} page${pageCount !== 1 ? 's' : ''}` : ''}
              {status === 'error' && 'Error'}
            </p>
          </div>
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-1 shrink-0">
          {status === 'ready' && (
            <>
              {/* Zoom controls */}
              <button onClick={zoomOut} className="pdf-btn px-2 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition text-xs" title="Zoom out (Ctrl+-)">
                <i className="fas fa-minus"></i>
              </button>
              <span className="text-xs font-mono text-gray-400 min-w-[3rem] text-center select-none">
                {Math.round(zoom * 100)}%
              </span>
              <button onClick={zoomIn} className="pdf-btn px-2 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition text-xs" title="Zoom in (Ctrl+=)">
                <i className="fas fa-plus"></i>
              </button>
              <button onClick={zoomFit} className="pdf-btn px-2 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition text-xs" title="Fit (Ctrl+0)">
                <i className="fas fa-expand-arrows-alt"></i>
              </button>
              <div className="w-px h-5 bg-[#334155] mx-1 hidden sm:block"></div>
            </>
          )}

          {/* Download */}
          <a href={fullUrl} download={item.name}
            className="pdf-btn px-2 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition text-xs"
            title="Download PDF">
            <i className="fas fa-download"></i>
          </a>
        </div>
      </div>

      {/* ═══ VIEWER AREA ═══ */}
      <div
        className="flex-1 overflow-auto relative"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Loading state */}
        {(status === 'loading' || status === 'downloading') && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0f1e] z-10">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
                {status === 'downloading' ? (
                  <i className="fas fa-cloud-arrow-down text-blue-400 text-2xl"></i>
                ) : (
                  <i className="fas fa-spinner fa-spin text-blue-400 text-2xl"></i>
                )}
              </div>
              <p className="text-sm text-gray-400 mb-2">
                {status === 'downloading' ? 'Downloading PDF...' : 'Loading PDF...'}
              </p>
              {progress > 0 && status === 'downloading' && (
                <div className="w-48 h-1.5 bg-[#1e293b] rounded-full mx-auto overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error state */}
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0f1e] z-10">
            <div className="text-center max-w-sm px-4">
              <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-exclamation-triangle text-red-400 text-2xl"></i>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Failed to Load PDF</h3>
              <p className="text-sm text-gray-400 mb-5">{error}</p>
              <div className="flex gap-3 justify-center">
                <button onClick={onClose}
                  className="px-4 py-2 rounded-lg border border-[#3a3b3c] text-gray-400 text-sm font-semibold hover:bg-[#3a3b3c] transition">
                  Close
                </button>
                <a href={fullUrl} download={item.name}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition inline-flex items-center gap-2">
                  <i className="fas fa-download"></i>Download Instead
                </a>
              </div>
            </div>
          </div>
        )}

        {/* PDF renderer — iframe (hides native toolbar via #toolbar=0) with object fallback */}
        {status === 'ready' && blobUrl && (
          <div
            ref={containerRef}
            className="w-full h-full relative transition-transform duration-150"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'center center',
            }}
          >
            {useEmbed ? (
              <>
                <iframe
                  ref={embedRef as any}
                  src={`${blobUrl}#toolbar=0&navpanes=0&scrollbar=1`}
                  className="w-full h-full border-0"
                  title={item.name}
                  onMouseUp={(e) => e.stopPropagation()}
                />
                {/* Mobile overlay — tapping opens in new tab to prevent native viewer hijack */}
                <div
                  className="absolute inset-0 md:hidden z-10"
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.open(blobUrl, '_blank', 'noopener,noreferrer');
                  }}
                  style={{ touchAction: 'manipulation' }}
                />
              </>
            ) : (
              <object
                ref={objectRef}
                data={`${blobUrl}#toolbar=0&navpanes=0&scrollbar=1`}
                type="application/pdf"
                className="w-full h-full border-0"
                onError={() => {
                  setError('Your browser cannot display PDFs inline. Please download the file.');
                  setStatus('error');
                }}
              >
                <div className="flex items-center justify-center h-full bg-[#0a0f1e]">
                  <div className="text-center">
                    <p className="text-gray-400 mb-3">PDF preview not available in this browser.</p>
                    <a href={fullUrl} download={item.name}
                      className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold">
                      <i className="fas fa-download mr-2"></i>Download PDF
                    </a>
                  </div>
                </div>
              </object>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
