'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import SubFolderView from './SubFolderView';

interface RelatedFolderViewProps {
  relFolder: string;
  label: string;
  departmentId?: string | null;
  onExit: () => void;
  onOpenFile: (item: any) => void;
  filePerms: Record<string, boolean>;
  onMove: (path: string, name: string, mode: 'move' | 'copy') => void;
  onCopy: (path: string, name: string, mode: 'move' | 'copy') => void;
  onRename: (path: string, name: string) => void;
  onDelete: (path: string, name: string) => void;
  onShare?: (path: string, name: string, isFolder: boolean) => void;
  actionLoading: string;
  canCreateFolder?: boolean;
  onCreateFolderAt?: (relPath: string) => void;
  canDeleteFolder?: boolean;
  onDeleteFolder?: (target: { path: string; name: string }) => void;
}

export default function RelatedFolderView({
  relFolder,
  label,
  departmentId,
  onExit,
  onOpenFile,
  filePerms,
  onMove,
  onCopy,
  onRename,
  onDelete,
  onShare,
  actionLoading,
  canCreateFolder,
  onCreateFolderAt,
  canDeleteFolder,
  onDeleteFolder,
}: RelatedFolderViewProps) {
  const [relPath, setRelPath] = useState('');
  const treeLen = useAppStore(s => s.tree.length);

  useEffect(() => {
    setRelPath('');
  }, [relFolder, departmentId]);

  const contents = useMemo(
    () => useAppStore.getState().getRelatedFolderContents(relFolder, departmentId || null, relPath),
    [relFolder, departmentId, relPath, treeLen],
  );

  const subPathSegments = useMemo(
    () => (relPath ? relPath.split('/') : []),
    [relPath],
  );

  const openFolder = (name: string) => {
    setRelPath(prev => (prev ? `${prev}/${name}` : name));
  };

  const goBack = () => {
    if (relPath) {
      setRelPath(prev => prev.split('/').slice(0, -1).join('/'));
      return;
    }
    onExit();
  };

  return (
    <section>
      <div className="flex items-center gap-2 mb-3 text-[0.9rem]">
        <i className="fas fa-folder-open text-qsis"></i>
        <span className="flex items-center flex-wrap gap-1">
          <span className="font-semibold">{label}</span>
          {subPathSegments.map((seg, i) => (
            <span key={`${seg}-${i}`} className="flex items-center gap-1">
              <span className="text-dark-text3">/</span>
              <span className={i === subPathSegments.length - 1 ? 'text-qsis' : 'text-dark-text2'}>{seg}</span>
            </span>
          ))}
        </span>
      </div>
      <SubFolderView
        subfolders={contents.subfolders}
        files={contents.files}
        subPathSegments={subPathSegments}
        onOpenFolder={openFolder}
        onGoBack={goBack}
        onOpenFile={onOpenFile}
        filePerms={filePerms}
        onMove={onMove}
        onCopy={onCopy}
        onRename={onRename}
        onDelete={onDelete}
        onShare={onShare}
        actionLoading={actionLoading}
        canCreateFolder={canCreateFolder}
        onCreateFolder={canCreateFolder && onCreateFolderAt ? () => onCreateFolderAt(relPath) : undefined}
        canDeleteFolder={canDeleteFolder}
        onDeleteFolder={onDeleteFolder}
      />
    </section>
  );
}