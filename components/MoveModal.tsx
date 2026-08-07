'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { showToast } from '@/lib/utils';

interface FolderNode {
  name: string;
  path: string;
}

interface MoveModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourcePath: string;
  sourceName: string;
  mode: 'move' | 'copy';
  onAction: (from: string, to: string, newName?: string) => Promise<void>;
}

const DEPTS = ['all','arts','ba','business','cce','cge','civil','cse','dawah','DIS','eb','eee','ell','ete','finance','hadith','SHIS','law','lis','pharmacy','qsis','science','shariah','social'];

function getDeptFromPath(path: string): string {
  const parts = path.split('/');
  const dept = parts[0] || '';
  return DEPTS.includes(dept) ? dept : 'qsis';
}

export default function MoveModal({ isOpen, onClose, sourcePath, sourceName, mode, onAction }: MoveModalProps) {
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [currentFolder, setCurrentFolder] = useState('');
  const [breadcrumb, setBreadcrumb] = useState<{ name: string; path: string }[]>([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const isOpenRef = useRef(false);

  const deptId = useMemo(() => getDeptFromPath(sourcePath), [sourcePath]);

  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
  }, []);

  const fetchFolders = useCallback(async (folder: string) => {
    setFetching(true);
    try {
      const res = await fetch(`/api/github/file-actions?folder=${encodeURIComponent(folder)}`);
      const data = await res.json();
      setFolders(data.folders || []);
    } catch {
      setFolders([]);
    }
    setFetching(false);
  }, []);

  useEffect(() => {
    if (isOpen && !isOpenRef.current) {
      isOpenRef.current = true;
      setCurrentFolder(deptId);
      setBreadcrumb([{ name: deptId.toUpperCase(), path: deptId }]);
      setNewName(sourceName);
      fetchFolders(deptId);
    }
    if (!isOpen) {
      isOpenRef.current = false;
    }
  }, [isOpen, deptId, sourceName, fetchFolders]);

  const navigateTo = useCallback((folderPath: string, folderName: string) => {
    setCurrentFolder(folderPath);
    setBreadcrumb(prev => {
      const existing = prev.findIndex(b => b.path === folderPath);
      if (existing >= 0) return prev.slice(0, existing + 1);
      return [...prev, { name: folderName, path: folderPath }];
    });
    fetchFolders(folderPath);
  }, [fetchFolders]);

  const goUp = useCallback(() => {
    if (breadcrumb.length <= 1) return;
    const newBc = breadcrumb.slice(0, -1);
    setBreadcrumb(newBc);
    const parentPath = newBc[newBc.length - 1].path;
    setCurrentFolder(parentPath);
    fetchFolders(parentPath);
  }, [breadcrumb, fetchFolders]);

  const handleAction = async () => {
    const destName = newName.trim() || sourceName;
    const destPath = currentFolder ? `${currentFolder}/${destName}` : destName;

    if (mode === 'move' && destPath === sourcePath) {
      showToast('Source and destination are the same', 'error');
      return;
    }

    setLoading(true);
    try {
      await onAction(sourcePath, destPath, destName !== sourceName ? destName : undefined);
      onClose();
    } catch (e: any) {
      showToast(e.message || 'Action failed', 'error');
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-[200]" onClick={onClose} />

      {/* Modal — mobile: bottom sheet, desktop: centered */}
      <div className={`fixed z-[201] bg-dark-bg2 border border-dark-border shadow-2xl
        ${isMobile
          ? 'bottom-0 left-0 right-0 rounded-t-2xl max-h-[80vh]'
          : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl w-[480px] max-h-[70vh]'
        } flex flex-col overflow-hidden`}
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-dark-border flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <i className={`fas ${mode === 'move' ? 'fa-arrows-alt' : 'fa-copy'} text-qsis`}></i>
            <h3 className="font-semibold text-[0.95rem]">
              {mode === 'move' ? 'Move' : 'Copy'} File
            </h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-dark-bg3 text-dark-text2">
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Source info */}
        <div className="px-4 pt-3 pb-2 flex-shrink-0">
          <div className="text-[0.7rem] text-dark-text3 mb-1">From:</div>
          <div className="text-[0.8rem] text-dark-text font-mono truncate bg-dark-bg rounded-lg px-3 py-2 border border-dark-border">
            {sourcePath}
          </div>
        </div>

        {/* Breadcrumb */}
        <div className="px-4 pt-2 pb-1 flex items-center gap-1 text-[0.72rem] text-dark-text2 overflow-x-auto flex-shrink-0">
          {breadcrumb.map((b, i) => (
            <span key={b.path} className="flex items-center gap-1 flex-shrink-0">
              {i > 0 && <i className="fas fa-chevron-right text-[0.5rem] text-dark-text3"></i>}
              <button
                onClick={() => navigateTo(b.path, b.name)}
                className={`hover:text-qsis transition-colors px-1 py-0.5 rounded ${i === breadcrumb.length - 1 ? 'text-qsis font-semibold' : ''}`}
              >
                {i === 0 && <i className="fas fa-building mr-1"></i>}
                {b.name}
              </button>
            </span>
          ))}
        </div>

        {/* Folder list */}
        <div className="flex-1 overflow-y-auto px-4 pb-2 min-h-0">
          {fetching ? (
            <div className="flex items-center justify-center py-8">
              <i className="fas fa-spinner fa-spin text-qsis text-lg"></i>
            </div>
          ) : folders.length === 0 ? (
            <div className="text-center py-6 text-dark-text3 text-[0.8rem]">
              <i className="fas fa-folder-open text-xl mb-2 block opacity-40"></i>
              No subfolders
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {folders.map(f => (
                <button
                  key={f.path}
                  onClick={() => navigateTo(f.path, f.name)}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left hover:bg-dark-bg hover:border-qsis border border-transparent transition-all group"
                >
                  <i className="fas fa-folder text-dark-text3 group-hover:text-qsis transition-colors"></i>
                  <span className="text-[0.82rem] text-dark-text group-hover:text-qsis transition-colors truncate">{f.name}</span>
                  <i className="fas fa-chevron-right text-[0.55rem] text-dark-text3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity"></i>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Destination input */}
        <div className="px-4 py-3 border-t border-dark-border flex-shrink-0">
          <div className="text-[0.7rem] text-dark-text3 mb-1.5">To (in {currentFolder || 'root'}):</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="flex-1 bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-[0.82rem] text-dark-text focus:outline-none focus:border-qsis"
              placeholder="File name"
            />
          </div>

          {/* Up button */}
          {breadcrumb.length > 1 && (
            <button
              onClick={goUp}
              className="mt-2 flex items-center gap-1.5 text-[0.72rem] text-dark-text2 hover:text-qsis transition-colors"
            >
              <i className="fas fa-arrow-up"></i> Go up
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="px-4 pb-4 flex gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-dark-bg border border-dark-border text-dark-text2 text-[0.82rem] hover:bg-dark-bg3 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAction}
            disabled={loading || !newName.trim()}
            className="flex-1 py-2.5 rounded-xl bg-qsis text-white text-[0.82rem] font-semibold hover:bg-qsis/90 transition-colors disabled:opacity-50"
          >
            {loading ? (
              <><i className="fas fa-spinner fa-spin mr-1.5"></i>Processing...</>
            ) : (
              <><i className={`fas ${mode === 'move' ? 'fa-arrows-alt' : 'fa-copy'} mr-1.5`}></i>{mode === 'move' ? 'Move' : 'Copy'}</>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
