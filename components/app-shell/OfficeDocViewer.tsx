'use client';

// doc/xls/xlsx/csv/ppt/pptx can't be rendered natively in the browser, and the
// old Microsoft Office online embed shows a black screen on restricted
// networks. This viewer shows a clean, self-contained card instead — download
// the file and open it in the matching desktop app. Never an external iframe.
export default function OfficeDocViewer({ item, onClose }: { item: any; onClose: () => void }) {
  const src = `${window.location.origin}/api/github/raw?url=${encodeURIComponent(item.rawUrl)}`;
  const ext = (item.path || item.name || '').split('.').pop()?.toLowerCase() || '';

  const isWord = ext === 'doc';
  const isSheet = ['xls', 'xlsx', 'csv'].includes(ext);
  const isSlides = ext.startsWith('ppt');

  const typeLabel = isWord ? 'Word' : isSheet ? 'Excel' : isSlides ? 'PowerPoint' : 'Office';
  const typeIcon = isWord ? 'fa-file-word' : isSheet ? 'fa-file-excel' : isSlides ? 'fa-file-powerpoint' : 'fa-file';
  const typeColor = isWord ? '#3b82f6' : isSheet ? '#22c55e' : isSlides ? '#f97316' : '#94a3b8';
  const extension = ext ? ext.toUpperCase() : 'OFFICE';

  return (
    <div className="fixed inset-0 z-[1500] bg-[#0a0f1e] flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 bg-neutral-900 border-b border-neutral-800 shrink-0 wco-aware">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <i className={`fas ${typeIcon}`} style={{ color: typeColor, flexShrink: 0 }}></i>
          <span className="text-neutral-300 text-[0.8rem] font-semibold truncate">{item.name}</span>
        </div>
        <a className="pdf-btn no-underline" href={src} download={item.name} title="Download"><i className="fas fa-download"></i></a>
        <button
          className="pdf-btn"
          onClick={onClose}
          title="Close"
          style={{ background: '#ef4444', color: 'white', borderRadius: '7px' }}
        >
          <i className="fas fa-times"></i>
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center min-h-full">
          <div className="relative">
            <i className={`fas ${typeIcon}`} style={{ color: typeColor, fontSize: '3rem' }}></i>
            <span className="absolute -top-2 -right-4 text-[0.6rem] font-bold bg-neutral-800 text-neutral-300 px-1.5 py-0.5 rounded border border-neutral-700">
              {extension}
            </span>
          </div>
          <div>
            <p className="text-dark-text font-semibold text-[0.95rem]">This {typeLabel} file can't be previewed online.</p>
            <p className="text-dark-text2 text-[0.8rem] mt-1 max-w-sm">
              Download it and open it in {typeLabel}. The old online preview was replaced because it
              showed a black screen on some networks.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs sm:max-w-none sm:justify-center">
            <a className="px-5 py-2.5 rounded-xl bg-qsis text-white text-sm font-semibold no-underline inline-flex items-center justify-center gap-2" href={src} download={item.name}>
              <i className="fas fa-download"></i>Download file
            </a>
            <a className="px-5 py-2.5 rounded-xl bg-neutral-800 text-white text-sm font-semibold no-underline inline-flex items-center justify-center gap-2" href={src} target="_blank" rel="noreferrer">
              <i className="fas fa-external-link-alt"></i>Open
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
