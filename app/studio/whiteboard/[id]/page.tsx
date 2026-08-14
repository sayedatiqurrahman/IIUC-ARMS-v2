'use client';

import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';

// The full drawing editor is lazy-loaded so the several-MB canvas only ships
// when a board is actually opened.
const Whiteboard = dynamic(() => import('@/components/studio/Whiteboard'), {
  ssr: false,
  loading: () => (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-dark-text2">
      <div className="w-8 h-8 border-2 border-qsis border-t-transparent rounded-full animate-spin mb-3"></div>
      <p className="text-sm">Loading board…</p>
    </div>
  ),
});

export default function WhiteboardPage() {
  const params = useParams<{ id: string }>();
  return <Whiteboard draftId={params.id} />;
}
