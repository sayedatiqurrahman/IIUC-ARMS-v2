'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  detectDocumentQuad,
  detectQuadOnCanvas,
  processFrame,
  canvasToBlob,
  orderQuad,
  type Quad,
  type Point,
  type ScanMode,
  MAX_DIM_DEFAULT,
} from '@/lib/image-utils';
import { buildSearchablePdf } from '@/lib/ocr';

interface CapturedPage {
  blob: Blob;
  width: number;
  height: number;
  thumb: string;
  preview: string;
  src: string;
  quad: Quad;
}

interface DocumentScannerProps {
  onDone: (pages: CapturedPage[]) => void;
  onCancel: () => void;
  onResult?: (file: File, usedOcr: boolean) => void;
  maxPages?: number;
  // When true the scan must be a document file (e.g. Notes) — even a single
  // page is emitted as a PDF instead of a JPG.
  docOnly?: boolean;
}

const MAX_PAGES = 8;

// Scale + offset used to map between a full-res image and its CSS "contain" box.
function fitRect(vw: number, vh: number, cw: number, ch: number) {
  const scale = Math.min(cw / vw, ch / vh);
  return { scale, offX: (cw - vw * scale) / 2, offY: (ch - vh * scale) / 2 };
}

export default function DocumentScanner({ onDone, onCancel, onResult, maxPages = MAX_PAGES, docOnly = false }: DocumentScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<ScanMode>('bw');
  const [ocrEnabled, setOcrEnabled] = useState(false);
  const [pages, setPages] = useState<CapturedPage[]>([]);
  const [busy, setBusy] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [autoCapture, setAutoCapture] = useState(true);
  const [detected, setDetected] = useState(false);
  const [stable, setStable] = useState(0);
  const [autoCrop, setAutoCrop] = useState(true);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const quadRef = useRef<Quad | null>(null);
  const modeRef = useRef<ScanMode>('bw');
  modeRef.current = mode;
  const autoRef = useRef(true);
  autoRef.current = autoCapture;
  const autoCropRef = useRef(true);
  autoCropRef.current = autoCrop;
  const busyRef = useRef(false);
  busyRef.current = busy;
  const pagesLenRef = useRef(0);
  pagesLenRef.current = pages.length;
  const pagesRef = useRef<CapturedPage[]>([]);
  pagesRef.current = pages;
  // Index of the page currently being edited (re-edit) or null for a new capture.
  const editingIndexRef = useRef<number | null>(null);

  // Auto-capture stability tracking.
  const lastQuadRef = useRef<Quad | null>(null);
  const stableFramesRef = useRef(0);

  // ---- Edit overlay (captured frame with adjustable corners) ----
  const editingSrcRef = useRef<string | null>(null);
  const editingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const editingQuadRef = useRef<Quad | null>(null);
  const [editingSrc, setEditingSrc] = useState<string | null>(null);
  const editingImgRef = useRef<HTMLImageElement>(null);
  const editOverlayRef = useRef<HTMLCanvasElement>(null);
  const editingRef = useRef(false);
  editingRef.current = !!editingSrc;

  // ---- Camera setup ----
  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        setReady(true);
      } catch {
        setError('Camera access denied or unavailable. Please allow camera permission.');
      }
    }
    start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, []);

  // The <video> unmounts while the edit screen is shown, so a fresh element is
  // mounted when returning to the camera. This callback re-attaches the stream
  // on every mount and resumes playback automatically.
  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el && streamRef.current && el.srcObject !== streamRef.current) {
      el.srcObject = streamRef.current;
      el.play().catch(() => {});
      setReady(true);
    }
  }, []);

  // ---- Freeze current frame into edit mode ----
  const freezeFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.readyState) return;
    const sw = video.videoWidth;
    const sh = video.videoHeight;
    if (!sw || !sh) return;
    const raw = document.createElement('canvas');
    raw.width = sw;
    raw.height = sh;
    const ctx = raw.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, sw, sh);
    ctx.drawImage(video, 0, 0, sw, sh);
    // Prefer the live-smoothed quad; fall back to full frame.
    const quad = quadRef.current
      ? quadRef.current.map(p => ({ ...p })) as Quad
      : [{ x: 0, y: 0 }, { x: sw, y: 0 }, { x: sw, y: sh }, { x: 0, y: sh }];
    editingCanvasRef.current = raw;
    editingQuadRef.current = orderQuad(quad);
    editingSrcRef.current = raw.toDataURL('image/jpeg', 0.85);
    editingIndexRef.current = null; // new capture
    setEditingSrc(editingSrcRef.current);
    // Re-detect on the full-resolution still so corners hug the paper exactly,
    // then snap the editing quad to the better result.
    detectQuadOnStill(raw).then(detected => {
      if (editingSrcRef.current && detected) {
        editingQuadRef.current = orderQuad(detected);
        requestAnimationFrame(() => drawEditOverlay());
      }
    }).catch(() => {});
  }, []);

  // Re-run detection on a captured still at a reasonable resolution.
  async function detectQuadOnStill(canvas: HTMLCanvasElement): Promise<Quad | null> {
    const cw = canvas.width;
    const ch = canvas.height;
    const scale = Math.min(1, 640 / Math.max(cw, ch));
    const dw = Math.round(cw * scale);
    const dh = Math.round(ch * scale);
    const small = document.createElement('canvas');
    small.width = dw;
    small.height = dh;
    const sctx = small.getContext('2d')!;
    sctx.drawImage(canvas, 0, 0, dw, dh);
    const quad = detectQuadOnCanvas(small, dw, dh);
    if (!quad) return null;
    return quad.map(p => ({ x: p.x / scale, y: p.y / scale })) as Quad;
  }

  // ---- Edge detection loop (throttled interval) + auto-capture ----
  useEffect(() => {
    if (!ready) return;
    let disposed = false;
    const DETECT_MS = 180;
    let lastDetect = 0;

    function tick() {
      if (disposed || editingRef.current) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;

      // When auto-detect is off, clear the frame.
      if (!autoCropRef.current) {
        quadRef.current = null;
        lastQuadRef.current = null;
        stableFramesRef.current = 0;
        setStable(0);
        setDetected(false);
        return;
      }

      const now = Date.now();
      if (now - lastDetect < DETECT_MS) return;
      lastDetect = now;

      const scale = Math.min(1, 320 / Math.max(vw, vh));
      const dw = Math.round(vw * scale);
      const dh = Math.round(vh * scale);
      let quad: Quad | null = null;
      try {
        quad = detectDocumentQuad(video, dw, dh);
      } catch {
        quad = null;
      }
      const full = quad ? quad.map(p => ({ x: p.x / scale, y: p.y / scale })) as Quad : null;

      if (full) {
        // Temporal smoothing so the frame glides instead of jumping.
        const prev = lastQuadRef.current;
        const smoothed: Quad = prev
          ? orderQuad(full.map((p, i) => ({
              x: prev[i].x * 0.55 + p.x * 0.45,
              y: prev[i].y * 0.55 + p.y * 0.45,
            })) as Quad)
          : full;
        quadRef.current = smoothed;
        setDetected(true);

        // Stability: same-ish quad for several frames triggers auto-capture.
        if (lastQuadRef.current) {
          let jitter = 0;
          for (let i = 0; i < 4; i++) {
            jitter += Math.hypot(full[i].x - lastQuadRef.current[i].x, full[i].y - lastQuadRef.current[i].y);
          }
          const diag = Math.hypot(vw, vh);
          const area = Math.abs((() => {
            let a = 0;
            for (let i = 0; i < 4; i++) {
              const p = full[i], q = full[(i + 1) % 4];
              a += p.x * q.y - q.x * p.y;
            }
            return a / 2;
          })());
          const areaFrac = area / (vw * vh);
          if (jitter / 4 < diag * 0.02 && areaFrac > 0.15) {
            stableFramesRef.current++;
          } else {
            stableFramesRef.current = 0;
          }
        } else {
          stableFramesRef.current = 0;
        }
        lastQuadRef.current = full;
        setStable(stableFramesRef.current);

        if (
          autoRef.current &&
          !busyRef.current &&
          stableFramesRef.current >= 5 &&
          pagesLenRef.current < maxPages
        ) {
          stableFramesRef.current = 0;
          lastQuadRef.current = null;
          freezeFrame();
        }
      } else {
        quadRef.current = null;
        lastQuadRef.current = null;
        stableFramesRef.current = 0;
        setStable(0);
        setDetected(false);
      }
    }

    const id = window.setInterval(tick, DETECT_MS);
    return () => {
      disposed = true;
      window.clearInterval(id);
    };
  }, [ready, freezeFrame, maxPages]);

  // ---- Overlay: draw live quad + corner handles ----
  useEffect(() => {
    if (!ready) return;
    let disposed = false;
    function drawOverlay() {
      if (disposed) return;
      const video = videoRef.current;
      const overlay = overlayRef.current;
      if (video && overlay && video.readyState >= 2) {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const cssW = overlay.clientWidth;
        const cssH = overlay.clientHeight;
        if (vw && vh && cssW && cssH) {
          overlay.width = cssW * devicePixelRatio;
          overlay.height = cssH * devicePixelRatio;
          const ctx = overlay.getContext('2d')!;
          ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
          ctx.clearRect(0, 0, cssW, cssH);
          const { scale, offX, offY } = fitRect(vw, vh, cssW, cssH);
          const quad = quadRef.current;
          if (quad) {
            const pts = quad.map(p => ({ x: offX + p.x * scale, y: offY + p.y * scale }));
            // Dim everything outside the document.
            ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.closePath();
            ctx.fill('evenodd');
            // Document glow.
            ctx.fillStyle = 'rgba(52, 211, 153, 0.08)';
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.closePath();
            ctx.fill();
            // Border.
            ctx.strokeStyle = 'rgba(52, 211, 153, 0.95)';
            ctx.lineWidth = 2.5;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.closePath();
            ctx.stroke();
            ctx.setLineDash([]);
            for (const p of pts) {
              ctx.fillStyle = '#fff';
              ctx.strokeStyle = '#34d399';
              ctx.lineWidth = 2.5;
              ctx.beginPath();
              ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
            }
          } else {
            // Default framing guide: inset rectangle with corner brackets.
            const margin = Math.min(cssW, cssH) * 0.06;
            const x0 = offX + vw * scale * margin / Math.max(1, Math.min(cssW, cssH)) * 0 + margin;
            const bx = offX + margin;
            const by = offY + margin;
            const bw = vw * scale - margin * 2;
            const bh = vh * scale - margin * 2;
            if (bw > 20 && bh > 20) {
              const len = Math.min(cssW, cssH) * 0.09;
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
              ctx.lineWidth = 3;
              const corners: [number, number, number, number][] = [
                [bx, by, 1, 1],
                [bx + bw, by, -1, 1],
                [bx + bw, by + bh, -1, -1],
                [bx, by + bh, 1, -1],
              ];
              for (const [cx, cy, dx, dy] of corners) {
                ctx.beginPath();
                ctx.moveTo(cx + dx * len, cy);
                ctx.lineTo(cx, cy);
                ctx.lineTo(cx, cy + dy * len);
                ctx.stroke();
              }
            }
          }
        }
      }
      requestAnimationFrame(drawOverlay);
    }
    const id = requestAnimationFrame(drawOverlay);
    return () => {
      disposed = true;
      cancelAnimationFrame(id);
    };
  }, [ready]);

  // ---- Live view corner dragging ----
  const dragRef = useRef<{ idx: number; start: Point } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    if (!quadRef.current) return;
    const video = videoRef.current!;
    const rect = video.getBoundingClientRect();
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const { scale, offX, offY } = fitRect(vw, vh, rect.width, rect.height);
    const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    let best = -1;
    let bestDist = 30;
    quadRef.current.forEach((q, i) => {
      const d = Math.hypot(p.x - (offX + q.x * scale), p.y - (offY + q.y * scale));
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    if (best >= 0) {
      dragRef.current = { idx: best, start: p };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag || !quadRef.current) return;
    const rect = videoRef.current!.getBoundingClientRect();
    const vw = videoRef.current!.videoWidth;
    const vh = videoRef.current!.videoHeight;
    const { scale, offX, offY } = fitRect(vw, vh, rect.width, rect.height);
    const np = { x: (e.clientX - rect.left - offX) / scale, y: (e.clientY - rect.top - offY) / scale };
    const quad = quadRef.current.map(p => ({ ...p }));
    quad[drag.idx] = { x: Math.max(0, Math.min(vw, np.x)), y: Math.max(0, Math.min(vh, np.y)) };
    quadRef.current = orderQuad(quad);
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  // ---- Edit overlay corner dragging ----
  const editDragRef = useRef<{ idx: number; start: Point } | null>(null);

  function drawEditOverlay() {
    const overlay = editOverlayRef.current;
    const img = editingImgRef.current;
    if (!overlay || !img || !editingQuadRef.current) return;
    const cssW = overlay.clientWidth;
    const cssH = overlay.clientHeight;
    if (!cssW || !cssH) return;
    overlay.width = cssW * devicePixelRatio;
    overlay.height = cssH * devicePixelRatio;
    const ctx = overlay.getContext('2d')!;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    const vw = img.naturalWidth || img.width;
    const vh = img.naturalHeight || img.height;
    const { scale, offX, offY } = fitRect(vw, vh, cssW, cssH);
    const quad = editingQuadRef.current;
    const pts = quad.map(p => ({ x: offX + p.x * scale, y: offY + p.y * scale }));
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.95)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    for (const p of pts) {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  function onEditPointerDown(e: React.PointerEvent) {
    if (!editingQuadRef.current || !editingImgRef.current) return;
    const img = editingImgRef.current;
    const rect = img.getBoundingClientRect();
    const vw = img.naturalWidth || img.width;
    const vh = img.naturalHeight || img.height;
    const { scale, offX, offY } = fitRect(vw, vh, rect.width, rect.height);
    const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    let best = -1;
    let bestDist = 30;
    editingQuadRef.current.forEach((q, i) => {
      const d = Math.hypot(p.x - (offX + q.x * scale), p.y - (offY + q.y * scale));
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    if (best >= 0) {
      editDragRef.current = { idx: best, start: p };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  }

  function onEditPointerMove(e: React.PointerEvent) {
    const drag = editDragRef.current;
    if (!drag || !editingQuadRef.current || !editingImgRef.current) return;
    const img = editingImgRef.current;
    const rect = img.getBoundingClientRect();
    const vw = img.naturalWidth || img.width;
    const vh = img.naturalHeight || img.height;
    const { scale, offX, offY } = fitRect(vw, vh, rect.width, rect.height);
    const np = { x: (e.clientX - rect.left - offX) / scale, y: (e.clientY - rect.top - offY) / scale };
    const quad = editingQuadRef.current.map(p => ({ ...p }));
    quad[drag.idx] = { x: Math.max(0, Math.min(vw, np.x)), y: Math.max(0, Math.min(vh, np.y)) };
    editingQuadRef.current = orderQuad(quad);
    drawEditOverlay();
  }

  function onEditPointerUp() {
    editDragRef.current = null;
  }

  // ---- Manual capture button ----
  const capture = useCallback(() => {
    if (busy || pages.length >= maxPages) return;
    freezeFrame();
  }, [busy, pages.length, maxPages, freezeFrame]);

  // ---- Confirm edited corners -> process into a page ----
  const confirmEdit = useCallback(async () => {
    const canvas = editingCanvasRef.current;
    const quad = editingQuadRef.current;
    const src = editingSrcRef.current;
    if (!canvas || !quad || !src) return;
    setBusy(true);
    setProgressMsg('Processing...');
    try {
      const result = processFrame(canvas, quad, modeRef.current, MAX_DIM_DEFAULT);
      const blob = await canvasToBlob(result.canvas, 'image/jpeg', 0.9);
      const thumb = result.canvas.toDataURL('image/jpeg', 0.5);
      const preview = result.canvas.toDataURL('image/jpeg', 0.75);
      const page: CapturedPage = {
        blob,
        width: result.width,
        height: result.height,
        thumb,
        preview,
        src,
        quad: orderQuad(quad),
      };
      const editingIndex = editingIndexRef.current;
      let addedIndex: number;
      if (editingIndex !== null) {
        // Re-editing an existing page: replace in place.
        setPages(prev => prev.map((p, i) => (i === editingIndex ? page : p)));
        addedIndex = editingIndex;
        editingIndexRef.current = null;
      } else {
        addedIndex = pagesRef.current.length;
        setPages(prev => [...prev, page]);
      }
      // Show the processed page in the preview screen, like CamScanner.
      setPreviewIndex(addedIndex);
      setEditingSrc(null);
      editingSrcRef.current = null;
      editingCanvasRef.current = null;
      editingQuadRef.current = null;
      quadRef.current = null;
      lastQuadRef.current = null;
      stableFramesRef.current = 0;
      setStable(0);
      setDetected(false);
      setProgressMsg('');
    } catch {
      setError('Failed to process frame');
    }
    setBusy(false);
  }, []);

  // ---- Re-open a captured page for corner adjustment ----
  const reEditPage = useCallback((index: number) => {
    const page = pagesRef.current[index];
    if (!page) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      editingCanvasRef.current = canvas;
      editingQuadRef.current = page.quad ? orderQuad(page.quad.map(p => ({ ...p }))) : null;
      editingSrcRef.current = page.src;
      editingIndexRef.current = index;
      setEditingSrc(page.src);
    };
    img.src = page.src;
  }, []);

  // ---- Delete a captured page ----
  const deletePage = useCallback((index: number) => {
    setPages(prev => prev.filter((_, i) => i !== index));
    setPreviewIndex(null);
  }, []);

  // ---- Move a captured page left/right ----
  const movePage = useCallback((index: number, dir: -1 | 1) => {
    setPages(prev => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      const tmp = next[index];
      next[index] = next[target];
      next[target] = tmp;
      return next;
    });
    setPreviewIndex(index + dir);
  }, []);

  // ---- Discard edit and go back to camera ----
  const retake = useCallback(() => {
    setEditingSrc(null);
    editingSrcRef.current = null;
    editingCanvasRef.current = null;
    editingQuadRef.current = null;
    stableFramesRef.current = 0;
    setStable(0);
  }, []);

  // ---- Auto-fix: re-detect the paper corners on the still frame ----
  const [autoFixBusy, setAutoFixBusy] = useState(false);
  const autoFix = useCallback(async () => {
    const canvas = editingCanvasRef.current;
    if (!canvas || autoFixBusy) return;
    setAutoFixBusy(true);
    try {
      const detected = await detectQuadOnStill(canvas);
      if (detected) {
        editingQuadRef.current = orderQuad(detected);
        requestAnimationFrame(() => drawEditOverlay());
      }
    } catch {
      // ignore
    }
    setAutoFixBusy(false);
  }, [autoFixBusy]);

  // ---- Draw edit overlay when it becomes visible / after image loads ----
  useEffect(() => {
    if (!editingSrc) return;
    let disposed = false;
    function loop() {
      if (disposed) return;
      if (editingImgRef.current && editingImgRef.current.complete) {
        drawEditOverlay();
        return;
      }
      requestAnimationFrame(loop);
    }
    const t = window.setTimeout(() => { if (!disposed) requestAnimationFrame(loop); }, 30);
    return () => {
      disposed = true;
      window.clearTimeout(t);
    };
  }, [editingSrc]);

  // ---- Finish: 1 image -> image; multiple -> merged PDF (OCR if enabled) ----
  const finish = useCallback(async () => {
    if (pages.length === 0) return;
    setBusy(true);
    setProgressMsg('Finalizing...');
    try {
      if (pages.length === 1 && !docOnly) {
        const page = pages[0];
        const blob = page.blob;
        const name = `scan_${Date.now()}.jpg`;
        onResult?.(new File([blob], name, { type: 'image/jpeg' }), false);
        onDone(pages);
        return;
      }
      if (ocrEnabled) {
        setProgressMsg('Running OCR — this may take a while...');
      }
      const file = await buildSearchablePdf(
        pages.map(p => ({ blob: p.blob, width: p.width, height: p.height })),
        ocrEnabled,
        `scan_${Date.now()}.pdf`,
        p => setProgressMsg(`Building PDF... ${Math.round(p * 100)}%`)
      );
      onResult?.(file, ocrEnabled);
      onDone(pages);
    } catch (err: any) {
      setError('Failed to finalize: ' + (err?.message || 'Unknown error'));
    }
    setBusy(false);
  }, [pages, ocrEnabled, onDone, onResult, docOnly]);

  const noDetect = () => {
    const next = !autoCropRef.current;
    autoCropRef.current = next;
    setAutoCrop(next);
    if (!next) {
      quadRef.current = null;
      lastQuadRef.current = null;
      stableFramesRef.current = 0;
      setStable(0);
      setDetected(false);
    }
  };

  // ---- Edit screen ----
  if (editingSrc) {
    return (
      <div className="fixed inset-0 z-[210] bg-black flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-black/90 border-b border-white/10">
          <button className="w-9 h-9 rounded-lg bg-white/10 text-white flex items-center justify-center cursor-pointer border-none" onClick={retake}>
            <i className="fas fa-rotate-left"></i>
          </button>
          <span className="text-white text-[0.9rem] font-semibold">Adjust corners</span>
          <span className="text-white/60 text-[0.75rem] w-9 text-right">{pages.length}/{maxPages}</span>
        </div>

        {/* Image + corner handles */}
        <div className="relative flex-1 overflow-hidden bg-black">
          <img
            ref={editingImgRef}
            src={editingSrc}
            alt="captured"
            className="absolute inset-0 w-full h-full object-contain touch-none"
            draggable={false}
            onPointerDown={onEditPointerDown}
            onPointerMove={onEditPointerMove}
            onPointerUp={onEditPointerUp}
          />
          <canvas ref={editOverlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/80 text-[0.72rem] bg-black/60 px-3 py-1.5 rounded-lg whitespace-nowrap">
            <i className="fas fa-hand-pointer mr-1"></i>Drag the green corners to fit the document
          </div>
        </div>

        {/* Bottom controls */}
        <div className="px-4 py-4 bg-black/90 border-t border-white/10 flex items-center justify-center gap-8">
          <button
            className="flex flex-col items-center gap-1 text-white/60 text-[0.68rem] bg-transparent border-none cursor-pointer"
            onClick={retake}
          >
            <i className="fas fa-rotate-left text-lg"></i>
            Retake
          </button>
          <button
            className="w-16 h-16 rounded-full bg-qsis text-white flex items-center justify-center cursor-pointer hover:opacity-90 border-none disabled:opacity-40"
            onClick={confirmEdit}
            disabled={busy}
            title="Apply crop & straighten"
          >
            <i className={`fas ${busy ? 'fa-spinner fa-spin' : 'fa-check'} text-xl`}></i>
          </button>
          <button
            className="flex flex-col items-center gap-1 text-qsis text-[0.68rem] bg-transparent border-none cursor-pointer disabled:opacity-40"
            onClick={autoFix}
            disabled={busy || autoFixBusy}
          >
            <i className={`fas ${autoFixBusy ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'} text-lg`}></i>
            {autoFixBusy ? 'Detecting...' : 'Auto-fix'}
          </button>
        </div>
      </div>
    );
  }

  // ---- Live view ----
  return (
    <div className="fixed inset-0 z-[210] bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/90 border-b border-white/10">
        <button className="w-9 h-9 rounded-lg bg-white/10 text-white flex items-center justify-center cursor-pointer border-none" onClick={onCancel}>
          <i className="fas fa-arrow-left"></i>
        </button>
        <span className="text-white text-[0.9rem] font-semibold">Document Scanner</span>
        <span className="text-white/60 text-[0.75rem] w-9 text-right">{pages.length}/{maxPages}</span>
      </div>

      {/* Viewfinder */}
      <div className="relative flex-1 overflow-hidden bg-black">
        <video
          ref={attachVideo}
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-contain"
          style={{ display: ready ? 'block' : 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
        <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />

        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-white/70 flex flex-col items-center gap-2">
              <i className="fas fa-spinner fa-spin text-2xl"></i>
              <span className="text-[0.8rem]">Starting camera...</span>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
            <i className="fas fa-video-slash text-3xl text-red-400"></i>
            <p className="text-white/80 text-[0.85rem]">{error}</p>
            <button className="px-4 py-2 rounded-lg bg-white/15 text-white text-[0.8rem] cursor-pointer border-none" onClick={onCancel}>
              Back
            </button>
          </div>
        )}

        {/* Mode toggle */}
        {ready && !error && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex rounded-xl overflow-hidden bg-black/60 border border-white/15">
            {([
              ['bw', 'B&W'],
              ['enhance', 'Enhance'],
              ['original', 'Original'],
            ] as [ScanMode, string][]).map(([val, label]) => (
              <button
                key={val}
                className={`px-3 py-1.5 text-[0.72rem] font-semibold cursor-pointer border-none transition-colors ${mode === val ? 'bg-qsis text-white' : 'bg-transparent text-white/70'}`}
                onClick={() => setMode(val)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Auto-capture + OCR toggles */}
        {ready && !error && (
          <div className="absolute top-3 right-3 flex flex-col gap-2">
            <button
              className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-[0.72rem] font-semibold cursor-pointer border border-white/15 transition-colors ${autoCapture ? 'bg-qsis text-white' : 'bg-black/60 text-white/70'}`}
              onClick={() => setAutoCapture(v => !v)}
              title="Automatically capture when the document is detected and held steady"
            >
              <i className={`fas ${autoCapture ? 'fa-bolt' : 'fa-bolt text-white/40'}`}></i>
              Auto
            </button>
            <button
              className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-[0.72rem] font-semibold cursor-pointer border border-white/15 transition-colors ${ocrEnabled ? 'bg-accent text-white' : 'bg-black/60 text-white/70'}`}
              onClick={() => setOcrEnabled(v => !v)}
            >
              <i className={`fas ${ocrEnabled ? 'fa-check' : 'fa-eye-slash'}`}></i>
              OCR
            </button>
          </div>
        )}

        {/* Status hint */}
        {ready && !error && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 text-white/80 text-[0.7rem] bg-black/50 px-3 py-1 rounded-lg whitespace-nowrap">
            {autoCapture && detected && stable >= 5
              ? <span className="text-qsis"><i className="fas fa-bolt mr-1"></i>Capturing...</span>
              : autoCapture && detected
                ? <span><i className="fas fa-circle-notch fa-spin mr-1"></i>Hold steady...</span>
                : <span>Point camera at the document {autoCapture ? '— auto capture' : ''}</span>}
          </div>
        )}

        {progressMsg && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 text-white/90 text-[0.78rem] bg-black/70 px-3 py-1.5 rounded-lg">
            <i className="fas fa-spinner fa-spin mr-2"></i>{progressMsg}
          </div>
        )}

        {/* Captured thumbnails */}
        {pages.length > 0 && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 flex gap-2">
            {pages.map((p, i) => (
              <div key={i} className="relative w-14 h-20 rounded-lg overflow-hidden border-2 border-white/40 bg-white">
                <img src={p.thumb} alt={`page ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white text-[0.6rem] rounded-bl-lg cursor-pointer border-none flex items-center justify-center"
                  onClick={() => setPages(prev => prev.filter((_, j) => j !== i))}
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="px-4 py-4 bg-black/90 border-t border-white/10 flex items-center justify-center gap-6">
        <button
          className="flex flex-col items-center gap-1 text-white/60 text-[0.68rem] bg-transparent border-none cursor-pointer"
          onClick={noDetect}
          title="Toggle document auto-detection"
        >
          <i className="fas fa-rotate-left text-lg"></i>
          {autoCrop ? 'No Auto-Crop' : 'Auto-Crop On'}
        </button>
        <button
          className="w-16 h-16 rounded-full border-4 border-white bg-white/10 flex items-center justify-center cursor-pointer hover:bg-white/20 transition-colors"
          onClick={capture}
          disabled={busy}
          title="Capture"
        >
          <i className="fas fa-camera text-white text-xl"></i>
        </button>
        <button
          className="flex flex-col items-center gap-1 text-qsis text-[0.68rem] bg-transparent border-none cursor-pointer disabled:opacity-40"
          onClick={finish}
          disabled={pages.length === 0 || busy}
          title="Finish"
        >
          <i className="fas fa-check-circle text-lg"></i>
          {pages.length > 1 ? 'Merge to PDF' : 'Done'}
        </button>
      </div>
    </div>
  );
}

export type { CapturedPage };
