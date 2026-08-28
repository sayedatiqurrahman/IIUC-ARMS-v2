'use client';

import { useState, useRef, useEffect, useMemo, Fragment } from 'react';
import { useAppStore } from '@/lib/store';
import { config } from '@/lib/config';
import { getDepartmentFolder } from '@/lib/departments';

interface SubfolderPickerProps {
  department: string;
  semester: string;
  category: string;
  courseCode: string;
  courseTitle: string;
  midFinal?: string;
  value: string;
  onChange: (subfolder: string) => void;
  disabled?: boolean;
  canCreateFolder?: boolean;
}

/**
 * Extracts the immediate subfolders present under a given folder path inside a
 * course+category. `parentPath` is the relative path (empty = category root).
 */
function extractSubfolders(
  tree: any[],
  deptFolder: string,
  semester: string,
  courseFolder: string,
  category: string,
  midFinal: string | undefined,
  parentPath: string,
): string[] {
  const prefix = `${deptFolder}/${semester}/${courseFolder}/`;
  const midFinalPart = midFinal ? `${midFinal}/` : '';
  const catPrefix = `${prefix}${midFinalPart}${category}/`;
  const base = parentPath ? `${catPrefix}${parentPath}/` : catPrefix;
  const subfolders = new Set<string>();

  for (const item of tree) {
    const path = item.githubPath || item.path || '';
    if (!path.startsWith(base)) continue;
    const rel = path.substring(base.length);
    if (!rel || rel === '.gitkeep') continue;

    // A tree entry at exactly one segment below base is an (empty) folder.
    if (item.type === 'tree') {
      const first = rel.split('/')[0];
      if (first) subfolders.add(first);
      continue;
    }

    const parts = rel.split('/');
    if (parts.length > 1) subfolders.add(parts[0]);
  }

  return Array.from(subfolders).sort();
}

