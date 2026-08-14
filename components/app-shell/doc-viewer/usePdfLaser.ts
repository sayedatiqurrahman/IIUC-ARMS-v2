import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';

interface UsePdfLaserOptions {
  isPdf: boolean;
  tool: 'laser' | 'hand' | 'annotate';
  overlayRef: RefObject<HTMLCanvasElement | null>;
  stageRef: RefObject<HTMLDivElement | null>;
}

export function usePdfLaser({ isPdf, tool, overlayRef, stageRef }: UsePdfLaserOptions) {
  const cursorRef = useRef({ x: -100, y: -100, inside: false });

  const drawLaser = useCallback(() => {
    const canvas = overlayRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, stage.clientWidth, stage.clientHeight);

    const { x, y, inside } = cursorRef.current;
    if (!inside) return;

    const glow = ctx.createRadialGradient(x, y, 1, x, y, 26);
    glow.addColorStop(0, 'rgba(255,70,70,0.65)');
    glow.addColorStop(0.4, 'rgba(255,70,70,0.25)');
    glow.addColorStop(1, 'rgba(255,70,70,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, 26, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ff2d2d';
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }, [overlayRef, stageRef]);

  useEffect(() => {
    if (!isPdf || tool !== 'laser') return;

    const onMove = (e: MouseEvent) => {
      const canvas = overlayRef.current;
      const stage = stageRef.current;
      if (!canvas || !stage) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width ? canvas.clientWidth / rect.width : 1;
      const scaleY = rect.height ? canvas.clientHeight / rect.height : 1;
      cursorRef.current = {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
        inside: true,
      };
    };
    const onLeave = () => {
      cursorRef.current.inside = false;
    };

    let raf = 0;
    const loop = () => {
      drawLaser();
      raf = requestAnimationFrame(loop);
    };

    window.addEventListener('mousemove', onMove);
    stageRef.current?.addEventListener('mouseleave', onLeave);
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('mousemove', onMove);
      stageRef.current?.removeEventListener('mouseleave', onLeave);
      cancelAnimationFrame(raf);
      const canvas = overlayRef.current;
      const stage = stageRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx && stage) ctx.clearRect(0, 0, stage.clientWidth, stage.clientHeight);
    };
  }, [isPdf, tool, drawLaser, stageRef, overlayRef]);

  useEffect(() => {
    if (!isPdf) return;
    const canvas = overlayRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = stage.clientWidth * dpr;
      canvas.height = stage.clientHeight * dpr;
      canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawLaser();
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [isPdf, drawLaser, overlayRef, stageRef]);
}
