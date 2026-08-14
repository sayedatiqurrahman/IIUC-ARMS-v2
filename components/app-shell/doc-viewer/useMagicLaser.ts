import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { LaserPointer } from '@excalidraw/laser-pointer';

// Excalidraw-style "smart magic laser": a bright tapered stroke that follows
// the pointer and whose tail retracts over a short window, animated on a
// transparent overlay canvas. Points older than MAX_AGE ms are dropped, so the
// trail continuously shrinks — the signature Excalidraw laser animation.

const MAX_AGE = 260;
const LASER_COLOR = '#ff2d55';

interface Point {
  x: number;
  y: number;
  t: number;
}

interface UseMagicLaserOptions {
  enabled: boolean;
  overlayRef: RefObject<HTMLCanvasElement | null>;
  containerRef: RefObject<HTMLElement | null>;
}

export function useMagicLaser({ enabled, overlayRef, containerRef }: UseMagicLaserOptions) {
  const ptsRef = useRef<Point[]>([]);
  const posRef = useRef({ x: -9999, y: -9999, inside: false });

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    const canvas = overlayRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const onMove = (e: PointerEvent | MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      posRef.current = { x: e.clientX - r.left, y: e.clientY - r.top, inside: true };
    };
    const onLeave = () => {
      posRef.current.inside = false;
    };

    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const now = performance.now();

      let pts = ptsRef.current.filter((p) => now - p.t <= MAX_AGE);
      const { x, y, inside } = posRef.current;
      if (inside) pts = [...pts, { x, y, t: now }];
      ptsRef.current = pts;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      if (!cw || !ch) return;
      if (canvas.width !== Math.floor(cw * dpr) || canvas.height !== Math.floor(ch * dpr)) {
        canvas.width = Math.floor(cw * dpr);
        canvas.height = Math.floor(ch * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);

      if (pts.length < 2) return;

      const laser = new LaserPointer({
        size: 2.5,
        streamline: 0.42,
        simplify: 0.1,
        simplifyPhase: 'tail',
        keepHead: true,
        sizeMapping: () => 1,
      });
      for (const p of pts) laser.addPoint([p.x, p.y, 1]);
      laser.close();
      laser.stabilizeTail();
      const outline = laser.getStrokeOutline();
      if (outline.length < 3) return;

      // Tapered stroke with a soft glow, then the bright head dot.
      ctx.save();
      ctx.shadowColor = LASER_COLOR;
      ctx.shadowBlur = 16;
      ctx.fillStyle = LASER_COLOR;
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.moveTo(outline[0][0], outline[0][1]);
      for (let i = 1; i < outline.length; i++) ctx.lineTo(outline[i][0], outline[i][1]);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    };

    raf = requestAnimationFrame(draw);
    container.addEventListener('pointermove', onMove);
    container.addEventListener('mouseleave', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('mouseleave', onLeave);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ptsRef.current = [];
    };
  }, [enabled, overlayRef, containerRef]);
}
