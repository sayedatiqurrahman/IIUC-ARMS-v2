'use client';

import dynamic from 'next/dynamic';

// Full Excalidraw whiteboard. Lazy-loaded so the several-MB editor only ships
// when this Studio app is actually opened.
const ExcalidrawBoard = dynamic(() => import('@/components/studio/ExcalidrawBoard'), {
  ssr: false,
  loading: () => (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-dark-text2">
      <div className="w-8 h-8 border-2 border-qsis border-t-transparent rounded-full animate-spin mb-3"></div>
      <p className="text-sm">Loading Excalidraw whiteboard…</p>
    </div>
  ),
});

export default function ExcalidrawPage() {
  return <ExcalidrawBoard />;
}
