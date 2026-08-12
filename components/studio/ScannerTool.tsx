'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { downloadFile } from '@/lib/download-file';
import { showToast } from '@/lib/utils';

const DocumentScanner = dynamic(() => import('@/components/scanner/DocumentScanner'), { ssr: false });

// Standalone document scanner tool: reuses the same camera scanner that the
// upload flow uses, but instead of attaching the result to an upload it just
// saves it straight to the device. No login, no upload — files never leave
// the browser.
export default function ScannerTool() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
        <div className="w-16 h-16 rounded-2xl bg-qsis/15 flex items-center justify-center">
          <i className="fas fa-camera-retro text-qsis text-2xl"></i>
        </div>
        <div>
          <p className="text-[0.85rem] font-semibold text-dark-text">Scan documents with your camera</p>
          <p className="text-[0.7rem] text-dark-text2 mt-1 max-w-sm">Crop, straighten, filter (B&amp;W / enhance), merge pages to PDF and run OCR — all on-device, then save the file to your device.</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="px-5 py-2.5 rounded-xl bg-qsis text-white text-[0.8rem] font-semibold cursor-pointer hover:opacity-90 transition-opacity border-none inline-flex items-center gap-2"
        >
          <i className="fas fa-play text-xs"></i> Open Scanner
        </button>
        <p className="text-[0.62rem] text-dark-text3">Requires camera permission. Nothing is uploaded.</p>
      </div>
    );
  }

  return (
    <DocumentScanner
      onResult={(file) => {
        downloadFile(file);
        showToast(`Saved ${file.name}`, 'success');
      }}
      onDone={() => setOpen(false)}
      onCancel={() => setOpen(false)}
    />
  );
}
