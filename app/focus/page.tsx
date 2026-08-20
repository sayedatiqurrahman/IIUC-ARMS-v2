'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function FocusPage() {
  const [loading, setLoading] = useState(true);

  return (
    <>
      {/* Full-viewport iframe — same native look as AppChrome */}
      <div className="fixed top-[59px] left-0 right-0 bottom-[60px] md:bottom-0 z-[50]">
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

      {/* Floating back button — positioned just below navbar */}
      <Link
        href="/"
        className="fixed top-[64px] left-3 z-[60] flex items-center gap-1 rounded-lg border border-dark-border bg-dark-bg2/95 backdrop-blur-sm px-2 py-1.5 text-[0.68rem] font-medium text-dark-text2 transition hover:border-qsis hover:text-qsis no-underline shadow-lg"
      >
        <span className="material-symbols-outlined text-[0.85rem]">arrow_back</span>
        <span className="hidden sm:inline">Home</span>
      </Link>
    </>
  );
}
