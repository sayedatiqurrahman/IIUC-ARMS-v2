'use client';

import { jsPDF } from 'jspdf';
import { fileToDataUrl } from './image-utils';

export interface OcrWord {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  confidence: number;
}

export interface OcrResult {
  words: OcrWord[];
  text: string;
}

interface PageImage {
  blob: Blob | File;
  width: number;
  height: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OcrWorkerInstance = any;

let workerPromise: Promise<OcrWorkerInstance> | null = null;

async function loadTesseract() {
  const mod = await import('tesseract.js');
  return mod;
}

export async function getOcrWorker(): Promise<OcrWorkerInstance> {
  if (typeof window === 'undefined') throw new Error('OCR requires browser');
  if (!workerPromise) {
    workerPromise = loadTesseract().then(({ createWorker }) =>
      createWorker('eng', 1, {
        langPath: '/tessdata',
        gzip: true,
        workerPath: '/tessdata/worker.min.js',
        corePath: '/tessdata',
        cachePath: 'qsis-ocr',
      })
    );
  }
  return workerPromise;
}

export async function terminateOcrWorker(): Promise<void> {
  if (workerPromise) {
    try {
      const w = await workerPromise;
      await w.terminate();
    } catch {}
    workerPromise = null;
  }
}

export async function ocrImage(
  image: Blob | File | HTMLCanvasElement | string,
  onProgress?: (p: number) => void
): Promise<OcrResult> {
  const worker = await getOcrWorker();
  const { data } = await worker.recognize(image as any, {}, { text: true, blocks: true });
  if (onProgress) onProgress(1);
  const words: OcrWord[] = [];
  const text = data.text || '';
  const blockQueue: any[] = [...(data.blocks || [])];
  while (blockQueue.length) {
    const block = blockQueue.shift();
    if (!block) continue;
    if (block.paragraphs) blockQueue.push(...block.paragraphs);
    if (block.lines) blockQueue.push(...block.lines);
    if (block.words) {
      for (const w of block.words) {
        if (!w.text || !w.bbox) continue;
        words.push({
          text: w.text,
          x0: w.bbox.x0,
          y0: w.bbox.y0,
          x1: w.bbox.x1,
          y1: w.bbox.y1,
          confidence: w.confidence || 0,
        });
      }
    }
  }
  return { words, text };
}

// Build a PDF with the image page + an invisible (selectable/copyable) text layer.
export async function buildSearchablePdf(
  pages: PageImage[],
  ocrEnabled: boolean,
  fileName: string,
  onProgress?: (p: number) => void
): Promise<File> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    if (i > 0) pdf.addPage();

    const dataUrl = await fileToDataUrl(page.blob);
    const ratio = Math.min((pageW - 10) / page.width, (pageH - 10) / page.height);
    const w = page.width * ratio;
    const h = page.height * ratio;
    const x = (pageW - w) / 2;
    const y = (pageH - h) / 2;
    const isPng = (page.blob.type || '').includes('png') || dataUrl.startsWith('data:image/png');
    pdf.addImage(dataUrl, isPng ? 'PNG' : 'JPEG', x, y, w, h);

    if (ocrEnabled && onProgress) onProgress((i + 0.5) / pages.length);

    if (ocrEnabled) {
      try {
        const { words } = await ocrImage(page.blob);
        // Scale OCR pixel coords -> PDF mm coords
        const sx = w / page.width;
        const sy = h / page.height;
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(0, 0, 0);
        // Render mode 3 = invisible text: selectable/copyable but not drawn
        (pdf as any).internal.write('3 Tr');
        for (const word of words) {
          if (!word.text.trim()) continue;
          const fontScale = (word.y1 - word.y0) * sy * 0.9;
          if (fontScale <= 0 || fontScale > 40) continue;
          pdf.setFontSize(fontScale);
          pdf.text(word.text, x + word.x0 * sx, y + word.y1 * sy);
        }
        (pdf as any).internal.write('0 Tr');
      } catch {
        // OCR failed for this page — keep image-only
      }
    }
    if (onProgress) onProgress((i + 1) / pages.length);
  }

  const blob = pdf.output('blob');
  return new File([blob], fileName, { type: 'application/pdf' });
}

// Re-exported helpers used by the scanner / upload flow.
export async function blobToCanvas(blob: Blob | File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}
