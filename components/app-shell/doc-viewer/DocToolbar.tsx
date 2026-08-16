'use client';

interface DocToolbarProps {
  isPdf: boolean;
  name: string;
  status: 'loading' | 'ready' | 'error';
  pages: number;
  zoom: number;
  downloadHref: string;
  annotating: boolean;
  canDownloadAnnotated: boolean;
  annotatedExporting: boolean;
  onToggleAnnotate: () => void;
  onDownloadAnnotated: () => void;
  onZoomBy: (dir: 1 | -1) => void;
  onFit: () => void;
  onClose: () => void;
}

export default function DocToolbar({
  isPdf,
  name,
  status,
  pages,
  zoom,
  downloadHref,
  annotating,
  canDownloadAnnotated,
  annotatedExporting,
  onToggleAnnotate,
  onDownloadAnnotated,
  onZoomBy,
  onFit,
  onClose,
}: DocToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-neutral-900 border-b border-neutral-800 shrink-0 flex-wrap wco-aware">
      <i className={`${isPdf ? 'fas fa-file-pdf text-red-400' : 'fas fa-file-word text-[#3b82f6]'} flex-shrink-0`}></i>
      <span className="text-neutral-300 text-[0.8rem] font-semibold truncate max-w-[30vw]">{name}</span>
      {status === 'ready' && pages > 0 && (
        <span className="text-neutral-500 text-[0.72rem] hidden sm:block">
          {pages} page{pages === 1 ? '' : 's'}
        </span>
      )}

      <div className="flex items-center gap-1 ml-auto">
        <button
          className="pdf-btn"
          onClick={onToggleAnnotate}
          title={annotating ? 'Stop annotating' : 'Annotate — pen, highlighter, shapes & text drawn straight on the page'}
          disabled={status !== 'ready'}
          style={
            annotating
              ? { background: 'rgba(139,92,246,0.35)', border: '1px solid rgba(139,92,246,0.9)', color: '#fff' }
              : { background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.45)' }
          }
        >
          {annotating ? <i className="fas fa-pen-nib mr-1"></i> : <i className="fas fa-pen mr-1"></i>}
          Annotate
        </button>
        <button className="pdf-btn" onClick={() => onZoomBy(-1)} title="Zoom out (Ctrl + -)" disabled={status !== 'ready'}><i className="fas fa-minus"></i></button>
        <span className="text-neutral-400 text-[0.72rem] font-mono min-w-[38px] text-center select-none">{Math.round(zoom * 100)}%</span>
        <button className="pdf-btn" onClick={() => onZoomBy(1)} title="Zoom in (Ctrl + +)" disabled={status !== 'ready'}><i className="fas fa-plus"></i></button>
        <button className="pdf-btn" onClick={onFit} title="Fit to screen (Ctrl + 0)" disabled={status !== 'ready'}><i className="fas fa-expand-arrows-alt"></i></button>
        <a className="pdf-btn no-underline" href={downloadHref} download={name} title="Download" style={{ textDecoration: 'none' }}><i className="fas fa-download"></i></a>
        {isPdf && (
          <button
            className="pdf-btn"
            onClick={onDownloadAnnotated}
            title="Download PDF with your drawings baked in"
            disabled={!canDownloadAnnotated || annotatedExporting}
            style={canDownloadAnnotated && !annotatedExporting ? { background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.45)' } : undefined}
          >
            {annotatedExporting ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-file-pdf"></i>}
          </button>
        )}
        <button className="pdf-btn" onClick={onClose} title="Close" style={{ background: '#ef4444', color: 'white', borderRadius: '7px' }}><i className="fas fa-times"></i></button>
      </div>
    </div>
  );
}
