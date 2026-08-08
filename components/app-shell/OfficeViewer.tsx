'use client';

// doc/docx/xls/xlsx/ppt/pptx preview via the Microsoft Office online viewer.
// The embed fills the full window height and Office's own toolbar provides the
// page/slide navigation. The file is served through the inline proxy so Office
// can fetch the bytes; nothing downloads unless the user clicks Download/Open.
export default function OfficeViewer({ item, onClose }: { item: any; onClose: () => void }) {
  const src = `${window.location.origin}/api/github/raw?url=${encodeURIComponent(item.rawUrl)}`;
  const embedUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(src)}`;

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
        <iframe src={embedUrl} title={item.name} className="w-full border-none" style={{ minHeight: 'calc(100vh - 50px)' }} />
      </div>
    </div>
  );
}
