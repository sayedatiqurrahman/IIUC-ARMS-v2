'use client';

interface PdfViewerProps {
  url: string;
  name: string;
  filePath?: string;
  onClose: () => void;
}

// Plain browser-native iframe PDF viewer (scrolling). The file is served through
// the inline proxy so GitHub's attachment header doesn't trigger a download — the
// browser renders the PDF inline at full quality. No custom design: just a close
// button and the browser's own PDF toolbar (scroll/zoom/page).
export default function PdfViewer({ url, name, onClose }: PdfViewerProps) {
  const src = `${window.location.origin}/api/github/raw?url=${encodeURIComponent(url)}`;

  return (
    <div className="fixed inset-0 z-[1500] bg-black flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 bg-neutral-900 border-b border-neutral-800 shrink-0">
        <span className="text-neutral-300 text-[0.8rem] font-semibold truncate flex-1">{name}</span>
        <button
          className="pdf-btn"
          onClick={onClose}
          title="Close"
          style={{ background: '#ef4444', color: 'white', borderRadius: '7px' }}
        >
          <i className="fas fa-times"></i>
        </button>
      </div>
      <iframe src={src} title={name} className="flex-1 w-full border-none bg-white" style={{ overflow: 'auto' }} />
    </div>
  );
}
