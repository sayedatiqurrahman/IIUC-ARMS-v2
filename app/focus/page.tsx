'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function FocusPage() {
  const [loading, setLoading] = useState(true);

  return (
    <>
      {/* Full-viewport iframe — same native look as AppChrome */}
      <div className="fixed top-[60px] left-0 right-0 bottom-[60px] md:bottom-0 z-[50]">
        <iframe
          src="/api/studio-apps/serve/todos/index.html"
          title="Focus"
          className="w-full h-full border-0"
          allow="clipboard-write; fullscreen; document-picture-in-picture; popups"
          onLoad={() => setLoading(false)}
        />
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-dark-bg p-6 text-center z-10">
            <div className="w-10 h-10 border-3 border-dark-border border-t-qsis rounded-full animate-spin mb-4" />
            <p className="text-[0.78rem] text-dark-text2">Loading Focus…</p>
          </div>
        )}
      </div>

      {/* Floating back button */}
      <Link
        href="/"
        className="fixed top-[72px] left-3 z-[60] flex items-center gap-1.5 rounded-xl border border-dark-border bg-dark-bg2/90 backdrop-blur-sm px-3 py-2 text-[0.72rem] font-medium text-dark-text2 transition hover:border-qsis hover:text-qsis no-underline shadow-lg"
      >
        <span className="material-symbols-outlined align-middle text-[0.95rem]">arrow_back</span>
        <span className="hidden sm:inline">Home</span>
      </Link>
    </>
  );
}
