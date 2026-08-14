'use client';

import type { RefObject } from 'react';
import StatusOverlay from './StatusOverlay';

interface DocxStageProps {
  scrollRef: RefObject<HTMLDivElement | null>;
  bodyRef: RefObject<HTMLDivElement | null>;
  status: 'loading' | 'ready' | 'error';
  error: string;
  zoom: number;
  openHref: string;
}

export default function DocxStage({ scrollRef, bodyRef, status, error, zoom, openHref }: DocxStageProps) {
  return (
    <div ref={scrollRef} className="flex-1 overflow-auto min-h-0" style={{ background: '#0a0f1e' }}>
      <StatusOverlay status={status} error={error} variant="docx" openHref={openHref} />
      <div ref={bodyRef} className="px-3 py-4 flex flex-col" style={{ zoom, alignItems: 'flex-start' }} />
    </div>
  );
}
