'use client';

import { ANNO_COLORS, type AnnoType } from '@/lib/annotations';

interface AnnoToolbarProps {
  annoTool: AnnoType;
  annoColor: string;
  canUndo: boolean;
  onSetAnnoTool: (t: AnnoType) => void;
  onSetAnnoColor: (c: string) => void;
  onUndo: () => void;
  onClear: () => void;
}

export default function AnnoToolbar({
  annoTool,
  annoColor,
  canUndo,
  onSetAnnoTool,
  onSetAnnoColor,
  onUndo,
  onClear,
}: AnnoToolbarProps) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 border-b border-neutral-800 shrink-0 flex-wrap wco-aware">
      <button
        className="pdf-btn"
        onClick={() => onSetAnnoTool('pen')}
        title="Pen"
        style={annoTool === 'pen' ? { background: 'rgba(251,146,60,0.25)', border: '1px solid rgba(251,146,60,0.6)' } : undefined}
      >
        <i className="fas fa-pen"></i>
      </button>
      <button
        className="pdf-btn"
        onClick={() => onSetAnnoTool('highlight')}
        title="Highlighter"
        style={annoTool === 'highlight' ? { background: 'rgba(251,146,60,0.25)', border: '1px solid rgba(251,146,60,0.6)' } : undefined}
      >
        <i className="fas fa-highlighter"></i>
      </button>
      <button
        className="pdf-btn"
        onClick={() => onSetAnnoTool('text')}
        title="Text"
        style={annoTool === 'text' ? { background: 'rgba(251,146,60,0.25)', border: '1px solid rgba(251,146,60,0.6)' } : undefined}
      >
        <i className="fas fa-font"></i>
      </button>
      <span className="w-px h-5 bg-neutral-700 mx-1"></span>
      {ANNO_COLORS.map((c) => (
        <button
          key={c}
          className="h-6 w-6 rounded-full border-2"
          style={{ background: c, borderColor: annoColor === c ? '#fff' : 'transparent' }}
          onClick={() => onSetAnnoColor(c)}
          title={c}
        />
      ))}
      <span className="w-px h-5 bg-neutral-700 mx-1"></span>
      <button className="pdf-btn" onClick={onUndo} title="Undo last annotation" disabled={!canUndo}><i className="fas fa-undo"></i></button>
      <button className="pdf-btn" onClick={onClear} title="Clear all annotations" disabled={!canUndo}><i className="fas fa-trash-alt"></i></button>
      <span className="ml-auto text-neutral-500 text-[0.7rem] hidden sm:block">
        {annoTool === 'text' ? 'Click a page to add text' : 'Click & drag on a page to draw'}
      </span>
    </div>
  );
}
