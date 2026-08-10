'use client';

import { useState } from 'react';

// doc/xls/xlsx/ppt/pptx preview via the Microsoft Office online viewer. The
// file is served through the inline proxy so Office can fetch the bytes.
// Word (.docx) uses WordViewer instead — this is only a fallback for formats
// docx-preview cannot render.
export default function OfficeViewer({ item, onClose }: { item: any; onClose: () => void }) {
  const src = `${window.location.origin}/api/github/raw?url=${encodeURIComponent(item.rawUrl)}`;
  const embedUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(src)}`;
  const [loaded, setLoaded] = useState(false);

  const typeLabel = item.mimeType === 'doc' ? 'Word' : item.mimeType === 'sheet' ? 'Excel' : 'PowerPoint';
  const typeIcon = item.mimeType === 'doc' ? 'fa-file-word' : item.mimeType === 'sheet' ? 'fa-file-excel' : 'fa-file-powerpoint';
  const typeColor = item.mimeType === 'doc' ? '#3b82f6' : item.mimeType === 'sheet' ? '#22c55e' : '#f97316';

  return (
    <div className="fixed inset-0 z-[1500] bg-black flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 bg-neutral-900 border-b border-neutral-800 shrink-0">
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
      <div className="flex-1 overflow-hidden relative bg-[#0a0f1e]">
        {!loaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-dark-text2 z-10">
            <div className="w-8 h-8 border-2 border-qsis border-t-transparent rounded-full animate-spin mb-3"></div>
            <p className="text-sm mb-2">Loading {typeLabel} document…</p>
            <p className="text-[0.75rem] text-dark-text3 mb-4">Preview may take a moment.</p>
            <a href={src} download={item.name} className="px-4 py-2 rounded-xl bg-qsis text-white text-sm font-semibold no-underline">
              <i className="fas fa-download mr-1"></i>Download file
            </a>
          </div>
        )}
        <iframe
          src={embedUrl}
          title={item.name}
          className="w-full border-none"
          onLoad={() => setLoaded(true)}
          style={{ minHeight: 'calc(100vh - 50px)' }}
        />
      </div>
    </div>
  );
}
