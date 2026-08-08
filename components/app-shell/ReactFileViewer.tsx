'use client';

import { useCallback, useRef, useState } from 'react';
import FileViewer from 'react-file-viewer';
import { toggleFullscreen } from '@/lib/fullscreen';

export default function ReactFileViewer({
  fileType,
  url,
  name,
  onClose,
  onError,
}: {
  fileType: string;
  url: string;
  name: string;
  onClose: () => void;
  onError?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  const handleError = useCallback(() => {
    setFailed(true);
    onError?.();
  }, [onError]);

  return (
    <div ref={rootRef} className="rfv-container">
      <div className="rfv-toolbar">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <i className="fas fa-file text-qsis flex-shrink-0"></i>
          <span className="text-[0.85rem] font-semibold truncate">{name}</span>
        </div>
        <a className="pdf-btn rfv-link" href={url} target="_blank" rel="noreferrer" download={name} title="Download">
          <i className="fas fa-download"></i>
        </a>
        <button className="pdf-btn" onClick={() => toggleFullscreen(rootRef.current)} title="Fullscreen">
          <i className="fas fa-expand"></i>
        </button>
        <button
          className="pdf-btn"
          onClick={onClose}
          title="Close"
          style={{ background: '#ef4444', color: 'white', borderRadius: '7px' }}
        >
          <i className="fas fa-times"></i>
        </button>
      </div>
      <div className="rfv-body">
        {failed ? (
          <div className="rfv-error">
            <i className="fas fa-file-circle-exclamation"></i>
            <p>Could not render this file inline.</p>
            <div className="rfv-error-actions">
              <a className="rfv-btn" href={url} target="_blank" rel="noreferrer" download={name}>
                <i className="fas fa-download"></i> Download
              </a>
              <button className="rfv-btn" onClick={() => setFailed(false)}>
                <i className="fas fa-rotate-right"></i> Retry
              </button>
            </div>
          </div>
        ) : (
          <FileViewer key={`${fileType}-${url}`} fileType={fileType} filePath={url} onError={handleError} />
        )}
      </div>
    </div>
  );
}
