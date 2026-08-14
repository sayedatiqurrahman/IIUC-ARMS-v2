// Bakes the current annotation layers into a PDF and downloads it as a brand
// new file. Each page is re-rendered with pdf.js at 2x, the page's annotations
// (pen / highlighter / text plus the Excalidraw drawing layers) are composited
// on top in the exact spot they were drawn, and jsPDF repacks the pages at
// their original page size. The source bytes are never modified.

import { drawAnno, type Annotation } from '@/lib/annotations';

export async function exportAnnotatedPdf(pdf: any, annos: Annotation[], baseName: string): Promise<void> {
  const { jsPDF } = await import('jspdf');

  // Make sure every drawing raster is decoded before compositing.
  await Promise.all(
    annos
      .filter((a) => a.type === 'xdraw' && a.image)
      .map(
        (a) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = a.image as string;
          })
      )
  );

  const numPages = pdf.numPages;
  let doc: any = null;

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: 2 });
    const w = Math.floor(vp.width);
    const h = Math.floor(vp.height);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    for (const a of annos) {
      if (a.page === i) drawAnno(ctx, a, w, h);
    }

    const ptW = base.width;
    const ptH = base.height;
    const landscape = ptW >= ptH;
    const imgData = canvas.toDataURL('image/png');

    if (!doc) {
      doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: [ptW, ptH] });
      doc.addImage(imgData, 'PNG', 0, 0, ptW, ptH, undefined, 'FAST');
    } else {
      doc.addPage([ptW, ptH], landscape ? 'landscape' : 'portrait');
      doc.addImage(imgData, 'PNG', 0, 0, ptW, ptH, undefined, 'FAST');
    }
  }

  const safeName = (baseName || '').replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]/g, '_');
  doc.save(`${safeName || 'document'}-annotated.pdf`);
}
