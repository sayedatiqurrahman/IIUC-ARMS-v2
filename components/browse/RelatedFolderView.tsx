'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { config } from '@/lib/config';
import { getFacultyIdForDepartment, getDepartmentFolder } from '@/lib/departments';
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
  canUpload?: boolean;
  onUploadFiles?: (target: string, files: File[]) => void;
  uploading?: boolean;
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
  canUpload,
  onUploadFiles,
  uploading,
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

  // Real GitHub path of the folder currently being browsed (relative to the
  // upload root), so files can be uploaded straight into it. Content mapped
  // under different faculty prefixes (e.g. qsis/related-kitabs vs
  // shariah/related-kitabs) must resolve to its actual location, so look up
  // the current folder from the parent listing rather than guessing.
  const uploadTo = useMemo(() => {
    if (!relPath) return '';
    const segs = relPath.split('/');
    const last = segs[segs.length - 1].toLowerCase();
    const parent = segs.slice(0, -1).join('/');
    const kids = useAppStore.getState().getRelatedFolderContents(relFolder, departmentId || null, parent);
    const match = kids.subfolders.find(s => s.name.toLowerCase() === last);
    if (match) return match.githubPath;
    const facId = departmentId ? (getFacultyIdForDepartment(departmentId) || getDepartmentFolder(departmentId) || departmentId) : '';
    const root = relFolder === config.relatedKitabsFolder
      ? `${config.relatedKitabsParent}/${config.relatedKitabsFolder}`
      : `${facId}/${config.relatedSourcesFolder}`;
    return `${root}/${relPath}`;
  }, [relFolder, departmentId, relPath, treeLen]);

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
      <SubFolderView
        subfolders={contents.subfolders}
        files={contents.files}
        subPathSegments={subPathSegments}
        rootLabel={label}
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
        canUpload={canUpload && relPath ? true : false}
        uploadTo={uploadTo}
        onUploadFiles={onUploadFiles}
        uploading={uploading}
      />
    </section>
  );
}