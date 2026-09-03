'use client';

import FileGrid from './FileGrid';
import FileActionsMenu from '@/components/FileActionsMenu';

interface SubFolderViewProps {
  subfolders: { name: string; fileCount: number; count: number; path: string; githubPath: string }[];
  files: any[];
  onOpenFolder: (name: string) => void;
  onOpenFile: (item: any) => void;
  filePerms: Record<string, boolean>;
  onMove: (path: string, name: string, mode: 'move' | 'copy') => void;
  onCopy: (path: string, name: string, mode: 'move' | 'copy') => void;
  onRename: (path: string, name: string) => void;
  onDelete: (path: string, name: string) => void;
  onShare?: (path: string, name: string, isFolder: boolean) => void;
  actionLoading: string;
  canDeleteFolder?: boolean;
  onDeleteFolder?: (target: { path: string; name: string }) => void;
}

export default function SubFolderView({
  subfolders,
  files,
  onOpenFolder,
  onOpenFile,
  filePerms,
  onMove,
  onCopy,
  onRename,
  onDelete,
  onShare,
  actionLoading,
  canDeleteFolder,
  onDeleteFolder,
}: SubFolderViewProps) {
  return (
    <section className="mb-5">
      {/* Navigation / actions for this folder live in the shared browse header */}
      {subfolders.length === 0 && files.length === 0 && (
        <div className="text-center py-8 text-dark-text2">
          <i className="fas fa-folder-open text-3xl mb-3 block opacity-40"></i>
          <p>This folder is empty. Upload files or create a new folder here.</p>
        </div>
      )}

      {subfolders.length > 0 && (
        <div className="flex flex-col gap-2 mb-3">
          {subfolders.map(sf => (
            <div
              key={sf.name}
              className="flex items-center gap-3 p-[12px_16px] bg-dark-bg2 border border-dark-border rounded-xl cursor-pointer hover:border-qsis hover:shadow-[0_0_12px_rgba(34,197,94,0.2)] hover:translate-x-1 transition-all"
              onClick={() => onOpenFolder(sf.name)}
            >
              <div className="w-9 h-9 rounded-lg bg-qsis/10 flex items-center justify-center flex-shrink-0">
                <i className="fas fa-folder text-qsis text-[0.85rem]"></i>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[0.85rem] font-semibold">{sf.name}</div>
                <div className="text-[0.65rem] text-dark-text2 font-mono truncate">{sf.path}</div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <span className="text-[0.7rem] text-dark-text2 mr-1">{sf.fileCount} file{sf.fileCount !== 1 ? 's' : ''}</span>
                {canDeleteFolder && onDeleteFolder && (
                  <FileActionsMenu
                    filePath={sf.githubPath || sf.path}
                    fileName={sf.name}
                    isFolder
                    onMove={() => onMove(sf.githubPath || sf.path, sf.name, 'move')}
                    onCopy={() => onCopy(sf.githubPath || sf.path, sf.name, 'copy')}
                    onRename={() => onRename(sf.githubPath || sf.path, sf.name)}
                    onDelete={() => onDeleteFolder({ path: sf.githubPath || sf.path, name: sf.name })}
                    onShare={onShare ? () => onShare(sf.githubPath || sf.path, sf.name, true) : undefined}
                  />
                )}
              </div>
              <i className="fas fa-chevron-right text-dark-text2 text-[0.65rem] flex-shrink-0"></i>
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <FileGrid
          items={files}
          onOpen={onOpenFile}
          filePerms={filePerms}
          onMove={onMove}
          onCopy={onCopy}
          onRename={onRename}
          onDelete={onDelete}
          onShare={onShare}
          actionLoading={actionLoading}
        />
      )}
    </section>
  );
}