export default function SubfolderPicker({
  department,
  semester,
  category,
  courseCode,
  courseTitle,
  midFinal,
  value,
  onChange,
  disabled,
  canCreateFolder = true,
}: SubfolderPickerProps) {
  const tree = useAppStore(s => s.tree);
  const treeLength = useAppStore(s => s.tree.length);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const deptFolder = getDepartmentFolder(department);
  const courseFolder = courseCode
    ? (courseTitle ? `${courseCode} - ${courseTitle}` : courseCode)
    : '';

  const pathSegments = value ? value.split('/').filter(Boolean) : [];

  const children = useMemo(() => {
    if (!deptFolder || !semester || !courseFolder || !category) return [];
    const isExamCat = category === config.categories.notes.folder || category === config.categories.questions.folder;
    const mf = isExamCat ? midFinal : undefined;
    return extractSubfolders(tree, deptFolder, semester, courseFolder, category, mf, value);
  }, [tree, treeLength, deptFolder, semester, courseFolder, category, midFinal, value]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
        setNewName('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Auto-focus input when creating
  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  const handleNavigate = (segment: string) => {
    onChange(value ? `${value}/${segment}` : segment);
    setOpen(true);
  };

  const handleBreadcrumb = (segments: string[]) => {
    onChange(segments.join('/'));
    setOpen(true);
  };

  const handleCreate = async () => {
    const name = newName.trim().replace(/[\/\\]/g, '');
    if (!name) return;

    const isExamCat = category === config.categories.notes.folder || category === config.categories.questions.folder;
    const mfPart = isExamCat && midFinal ? `${midFinal}/` : '';
    const folderPath = `${config.uploadPath}/${deptFolder}/${semester}/${courseFolder}/${mfPart}${category}/${value ? value + '/' : ''}${name}`;

    setCreatingFolder(true);
    try {
      const res = await fetch('/api/github/create-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath }),
      });
      const data = await res.json();
      if (data.success) {
        onChange(value ? `${value}/${name}` : name);
        setOpen(true);
        setCreating(false);
        setNewName('');
        const s = useAppStore.getState();
        const entryPath = `${folderPath}/.gitkeep`;
        if (!s.tree.some(it => it.path === entryPath)) {
          useAppStore.setState({ tree: [...s.tree, { type: 'blob', path: entryPath }] });
        }
        useAppStore.getState().invalidateTreeCache();
      }
    } catch {}
    setCreatingFolder(false);
  };

  const displayLabel = value || 'Root (category folder)';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-dark-bg border text-[0.78rem] text-left transition cursor-pointer ${
          disabled ? 'opacity-50 pointer-events-none border-dark-border' : 'border-dark-border hover:border-qsis/40 focus:border-qsis outline-none'
        }`}
      >
        <span className="flex items-center gap-1.5 min-w-0 truncate">
          <i className={`fas ${value ? 'fa-folder-open text-qsis' : 'fa-folder text-dark-text3'} text-[0.7rem]`}></i>
          <span className={value ? 'text-dark-text font-medium' : 'text-dark-text3'}>{displayLabel}</span>
        </span>
        <i className={`fas fa-chevron-down text-[0.6rem] text-dark-text3 transition-transform ${open ? 'rotate-180' : ''}`}></i>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-[340px] overflow-y-auto rounded-xl border border-dark-border bg-dark-bg2 shadow-xl">
          {/* Header hint */}
          <div className="px-3 py-1.5 text-[0.62rem] text-dark-text3 uppercase tracking-wider font-semibold bg-dark-bg3/50">
            Upload to folder
          </div>

          {/* Breadcrumb navigation */}
          <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-dark-border">
            <button
              type="button"
              onClick={() => handleBreadcrumb([])}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[0.74rem] border-none cursor-pointer transition ${
                pathSegments.length === 0 ? 'bg-qsis/10 text-qsis font-semibold' : 'bg-transparent text-dark-text2 hover:text-qsis'
              }`}
            >
              <i className="fas fa-home text-[0.65rem]"></i>
              Root
            </button>
            {pathSegments.map((seg, i) => (
              <Fragment key={`${seg}-${i}`}>
                <span className="text-dark-text3 text-[0.7rem]">/</span>
                <button
                  type="button"
                  onClick={() => handleBreadcrumb(pathSegments.slice(0, i + 1))}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[0.74rem] border-none cursor-pointer transition ${
                    i === pathSegments.length - 1 ? 'text-qsis font-semibold' : 'bg-transparent text-dark-text2 hover:text-qsis'
                  }`}
                >
                  <i className="fas fa-folder text-[0.65rem]"></i>
                  {seg}
                </button>
              </Fragment>
            ))}
          </div>

          {/* Subfolders at the current path */}
          {children.length === 0 ? (
            <div className="px-3 py-3 text-[0.72rem] text-dark-text3">
              <i className="fas fa-folder-open mr-1.5 opacity-60"></i>
              No subfolders in this folder.
            </div>
          ) : (
            <div>
              {children.map(child => (
                <button
                  key={child}
                  type="button"
                  onClick={() => handleNavigate(child)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[0.78rem] text-left border-none cursor-pointer transition bg-transparent text-dark-text2 hover:bg-dark-bg3 hover:text-dark-text"
                >
                  <i className="fas fa-folder text-[0.7rem] w-4 text-center text-qsis"></i>
                  <span className="flex-1 truncate">{child}</span>
                  <i className="fas fa-chevron-right text-[0.6rem] text-dark-text3"></i>
                </button>
              ))}
            </div>
          )}

          {/* Create nested folder at the current path */}
          {canCreateFolder && (
            <div className="border-t border-dark-border">
              {!creating ? (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[0.78rem] text-left bg-transparent border-none cursor-pointer text-qsis hover:bg-qsis/5 transition"
                >
                  <i className="fas fa-plus text-[0.7rem] w-4 text-center"></i>
                  Create new subfolder here
                </button>
              ) : (
                <div className="p-2 bg-dark-bg3/50">
                  <div className="flex gap-1.5">
                    <input
                      ref={inputRef}
                      value={newName}
                      onChange={e => setNewName(e.target.value.replace(/[\/\\]/g, ''))}
                      onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setCreating(false); setNewName(''); } }}
                      placeholder="Folder name..."
                      className="flex-1 px-2.5 py-1.5 rounded-lg bg-dark-bg border border-dark-border text-[0.78rem] text-dark-text focus:border-qsis outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCreate}
                      disabled={!newName.trim() || creatingFolder}
                      className="px-2.5 py-1.5 rounded-lg bg-qsis text-white text-[0.72rem] font-semibold border-none cursor-pointer hover:brightness-110 disabled:opacity-50"
                    >
                      {creatingFolder ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-plus"></i>}
                    </button>
                  </div>
                  <p className="text-[0.6rem] text-dark-text3 mt-1 px-0.5">Creating inside: {value ? `Root / ${value}` : 'Root'}. Press Enter to create, Esc to cancel.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}