/**
 * Lightweight PDF metadata extraction using pdf-lib.
 *
 * Extracts page count and page dimensions from raw PDF bytes WITHOUT
 * rendering anything. This is used to display page count in the toolbar
 * and to reserve page aspect ratios before the browser's native viewer loads.
 */

import { PDFDocument } from 'pdf-lib';

export interface PdfMetadata {
  pageCount: number;
  title: string | null;
  author: string | null;
  pages: Array<{ width: number; height: number }>;
}

/** Extract metadata from PDF bytes. Returns null on failure. */
export async function getPdfMetadata(bytes: ArrayBuffer): Promise<PdfMetadata | null> {
  try {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pageCount = pdf.getPageCount();
    const title = pdf.getTitle() || null;
    const author = pdf.getAuthor() || null;

    const pages = [];
    for (let i = 0; i < Math.min(pageCount, 200); i++) { // Cap at 200 pages for perf
      const page = pdf.getPage(i);
      const { width, height } = page.getSize();
      pages.push({ width, height });
    }

    return { pageCount, title, author, pages };
  } catch {
    return null;
  }
}

/** Validate that ArrayBuffer starts with %PDF- magic bytes. */
export function isValidPdf(bytes: ArrayBuffer): boolean {
  if (bytes.byteLength < 5) return false;
  const header = new Uint8Array(bytes.slice(0, 5));
  return (
    header[0] === 0x25 && // %
    header[1] === 0x50 && // P
    header[2] === 0x44 && // D
    header[3] === 0x46 && // F
    header[4] === 0x2d    // -
  );
}
