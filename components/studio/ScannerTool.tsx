'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { downloadFile } from '@/lib/download-file';
import { showToast } from '@/lib/utils';
import { warmupScannerEngine } from '@/components/scanner/DocumentScanner';
import { FILTER_LABELS, FILTER_HINTS, type FilterMode } from '@/lib/image-enhance';

const DocumentScanner = dynamic(() => import('@/components/scanner/DocumentScanner'), { ssr: false });

// Standalone document scanner tool: reuses the same camera scanner that the
// upload flow uses, but instead of attaching the result to an upload it just
// saves it straight to the device. No login, no upload — files never leave
// the browser.
export default function ScannerTool() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<FilterMode>('enhance');

  // Preload the scanner engine while the user reads the intro, so clicking
  // "Open Scanner" doesn't stall on the "Preparing Scanner Engine" step.
  useEffect(() => {
    warmupScannerEngine();
  }, []);

  if (!open) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
        <div className="w-16 h-16 rounded-2xl bg-qsis/15 flex items-center justify-center">
          <i className="fas fa-camera-retro text-qsis text-2xl"></i>
        </div>
        <div>
          <p className="text-[0.85rem] font-semibold text-dark-text">Scan documents with your camera</p>
          <p className="text-[0.7rem] text-dark-text2 mt-1 max-w-sm">Crop, straighten, filter (B&amp;W / enhance / balance), merge pages to PDF and run OCR — all on-device, then save the file to your device.</p>
        </div>
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[0.72rem] font-medium text-dark-text2">Scan filter</span>
            <span className="text-[0.6rem] text-dark-text3">{FILTER_HINTS[filter]}</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
            {(Object.keys(FILTER_LABELS) as FilterMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setFilter(m)}
                className={`px-2 py-2 rounded-lg text-[0.72rem] font-semibold border cursor-pointer transition-all ${
                  filter === m
                    ? 'bg-qsis/15 text-qsis border-qsis/40'
                    : 'bg-dark-bg3 text-dark-text2 border-dark-border hover:text-dark-text'
                }`}
              >
                {FILTER_LABELS[m]}
              </button>
            ))}
          </div>
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
      filterMode={filter}
      fileBaseName="ARMS_DOC_SCANNER"
      onResult={(file) => {
        downloadFile(file);
        showToast(`Saved ${file.name}`, 'success');
      }}
      onDone={() => setOpen(false)}
      onCancel={() => setOpen(false)}
    />
  );
}
