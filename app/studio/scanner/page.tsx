'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';

const ScannerTool = dynamic(() => import('@/components/studio/ScannerTool'), { ssr: false });

export default function ScannerPage() {
  return (
    <div className="min-h-[60vh]">
      <Link href="/studio" className="inline-flex items-center gap-2 text-[0.78rem] text-dark-text2 hover:text-qsis cursor-pointer bg-transparent border-none transition-colors no-underline mb-4">
        <i className="fas fa-arrow-left text-xs"></i> Back to Studio
      </Link>
      <div className="rounded-2xl border border-dark-border bg-dark-bg2/60 overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-dark-border bg-dark-bg2">
          <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center flex-shrink-0">
            <i className="fas fa-camera-retro text-accent text-lg"></i>
          </div>
          <div>
            <h2 className="text-[0.9rem] font-bold text-dark-text">Document Scanner</h2>
            <p className="text-[0.68rem] text-dark-text2">Capture, crop, enhance, merge to PDF &amp; OCR — save straight to your device.</p>
          </div>
        </div>
        <div className="p-5">
          <ScannerTool />
        </div>
      </div>
    </div>
  );
}
