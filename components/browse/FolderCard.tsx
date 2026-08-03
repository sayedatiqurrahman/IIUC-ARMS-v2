'use client';

interface FolderCardProps {
  folder: {
    path: string;
    label: string;
    type: string;
    id: string;
    count: number;
  };
  onClick: () => void;
}

export default function FolderCard({ folder, onClick }: FolderCardProps) {
  return (
    <div
      className="flex items-center gap-3 p-[12px_16px] bg-dark-bg2 border border-dark-border rounded-xl cursor-pointer hover:border-qsis hover:shadow-[0_0_12px_rgba(34,197,94,0.2)] hover:translate-x-1 transition-all"
      onClick={onClick}
    >
      <div className="w-9 h-9 rounded-lg bg-qsis/10 flex items-center justify-center flex-shrink-0">
        <i className={`fas ${folder.type === 'semester' ? 'fa-book' : folder.type === 'category' ? 'fa-folder' : 'fa-book-open'} text-qsis text-[0.85rem]`}></i>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[0.85rem] font-semibold">{folder.label}</div>
        <div className="text-[0.65rem] text-dark-text2 font-mono truncate">{folder.path}</div>
      </div>
      <span className="text-[0.7rem] text-dark-text2 flex-shrink-0">{folder.count} file{folder.count !== 1 ? 's' : ''}</span>
      <i className="fas fa-chevron-right text-dark-text2 text-[0.65rem] flex-shrink-0"></i>
    </div>
  );
}
