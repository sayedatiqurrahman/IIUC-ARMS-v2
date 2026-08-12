'use client';

import dynamic from 'next/dynamic';

const FileCompressor = dynamic(() => import('@/components/studio/FileCompressor'), { ssr: false });
const ScannerTool = dynamic(() => import('@/components/studio/ScannerTool'), { ssr: false });

export default function StudioPage() {
  return (
    <div className="min-h-[60vh]">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-dark-text">
          <i className="fas fa-tools text-qsis mr-2"></i>Studio
        </h1>
        <p className="text-[0.78rem] text-dark-text2 mt-1 max-w-xl">
          Free tools for students and users. Use them on their own — no login, no file upload.
          Everything runs in your browser and stays on your device.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <section className="rounded-2xl border border-dark-border bg-dark-bg2/60 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-dark-border bg-dark-bg2">
            <div className="w-10 h-10 rounded-xl bg-qsis/15 flex items-center justify-center flex-shrink-0">
              <i className="fas fa-file-compress text-qsis text-lg"></i>
            </div>
            <div>
              <h2 className="text-[0.9rem] font-bold text-dark-text">File Compressor</h2>
              <p className="text-[0.68rem] text-dark-text2">Shrink images, scanned PDFs, DOCX, PPTX &amp; EPUB — download the result.</p>
            </div>
          </div>
          <div className="p-5">
            <FileCompressor />
          </div>
        </section>

        <section className="rounded-2xl border border-dark-border bg-dark-bg2/60 overflow-hidden">
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
        </section>
      </div>
    </div>
  );
}
