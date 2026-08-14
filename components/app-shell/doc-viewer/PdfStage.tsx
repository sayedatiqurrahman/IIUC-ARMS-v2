'use client';

import type { MutableRefObject, PointerEvent as RPointerEvent, RefObject } from 'react';
import PdfPage from './PdfPage';
import StatusOverlay from './StatusOverlay';

interface PdfStageProps {
  stageRef: RefObject<HTMLDivElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  overlayRef: RefObject<HTMLCanvasElement | null>;
  canvasRefs: MutableRefObject<(HTMLCanvasElement | null)[]>;
  annCanvasRefs: MutableRefObject<(HTMLCanvasElement | null)[]>;
  textInputRef: RefObject<HTMLInputElement | null>;
  status: 'loading' | 'ready' | 'error';
  error: string;
  pages: number;
  grabbing: boolean;
  centerV: boolean;
  annotating: boolean;
  textDraft: { page: number; x: number; y: number } | null;
  draftText: string;
  openHref: string;
  stageCursor: string | undefined;
  onStagePointerDown: (e: RPointerEvent<HTMLDivElement>) => void;
  onStagePointerMove: (e: RPointerEvent<HTMLDivElement>) => void;
  onStagePointerUp: () => void;
  onPagePointerDown: (index: number, e: RPointerEvent<HTMLDivElement>) => void;
  onPagePointerMove: (index: number, e: RPointerEvent<HTMLDivElement>) => void;
  onPagePointerUp: (index: number, e: RPointerEvent<HTMLDivElement>) => void;
  onPagePointerCancel: () => void;
  onTextChange: (value: string) => void;
  onTextCommit: () => void;
  onTextCancel: () => void;
}

export default function PdfStage({
  stageRef,
  scrollRef,
  overlayRef,
  canvasRefs,
  annCanvasRefs,
  textInputRef,
  status,
  error,
  pages,
  grabbing,
  centerV,
  annotating,
  textDraft,
  draftText,
  openHref,
  stageCursor,
  onStagePointerDown,
  onStagePointerMove,
  onStagePointerUp,
  onPagePointerDown,
  onPagePointerMove,
  onPagePointerUp,
  onPagePointerCancel,
  onTextChange,
  onTextCommit,
  onTextCancel,
}: PdfStageProps) {
  return (
    <div ref={stageRef} className="flex-1 relative min-h-0 bg-[#0a0f1e]" style={{ cursor: stageCursor }}>
      <div
        ref={scrollRef}
        className="absolute inset-0 overflow-auto"
        onPointerDown={onStagePointerDown}
        onPointerMove={onStagePointerMove}
        onPointerUp={onStagePointerUp}
        onPointerCancel={onStagePointerUp}
        style={{ touchAction: 'pan-x pan-y' }}
      >
        <div className="p-3 flex flex-col gap-3 min-h-full" style={{ justifyContent: centerV ? 'center' : 'flex-start' }}>
          {Array.from({ length: pages }).map((_, i) => (
            <PdfPage
              key={i}
              index={i}
              annotating={annotating}
              textDraft={textDraft}
              draftText={draftText}
              textInputRef={textInputRef}
              canvasRefs={canvasRefs}
              annCanvasRefs={annCanvasRefs}
              onPointerDown={onPagePointerDown}
              onPointerMove={onPagePointerMove}
              onPointerUp={onPagePointerUp}
              onPointerCancel={onPagePointerCancel}
              onTextChange={onTextChange}
              onTextCommit={onTextCommit}
              onTextCancel={onTextCancel}
            />
          ))}
        </div>
      </div>

      <canvas ref={overlayRef} className="absolute inset-0 pointer-events-none" />

      <StatusOverlay status={status} error={error} variant="pdf" openHref={openHref} absolute />
    </div>
  );
}
