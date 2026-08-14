'use client';

import { useCallback } from 'react';
import type { MutableRefObject, PointerEvent as RPointerEvent, RefObject } from 'react';

interface PdfPageProps {
  index: number;
  annotating: boolean;
  textDraft: { page: number; x: number; y: number } | null;
  draftText: string;
  textInputRef: RefObject<HTMLInputElement | null>;
  canvasRefs: MutableRefObject<(HTMLCanvasElement | null)[]>;
  annCanvasRefs: MutableRefObject<(HTMLCanvasElement | null)[]>;
  onPointerDown: (index: number, e: RPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (index: number, e: RPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (index: number, e: RPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: () => void;
  onTextChange: (value: string) => void;
  onTextCommit: () => void;
  onTextCancel: () => void;
}

export default function PdfPage({
  index,
  annotating,
  textDraft,
  draftText,
  textInputRef,
  canvasRefs,
  annCanvasRefs,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onTextChange,
  onTextCommit,
  onTextCancel,
}: PdfPageProps) {
  const setCanvasRef = useCallback(
    (el: HTMLCanvasElement | null) => {
      canvasRefs.current[index] = el;
    },
    [canvasRefs, index]
  );

  const setAnnCanvasRef = useCallback(
    (el: HTMLCanvasElement | null) => {
      annCanvasRefs.current[index] = el;
    },
    [annCanvasRefs, index]
  );

  return (
    <div
      className={`relative mx-auto rounded shadow-lg bg-white ${annotating ? 'select-none' : ''}`}
      style={{ touchAction: annotating ? 'none' : 'auto' }}
      onPointerDown={(e) => onPointerDown(index, e)}
      onPointerMove={(e) => onPointerMove(index, e)}
      onPointerUp={(e) => onPointerUp(index, e)}
      onPointerCancel={onPointerCancel}
    >
      <canvas ref={setCanvasRef} className="block rounded" />
      <canvas ref={setAnnCanvasRef} className="absolute inset-0 rounded pointer-events-none" />
      {textDraft && textDraft.page === index + 1 && (
        <input
          ref={textInputRef}
          autoFocus
          value={draftText}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onTextCommit();
            else if (e.key === 'Escape') onTextCancel();
          }}
          onBlur={onTextCommit}
          className="absolute z-20 bg-white border-2 border-[#22c55e] text-black text-sm px-2 py-0.5 outline-none rounded"
          style={{ left: `${textDraft.x * 100}%`, top: `${textDraft.y * 100}%`, transform: 'translateY(-100%)' }}
          placeholder="Type…"
        />
      )}
    </div>
  );
}
