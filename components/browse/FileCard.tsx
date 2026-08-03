'use client';

import { getMimeFromExt, getFileIconByType } from '@/lib/utils';
import FileActionsMenu from '@/components/FileActionsMenu';

interface FileCardProps {
  item: any;
  onOpen: (item: any) => void;
  filePerms: Record<string, boolean>;
  onMove: (path: string, name: string, mode: 'move' | 'copy') => void;
  onCopy: (path: string, name: string, mode: 'move' | 'copy') => void;
  onRename: (path: string, name: string) => void;
  onDelete: (path: string, name: string) => void;
  actionLoading: string;
}

export default function FileCard({ item, onOpen, filePerms, onMove, onCopy, onRename, onDelete, actionLoading }: FileCardProps) {
  const name = item.path.split('/').pop() || '';
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const mime = getMimeFromExt(ext);
  const isFolder = item.type === 'tree';
  const hasActions = filePerms.move || filePerms.copy || filePerms.rename || filePerms.delete;

  return (
    <div className="bg-dark-bg2 border border-dark-border rounded-xl p-[12px_14px] transition-all hover:border-qsis hover:shadow-[0_0_12px_rgba(34,197,94,0.3)]">
      <div className="flex gap-2.5 items-center cursor-pointer" onClick={() => onOpen(item)}>
        <div className="text-[1.5rem] flex-shrink-0">{getFileIconByType(mime)}</div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[0.85rem] whitespace-nowrap overflow-hidden text-ellipsis">{name}</div>
          <div className="text-[0.7rem] text-dark-text2 whitespace-nowrap overflow-hidden text-ellipsis">{item.path}</div>
        </div>
      </div>
      <div className="flex gap-1 mt-2 pt-2 border-t border-dark-border justify-end">
        <button className="bg-transparent border border-dark-border text-dark-text2 cursor-pointer w-[30px] h-[30px] rounded-md inline-flex items-center justify-center text-[0.8rem] hover:bg-dark-bg3 hover:text-qsis hover:border-qsis transition-all" title="View" onClick={(e) => { e.stopPropagation(); onOpen(item); }}>
          <i className="fas fa-eye"></i>
        </button>
        {hasActions && (
          <FileActionsMenu
            filePath={item.path}
            fileName={name}
            isFolder={isFolder}
            onMove={() => onMove(item.path, name, 'move')}
            onCopy={() => onCopy(item.path, name, 'copy')}
            onRename={() => onRename(item.path, name)}
            onDelete={() => onDelete(item.path, name)}
          />
        )}
      </div>
    </div>
  );
}
