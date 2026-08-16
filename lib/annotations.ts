// Shared annotation model + drawing for the in-app PDF and DOCX viewers.
// Points are stored normalized (0..1) relative to the page so marks scale
// correctly with any zoom level.

export interface AnnoPoint {
  x: number;
  y: number;
}

export type AnnoType = 'pen' | 'highlight' | 'text';

/** Shape tools from a Zoom / Excalidraw-style annotation bar. */
export type AnnoShape = 'rect' | 'ellipse' | 'line' | 'arrow';

/** Everything a user can pick from the annotation toolbar. */
export type AnnoTool = AnnoType | AnnoShape;

// 'xdraw' annotations are Excalidraw scenes drawn over a page snapshot. The
// scene is rasterized to a transparent PNG (image) at save time so overlaying
// it on the document is cheap; `scene` keeps the editable JSON for re-opening.
export type AnnotationType = AnnoType | 'xdraw';

export interface Annotation {
  id: string;
  page: number; // 1-based page number / section index
  type: AnnotationType;
  color: string;
  points: AnnoPoint[];
  text?: string;
  lineWidth: number; // fraction of page width
  fontSize: number; // fraction of page width
  /** Shape tools: points = [start, end] of the shape. */
  shape?: AnnoShape;
  image?: string; // xdraw: transparent PNG dataURL of the page-area scene
  imgW?: number; // xdraw: PNG natural width (== page area width)
  imgH?: number; // xdraw: PNG natural height (== page area height)
  scene?: string; // xdraw: serialized Excalidraw scene JSON (re-edit source)
}

/** Builds an annotation from a toolbar tool. Shape tools are stored as `type:
 *  'pen'` + a `shape` field so the raster pipeline routes them to the right
 *  drawing branch. */
export function makeAnno(
  id: string,
  page: number,
  tool: AnnoTool,
  color: string,
  points: AnnoPoint[]
): Annotation {
  const isShape = tool === 'rect' || tool === 'ellipse' || tool === 'line' || tool === 'arrow';
  return {
    id,
    page,
    type: tool === 'text' ? 'text' : 'pen',
    ...(isShape ? { shape: tool as AnnoShape } : {}),
    color,
    points,
    lineWidth: 0.0035,
    fontSize: 0.018,
  };
}

export const ANNO_COLORS = ['#ef4444', '#f59e0b', '#facc15', '#22c55e', '#3b82f6', '#a855f7', '#111111', '#ffffff'];

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// Decoded xdraw PNGs, cached per annotation id so overlay repaints stay cheap.
const xdrawCache = new Map<string, HTMLImageElement>();

/** Preloads an xdraw annotation's raster so drawAnno can overlay it. Returns
 *  true when a brand-new load was kicked off. */
export function preloadXdraw(anno: Annotation, onDone?: () => void): boolean {
  if (!anno.image || anno.type !== 'xdraw') return false;
  if (xdrawCache.has(anno.id)) {
    onDone?.();
    return false;
  }
  const img = new Image();
  xdrawCache.set(anno.id, img);
  img.onload = () => onDone?.();
  img.onerror = () => onDone?.();
  img.src = anno.image;
  return true;
}

export function clearXdrawCache() {
  xdrawCache.clear();
}

export function drawAnno(ctx: CanvasRenderingContext2D, a: Annotation, cw: number, ch: number) {
  if (a.type === 'xdraw') {
    const img = xdrawCache.get(a.id);
    if (img && img.complete && img.naturalWidth) {
      ctx.drawImage(img, 0, 0, cw, ch);
    }
    return;
  }
  if (a.type === 'text') {
    ctx.font = `${Math.max(6, a.fontSize * cw)}px 'Segoe UI', sans-serif`;
    ctx.fillStyle = a.color;
    ctx.textBaseline = 'alphabetic';
    const p = a.points[0];
    ctx.fillText(a.text || '', p.x * cw, p.y * ch);
    return;
  }
  ctx.strokeStyle = a.color;
  ctx.lineWidth = Math.max(1.5, a.lineWidth * cw);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (a.shape) {
    ctx.globalAlpha = 1;
    const p0 = a.points[0];
    const p1 = a.points[1] || p0;
    const x0 = p0.x * cw, y0 = p0.y * ch, x1 = p1.x * cw, y1 = p1.y * ch;
    if (a.shape === 'rect') {
      ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    } else if (a.shape === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      if (a.shape === 'arrow') {
        const ang = Math.atan2(y1 - y0, x1 - x0);
        const len = Math.min(14, Math.hypot(x1 - x0, y1 - y0) / 4 + 6);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 - len * Math.cos(ang - 0.45), y1 - len * Math.sin(ang - 0.45));
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 - len * Math.cos(ang + 0.45), y1 - len * Math.sin(ang + 0.45));
        ctx.stroke();
      }
    }
    return;
  }
  ctx.globalAlpha = a.type === 'highlight' ? 0.35 : 1;
  ctx.lineWidth = a.type === 'highlight' ? Math.max(10, ch * 0.035) : Math.max(1.5, a.lineWidth * cw);
  ctx.beginPath();
  a.points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x * cw, p.y * ch);
    else ctx.lineTo(p.x * cw, p.y * ch);
  });
  ctx.stroke();
  ctx.globalAlpha = 1;
}
