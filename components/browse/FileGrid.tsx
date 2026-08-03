'use client';

import FileCard from './FileCard';

interface FileGridProps {
  items: any[];
  onOpen: (item: any) => void;
  filePerms: Record<string, boolean>;
  onMove: (path: string, name: string, mode: 'move' | 'copy') => void;
  onCopy: (path: string, name: string, mode: 'move' | 'copy') => void;
  onRename: (path: string, name: string) => void;
  onDelete: (path: string, name: string) => void;
  actionLoading: string;
}

export default function FileGrid({ items, onOpen, filePerms, onMove, onCopy, onRename, onDelete, actionLoading }: FileGridProps) {
  if (!items || items.length === 0) {
    return <div className="text-center py-10 text-dark-text2"><i className="fas fa-folder-open"></i> No files here yet.</div>;
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((item: any) => (
        <FileCard
          key={item.path}
          item={item}
          onOpen={onOpen}
          filePerms={filePerms}
          onMove={onMove}
          onCopy={onCopy}
          onRename={onRename}
          onDelete={onDelete}
          actionLoading={actionLoading}
        />
      ))}
    </div>
  );
}
