'use client';

import FileGrid from './FileGrid';
import FileActionsMenu from '@/components/FileActionsMenu';

interface SubFolderViewProps {
  subfolders: { name: string; fileCount: number; count: number; path: string; githubPath: string }[];
  files: any[];
  subPathSegments: string[];
  onOpenFolder: (name: string) => void;
  onGoBack: () => void;
  onOpenFile: (item: any) => void;
  filePerms: Record<string, boolean>;
  onMove: (path: string, name: string, mode: 'move' | 'copy') => void;
  onCopy: (path: string, name: string, mode: 'move' | 'copy') => void;
  onRename: (path: string, name: string) => void;
  onDelete: (path: string, name: string) => void;
  onShare?: (path: string, name: string, isFolder: boolean) => void;
  actionLoading: string;
  canCreateFolder?: boolean;
  onCreateFolder?: () => void;
  canDeleteFolder?: boolean;
  onDeleteFolder?: (target: { path: string; name: string }) => void;
}

export default function SubFolderView({
  subfolders,
  files,
  subPathSegments,
  onOpenFolder,
  onGoBack,
  onOpenFile,
  filePerms,
  onMove,
  onCopy,
  onRename,
  onDelete,
  onShare,
  actionLoading,
  canCreateFolder,
  onCreateFolder,
  canDeleteFolder,
  onDeleteFolder,
}: SubFolderViewProps) {
  return (
    <section className="mb-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-[1.05rem] font-semibold flex items-center gap-2">
          <i className="fas fa-folder-open"></i>
          <span className="flex items-center flex-wrap gap-1 text-[0.9rem]">
            <i className="fas fa-folder text-dark-text3 text-[0.8rem]"></i>
            <span className="text-dark-text2">/</span>
            {subPathSegments.length === 0 ? (
              <span className="text-dark-text">Files</span>
            ) : (
              subPathSegments.map((seg, i) => (
                <span key={`${seg}-${i}`} className="flex items-center gap-1">
                  <span className={`${i === subPathSegments.length - 1 ? 'text-qsis' : 'text-dark-text2'}`}>{seg}</span>
                  {i < subPathSegments.length - 1 && (
                    <span className="text-dark-text3">/</span>
                  )}
                </span>
              ))
            )}
          </span>
        </h3>
        <div className="flex items-center gap-2">
          {canCreateFolder && (
            <button className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-qsis/40 bg-qsis/10 text-qsis cursor-pointer text-[0.75rem] font-semibold hover:bg-qsis/20 transition" onClick={onCreateFolder}>
              <i className="fas fa-folder-plus"></i> New Folder
            </button>
          )}
          <button className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold" onClick={onGoBack}>
            <i className="fas fa-arrow-left"></i> Back
          </button>
        </div>
      </div>

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
                {onShare && (
                  <button
                    title="Share"
                    onClick={(e) => { e.stopPropagation(); onShare(sf.githubPath || sf.path, sf.name, true); }}
                    className="w-[30px] h-[30px] rounded-md inline-flex items-center justify-center text-[0.8rem] bg-transparent border border-dark-border text-dark-text2 hover:bg-dark-bg3 hover:text-green-400 hover:border-green-400/40 transition-all"
                  >
                    <i className="fas fa-share-nodes"></i>
                  </button>
                )}
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