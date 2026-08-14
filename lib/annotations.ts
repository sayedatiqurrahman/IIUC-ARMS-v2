// Shared annotation model + drawing for the in-app PDF and DOCX viewers.
// Points are stored normalized (0..1) relative to the page so marks scale
// correctly with any zoom level.

export interface AnnoPoint {
  x: number;
  y: number;
}

export type AnnoType = 'pen' | 'highlight' | 'text';

export interface Annotation {
  id: string;
  page: number; // 1-based page number / section index
  type: AnnoType;
  color: string;
  points: AnnoPoint[];
  text?: string;
  lineWidth: number; // fraction of page width
  fontSize: number; // fraction of page width
}

export const ANNO_COLORS = ['#ef4444', '#f59e0b', '#facc15', '#22c55e', '#3b82f6', '#a855f7', '#111111', '#ffffff'];

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function drawAnno(ctx: CanvasRenderingContext2D, a: Annotation, cw: number, ch: number) {
  if (a.type === 'text') {
    ctx.font = `${Math.max(6, a.fontSize * cw)}px 'Segoe UI', sans-serif`;
    ctx.fillStyle = a.color;
    ctx.textBaseline = 'alphabetic';
    const p = a.points[0];
    ctx.fillText(a.text || '', p.x * cw, p.y * ch);
    return;
  }
  ctx.strokeStyle = a.color;
  ctx.globalAlpha = a.type === 'highlight' ? 0.35 : 1;
  ctx.lineWidth = a.type === 'highlight' ? Math.max(10, ch * 0.035) : Math.max(1.5, a.lineWidth * cw);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  a.points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x * cw, p.y * ch);
    else ctx.lineTo(p.x * cw, p.y * ch);
  });
  ctx.stroke();
  ctx.globalAlpha = 1;
}
