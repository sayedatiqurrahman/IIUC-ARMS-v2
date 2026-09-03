'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  const uploadInputRef = useRef<HTMLInputElement>(null);

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
      {/* Navigation / actions header for related folders (own context) */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-[1.05rem] font-semibold flex items-center gap-2">
          <i className="fas fa-folder-open"></i>
          <span className="flex items-center flex-wrap gap-1 text-[0.9rem]">
            <span className="text-dark-text font-semibold">{label}</span>
            {subPathSegments.length > 0 && (
              <>
                <span className="text-dark-text3">/</span>
                {subPathSegments.map((seg, i) => (
                  <span key={`${seg}-${i}`} className="flex items-center gap-1">
                    <span className={`${i === subPathSegments.length - 1 ? 'text-qsis' : 'text-dark-text2'}`}>{seg}</span>
                    {i < subPathSegments.length - 1 && (
                      <span className="text-dark-text3">/</span>
                    )}
                  </span>
                ))}
              </>
            )}
          </span>
        </h3>
        <div className="flex items-center gap-2">
          {canUpload && onUploadFiles && uploadTo && (
            <>
              <input
                ref={uploadInputRef}
                type="file"
                multiple
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.csv,.md,.markdown,.txt,.json,.html,.css,.js,.ts,.py,.zip"
                onChange={e => { const fl = Array.from(e.target.files || []); if (fl.length) { onUploadFiles(uploadTo, fl); } setTimeout(() => { e.target.value = ''; }, 0); }}
              />
              <button disabled={uploading} onClick={() => uploadInputRef.current?.click()}
                className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-qsis/40 bg-qsis/10 text-qsis cursor-pointer text-[0.75rem] font-semibold hover:bg-qsis/20 transition disabled:opacity-50">
                {uploading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-cloud-upload-alt"></i>} {uploading ? 'Uploading...' : 'Upload File'}
              </button>
            </>
          )}
          {canCreateFolder && onCreateFolderAt && (
            <button onClick={() => onCreateFolderAt(relPath)}
              className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-qsis/40 bg-qsis/10 text-qsis cursor-pointer text-[0.75rem] font-semibold hover:bg-qsis/20 transition">
              <i className="fas fa-folder-plus"></i> New Folder
            </button>
          )}
          <button className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold" onClick={goBack}>
            <i className="fas fa-arrow-left"></i> Back
          </button>
        </div>
      </div>
      <SubFolderView
        subfolders={contents.subfolders}
        files={contents.files}
        onOpenFolder={openFolder}
        onOpenFile={onOpenFile}
        filePerms={filePerms}
        onMove={onMove}
        onCopy={onCopy}
        onRename={onRename}
        onDelete={onDelete}
        onShare={onShare}
        actionLoading={actionLoading}
        canDeleteFolder={canDeleteFolder}
        onDeleteFolder={onDeleteFolder}
      />
    </section>
  );
}