'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { getSavedPdfPage, savePdfPage } from '@/lib/store';

interface PdfViewerProps {
  url: string;
  name: string;
  filePath: string;
  onClose: () => void;
}

type AnnotationTool = 'none' | 'highlight' | 'draw' | 'text' | 'rect' | 'circle';

interface Annotation {
  id: string;
  tool: AnnotationTool;
  pageNumber: number;
  data: any;
}

const BASE_SCALE = 1.5;

export default function PdfViewer({ url, name, filePath, onClose }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<any>(null);
  const renderingRef = useRef(false);

  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tool, setTool] = useState<AnnotationTool>('none');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [drawColor, setDrawColor] = useState('#ef4444');
  const [drawWidth, setDrawWidth] = useState(3);
  const [showToolbar, setShowToolbar] = useState(true);

  const drawingRef = useRef(false);
  const drawStartRef = useRef({ x: 0, y: 0 });
  const currentPathRef = useRef<{ x: number; y: number }[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadPdf() {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

        const loadingTask = pdfjsLib.getDocument({ url });
        const pdfDoc = await loadingTask.promise;
        if (cancelled) return;

        pdfDocRef.current = pdfDoc;
        setTotalPages(pdfDoc.numPages);

        const savedPage = getSavedPdfPage(filePath);
        const page = Math.min(Math.max(savedPage, 1), pdfDoc.numPages);
        setCurrentPage(page);
        setLoading(false);

        await renderPage(pdfDoc, page);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to load PDF');
          setLoading(false);
        }
      }
    }

    loadPdf();
    return () => { cancelled = true; };
  }, [url]);

  useEffect(() => {
    if (pdfDocRef.current && !loading) {
      renderPage(pdfDocRef.current, currentPage);
    }
  }, [currentPage]);

  useEffect(() => {
    renderAnnotations();
  }, [zoom]);

  async function renderPage(pdfDoc: any, pageNum: number) {
    if (renderingRef.current) return;
    renderingRef.current = true;

    try {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: BASE_SCALE });

      const canvas = canvasRef.current;
      const overlay = overlayRef.current;
      if (!canvas || !overlay) { renderingRef.current = false; return; }

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      overlay.width = viewport.width;
      overlay.height = viewport.height;

      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport }).promise;
      savePdfPage(filePath, pageNum);
      renderAnnotations();
    } catch {}
    renderingRef.current = false;
  }

  function renderAnnotations() {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d')!;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const pageAnnotations = annotations.filter(a => a.pageNumber === currentPage);
    for (const ann of pageAnnotations) {
      if (ann.tool === 'highlight') {
        ctx.fillStyle = ann.data.color + '40';
        ctx.fillRect(ann.data.x, ann.data.y, ann.data.w, ann.data.h);
      } else if (ann.tool === 'rect') {
        ctx.strokeStyle = ann.data.color;
        ctx.lineWidth = ann.data.width;
        ctx.strokeRect(ann.data.x, ann.data.y, ann.data.w, ann.data.h);
      } else if (ann.tool === 'circle') {
        ctx.strokeStyle = ann.data.color;
        ctx.lineWidth = ann.data.width;
        const rx = Math.abs(ann.data.w) / 2;
        const ry = Math.abs(ann.data.h) / 2;
        const cx = ann.data.x + ann.data.w / 2;
        const cy = ann.data.y + ann.data.h / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (ann.tool === 'draw' && ann.data.points?.length > 1) {
        ctx.strokeStyle = ann.data.color;
        ctx.lineWidth = ann.data.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(ann.data.points[0].x, ann.data.points[0].y);
        for (let i = 1; i < ann.data.points.length; i++) {
          ctx.lineTo(ann.data.points[i].x, ann.data.points[i].y);
        }
        ctx.stroke();
      } else if (ann.tool === 'text') {
        ctx.font = `${ann.data.fontSize}px sans-serif`;
        ctx.fillStyle = ann.data.color;
        ctx.fillText(ann.data.text, ann.data.x, ann.data.y);
      }
    }
  }

  function getCanvasCoords(e: React.MouseEvent): { x: number; y: number } {
    const overlay = overlayRef.current;
    if (!overlay) return { x: 0, y: 0 };
    const rect = overlay.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (overlay.width / rect.width),
      y: (e.clientY - rect.top) * (overlay.height / rect.height),
    };
  }

  function goToPage(p: number) {
    const clamped = Math.min(Math.max(p, 1), totalPages);
    setCurrentPage(clamped);
  }

  function zoomIn() { setZoom(z => Math.min(z + 0.15, 3)); }
  function zoomOut() { setZoom(z => Math.max(z - 0.15, 0.3)); }
  function zoomFit() {
    if (!containerRef.current || !canvasRef.current) return;
    const cw = containerRef.current.clientWidth - 60;
    const ch = containerRef.current.clientHeight - 40;
    const pw = canvasRef.current.width;
    const ph = canvasRef.current.height;
    setZoom(Math.min(cw / pw, ch / ph));
  }

  const handleOverlayMouseDown = useCallback((e: React.MouseEvent) => {
    if (tool === 'none') return;
    const { x, y } = getCanvasCoords(e);

    if (tool === 'text') {
      const text = prompt('Enter text:');
      if (text) {
        setAnnotations(prev => [...prev, {
          id: `ann-${Date.now()}`,
          tool: 'text',
          pageNumber: currentPage,
          data: { x, y, text, color: drawColor, fontSize: 16 },
        }]);
        setTimeout(renderAnnotations, 0);
      }
      return;
    }

    drawingRef.current = true;
    drawStartRef.current = { x, y };
    currentPathRef.current = [{ x, y }];
  }, [tool, drawColor, currentPage]);

  const handleOverlayMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drawingRef.current || tool === 'none') return;
    const { x, y } = getCanvasCoords(e);

    if (tool === 'draw') {
      currentPathRef.current.push({ x, y });
      renderAnnotations();
      const overlay = overlayRef.current;
      if (!overlay) return;
      const ctx = overlay.getContext('2d')!;
      ctx.strokeStyle = drawColor;
      ctx.lineWidth = drawWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      const pts = currentPathRef.current;
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    } else {
      renderAnnotations();
      const overlay = overlayRef.current;
      if (!overlay) return;
      const ctx = overlay.getContext('2d')!;
      ctx.setLineDash([5, 3]);
      ctx.strokeStyle = drawColor;
      ctx.lineWidth = drawWidth;
      const sx = drawStartRef.current.x;
      const sy = drawStartRef.current.y;
      if (tool === 'highlight') {
        ctx.fillStyle = drawColor + '40';
        ctx.fillRect(sx, sy, x - sx, y - sy);
      } else if (tool === 'rect') {
        ctx.strokeRect(sx, sy, x - sx, y - sy);
      } else if (tool === 'circle') {
        const rx = Math.abs(x - sx) / 2;
        const ry = Math.abs(y - sy) / 2;
        const cx = sx + (x - sx) / 2;
        const cy = sy + (y - sy) / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  }, [tool, drawColor, drawWidth]);

  const handleOverlayMouseUp = useCallback((e: React.MouseEvent) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const { x, y } = getCanvasCoords(e);
    const sx = drawStartRef.current.x;
    const sy = drawStartRef.current.y;

    if (tool === 'draw') {
      setAnnotations(prev => [...prev, {
        id: `ann-${Date.now()}`,
        tool: 'draw',
        pageNumber: currentPage,
        data: { points: [...currentPathRef.current], color: drawColor, width: drawWidth },
      }]);
    } else if (tool === 'highlight' || tool === 'rect' || tool === 'circle') {
      if (Math.abs(x - sx) > 5 && Math.abs(y - sy) > 5) {
        setAnnotations(prev => [...prev, {
          id: `ann-${Date.now()}`,
          tool,
          pageNumber: currentPage,
          data: { x: sx, y: sy, w: x - sx, h: y - sy, color: drawColor, width: drawWidth },
        }]);
      }
    }
    renderAnnotations();
  }, [tool, drawColor, drawWidth, currentPage]);

  function undoAnnotation() {
    setAnnotations(prev => {
      const pageAnns = prev.filter(a => a.pageNumber === currentPage);
      const otherAnns = prev.filter(a => a.pageNumber !== currentPage);
      pageAnns.pop();
      return [...otherAnns, ...pageAnns];
    });
    setTimeout(renderAnnotations, 0);
  }

  function clearAnnotations() {
    setAnnotations(prev => prev.filter(a => a.pageNumber !== currentPage));
    setTimeout(renderAnnotations, 0);
  }

  function downloadPdf() {
    const a = document.createElement('a');
    a.href = url;
    a.download = name || 'document.pdf';
    a.click();
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); goToPage(currentPage - 1); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goToPage(currentPage + 1); }
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undoAnnotation(); }
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomIn(); }
      if (e.key === '-') { e.preventDefault(); zoomOut(); }
      if (e.key === '0') { e.preventDefault(); zoomFit(); }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, annotations, zoom]);

  if (error) {
    return (
      <div className="pdf-viewer-overlay" onClick={onClose}>
        <div className="pdf-viewer-container" onClick={e => e.stopPropagation()}>
          <div className="pdf-viewer-error">
            <div className="pdf-error-icon"><i className="fas fa-exclamation-triangle"></i></div>
            <p className="pdf-error-title">Failed to load PDF</p>
            <p className="pdf-error-msg">{error}</p>
            <a href={url} target="_blank" rel="noopener noreferrer" className="pdf-viewer-open-link">
              <i className="fas fa-external-link-alt"></i> Open in new tab
            </a>
            <button className="pdf-error-close" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pdf-viewer-overlay" onClick={onClose}>
      <div className="pdf-viewer-container" onClick={e => e.stopPropagation()}>
        <button className="pdf-close-btn" onClick={onClose} title="Close (Esc)">
          <i className="fas fa-times"></i>
        </button>

        <div className="pdf-topbar">
          <div className="pdf-topbar-left">
            <span className="pdf-filename" title={name}>
              <i className="fas fa-file-pdf"></i> {name}
            </span>
          </div>
          <div className="pdf-topbar-center">
            <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} className="pdf-nav-btn"><i className="fas fa-chevron-left"></i></button>
            <span className="pdf-page-info">
              <input type="number" value={currentPage} onChange={e => goToPage(parseInt(e.target.value) || 1)} className="pdf-page-input" />
              <span className="pdf-page-total">/ {totalPages}</span>
            </span>
            <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages} className="pdf-nav-btn"><i className="fas fa-chevron-right"></i></button>
          </div>
          <div className="pdf-topbar-right">
            <button onClick={zoomOut} className="pdf-zoom-btn" title="Zoom Out (-)"><i className="fas fa-minus"></i></button>
            <span className="pdf-zoom-label">{Math.round(zoom * 100)}%</span>
            <button onClick={zoomIn} className="pdf-zoom-btn" title="Zoom In (+)"><i className="fas fa-plus"></i></button>
            <button onClick={zoomFit} className="pdf-zoom-btn" title="Fit to Screen (0)"><i className="fas fa-expand"></i></button>
            <div className="pdf-topbar-divider"></div>
            <button onClick={downloadPdf} className="pdf-action-btn" title="Download"><i className="fas fa-download"></i></button>
            <button onClick={() => setShowToolbar(!showToolbar)} className={`pdf-action-btn ${showToolbar ? 'active' : ''}`} title="Annotations">
              <i className="fas fa-pen-nib"></i>
            </button>
          </div>
        </div>

        {showToolbar && (
          <div className="pdf-annotation-bar">
            <button className={`pdf-ann-btn ${tool === 'none' ? 'active' : ''}`} onClick={() => setTool('none')} title="Select (V)">
              <i className="fas fa-mouse-pointer"></i>
            </button>
            <button className={`pdf-ann-btn ${tool === 'highlight' ? 'active' : ''}`} onClick={() => setTool('highlight')} title="Highlight (H)">
              <i className="fas fa-highlighter"></i>
            </button>
            <button className={`pdf-ann-btn ${tool === 'draw' ? 'active' : ''}`} onClick={() => setTool('draw')} title="Draw (D)">
              <i className="fas fa-pen"></i>
            </button>
            <button className={`pdf-ann-btn ${tool === 'text' ? 'active' : ''}`} onClick={() => setTool('text')} title="Add Text (T)">
              <i className="fas fa-font"></i>
            </button>
            <button className={`pdf-ann-btn ${tool === 'rect' ? 'active' : ''}`} onClick={() => setTool('rect')} title="Rectangle (R)">
              <i className="far fa-square"></i>
            </button>
            <button className={`pdf-ann-btn ${tool === 'circle' ? 'active' : ''}`} onClick={() => setTool('circle')} title="Circle (C)">
              <i className="far fa-circle"></i>
            </button>
            <div className="pdf-ann-divider"></div>
            <input type="color" value={drawColor} onChange={e => setDrawColor(e.target.value)} className="pdf-color-input" title="Color" />
            <select value={drawWidth} onChange={e => setDrawWidth(parseInt(e.target.value))} className="pdf-width-select" title="Stroke Width">
              <option value={1}>Thin</option>
              <option value={3}>Medium</option>
              <option value={5}>Thick</option>
              <option value={8}>Bold</option>
            </select>
            <div className="pdf-ann-divider"></div>
            <button className="pdf-ann-btn" onClick={undoAnnotation} title="Undo (Ctrl+Z)">
              <i className="fas fa-undo"></i>
            </button>
            <button className="pdf-ann-btn" onClick={clearAnnotations} title="Clear Page">
              <i className="fas fa-eraser"></i>
            </button>
          </div>
        )}

        <div className="pdf-canvas-wrapper" ref={containerRef}>
          {loading && (
            <div className="pdf-loading">
              <div className="book-loader">
                <div className="book-base"></div>
                <div className="book-spine-loader"></div>
                <div className="book-cover"></div>
                <div className="book-page-stack">
                  <div className="book-page"></div>
                  <div className="book-page"></div>
                  <div className="book-page"></div>
                </div>
                <div className="page-shadow"></div>
                <div className="page-shadow"></div>
                <div className="page-shadow"></div>
              </div>
              <div className="loading-text">Loading PDF<span className="loading-dots"></span></div>
            </div>
          )}
          <div className="pdf-canvas-container" style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
            <canvas ref={canvasRef} className="pdf-canvas"></canvas>
            <canvas
              ref={overlayRef}
              className="pdf-overlay"
              onMouseDown={handleOverlayMouseDown}
              onMouseMove={handleOverlayMouseMove}
              onMouseUp={handleOverlayMouseUp}
              style={{ cursor: tool === 'none' ? 'default' : tool === 'text' ? 'text' : 'crosshair' }}
            ></canvas>
          </div>
        </div>
      </div>
    </div>
  );
}
