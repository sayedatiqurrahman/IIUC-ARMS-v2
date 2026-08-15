import { PAGE_SIZES, fieldLabel } from './templates';

// Helpers for publishing a MANUAL (canvas) design as a real fill-up template.
//
// The fabric layers hold every object. Text objects that were assigned a form
// field (fieldMappings: objectId -> fieldType) become `<span data-field-type>`
// elements positioned exactly where they sat on the canvas. Everything else
// (background, shapes, uploaded images, free text) is flattened into a single
// background image (`assets/bg.png`) that gets uploaded to the themes repo.
// The published design.html therefore looks identical AND is fill-up friendly.

export interface ManualLayersLike {
  objects?: unknown[];
  backgroundImage?: unknown;
  backgroundColor?: unknown;
}

export function generateManualDesignHtml(opts: {
  layers: ManualLayersLike;
  fieldMappings: Record<string, string>;
  width: number;
  height: number;
  backgroundRef: string; // "./assets/bg.png" for the repo, a data URL for preview
}): string {
  const { layers, fieldMappings, width, height, backgroundRef } = opts;
  const objects = Array.isArray(layers?.objects) ? (layers.objects as any[]) : [];

  const spans = objects
    .filter((o: any) => o && (o.type === 'text' || o.type === 'textbox' || o.type === 'i-text') && o.id && fieldMappings[o.id])
    .map((o: any) => {
      const type = fieldMappings[o.id];
      const left = Math.round(o.left || 0);
      const top = Math.round(o.top || 0);
      const w = Math.round(o.width || 200);
      const fontFamily = o.fontFamily ? `'${o.fontFamily.replace(/['"]/g, '')}'` : 'Arial';
      const fontSize = Math.round(o.fontSize || 16);
      const fontWeight = o.fontWeight && o.fontWeight !== 'normal' ? `font-weight:${o.fontWeight};` : '';
      const fontStyle = o.fontStyle && o.fontStyle !== 'normal' ? `font-style:${o.fontStyle};` : '';
      const textDecoration = o.underline ? 'text-decoration:underline;' : '';
      const fill = o.fill && typeof o.fill === 'string' ? o.fill : '#111827';
      const textAlign = o.textAlign || 'left';
      const lineHeight = o.lineHeight ? o.lineHeight : 1.2;
      const styles = [
        `position:absolute;left:${left}px;top:${top}px;width:${w}px;`,
        `font-family:${fontFamily};font-size:${fontSize}px;color:${fill};`,
        `text-align:${textAlign};line-height:${lineHeight};`,
        fontWeight,
        fontStyle,
        textDecoration,
      ].join('');
      const label = fieldLabel(type);
      return `<div style="${styles}" data-field-type="${type}">${label}</div>`;
    })
    .join('\n');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/></head><body style="margin:0;padding:0">
<div style="width:${width}px;height:${height}px;background:${typeof layers?.backgroundColor === 'string' ? layers.backgroundColor : '#ffffff'};position:relative;overflow:hidden;box-sizing:border-box;">
<img src="${backgroundRef}" alt="" crossorigin="anonymous" style="position:absolute;left:0;top:0;width:${width}px;height:${height}px;object-fit:fill;"/>
${spans}
</div></body></html>`;
}

// Render the canvas WITHOUT the mapped text objects to a PNG data URL. This is
// the flattened background uploaded to the themes repo as assets/bg.png.
export async function renderManualBackground(
  layers: unknown,
  width: number,
  height: number,
  fieldMappings: Record<string, string>
): Promise<string> {
  const fabric = await import('fabric');
  const el = document.createElement('canvas');
  el.width = width;
  el.height = height;
  const canvas = new fabric.Canvas(el, { width, height, backgroundColor: '#ffffff' });
  try {
    await canvas.loadFromJSON(JSON.stringify(layers));
    const mapped = new Set(Object.keys(fieldMappings));
    const toRemove = canvas.getObjects().filter((o: any) => o && o.id && mapped.has(o.id));
    toRemove.forEach((o: any) => canvas.remove(o));
    canvas.renderAll();
    return canvas.toDataURL({ format: 'png', multiplier: 1 });
  } finally {
    canvas.dispose();
  }
}
