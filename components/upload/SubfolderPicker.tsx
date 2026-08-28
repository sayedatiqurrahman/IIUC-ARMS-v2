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
  const [browse, setBrowse] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const deptFolder = getDepartmentFolder(department);
  const courseFolder = courseCode
    ? (courseTitle ? `${courseCode} - ${courseTitle}` : courseCode)
    : '';

  // Human-friendly root name for the picker = the category (with Mid/Final when applicable).
  const catLabels: Record<string, string> = {
    [config.categories.sheet.folder]: config.categories.sheet.label,
    [config.categories.notes.folder]: config.categories.notes.label,
    [config.categories.questions.folder]: config.categories.questions.label,
    [config.categories.syllabus.folder]: config.categories.syllabus.label,
    [config.categories.other.folder]: config.categories.other.label,
  };
  const isExamCat = category === config.categories.notes.folder || category === config.categories.questions.folder;
  const rootName = `${catLabels[category] || category}${isExamCat && midFinal ? ` · ${midFinal}` : ''}`;
  const categoryKey = Object.entries(config.categories).find(([, c]) => c.folder === category)?.[0] || '';

  // Browse location = the folder whose contents are visible.
  const pathSegments = browse ? browse.split('/').filter(Boolean) : [];

  const children = useMemo(() => {
    if (!semester || !courseCode || !categoryKey) return [];
    const contents = useAppStore.getState().getSubfolderContents(
      semester,
      courseCode,
      department || null,
      isExamCat ? midFinal || null : null,
      categoryKey,
      browse,
    );
    return contents.subfolders.map(s => s.name);
  }, [tree, treeLength, semester, courseCode, department, categoryKey, midFinal, browse]);

  const openDropdown = () => {
    setBrowse(value);
    setOpen(true);
  };

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

  const childPath = (segment: string) => (browse ? `${browse}/${segment}` : segment);

  // Clicking a folder only drills INTO it (view its nested folders).
  const handleDrillDown = (segment: string) => {
    setBrowse(childPath(segment));
    setOpen(true);
  };

  // Selecting a folder (or breadcrumb position) sets it as the upload target.
  const handleSelect = (path: string) => {
    onChange(path);
    setBrowse(path);
    setOpen(true);
  };

  const handleBreadcrumb = (segments: string[]) => {
    const path = segments.join('/');
    onChange(path);
    setBrowse(path);
    setOpen(true);
  };

  const handleCreate = async () => {
    const name = newName.trim().replace(/[\/\\]/g, '');
    if (!name) return;

    const mfPart = isExamCat && midFinal ? `${midFinal}/` : '';
    const folderPath = `${config.uploadPath}/${deptFolder}/${semester}/${courseFolder}/${mfPart}${category}/${browse ? browse + '/' : ''}${name}`;
    const newPath = browse ? `${browse}/${name}` : name;

    setCreatingFolder(true);
    try {
      const res = await fetch('/api/github/create-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath }),
      });
      const data = await res.json();
      if (data.success) {
        onChange(newPath);
        setBrowse(newPath);
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

  const displayLabel = value ? `${rootName} / ${value}` : rootName;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => (!disabled ? (open ? setOpen(false) : openDropdown()) : undefined)}
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
        <div className="absolute z-50 mt-1 w-full max-h-[360px] overflow-y-auto rounded-xl border border-dark-border bg-dark-bg2 shadow-xl">
          {/* Header: target indicator */}
          <div className="px-3 py-1.5 text-[0.62rem] text-dark-text3 uppercase tracking-wider font-semibold bg-dark-bg3/50 flex items-center justify-between">
            <span>Upload to folder</span>
            <span className="flex items-center gap-1 normal-case font-medium text-qsis">
              <i className="fas fa-check-circle text-[0.65rem]"></i>
              {value ? `${rootName} / ${value}` : rootName}
            </span>
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
              <i className="fas fa-folder text-[0.65rem]"></i>
              {rootName}
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

          {/* Subfolders at the current browse location */}
          {children.length === 0 ? (
            <div className="px-3 py-3 text-[0.72rem] text-dark-text3">
              <i className="fas fa-folder-open mr-1.5 opacity-60"></i>
              This folder is empty. Create a subfolder below.
            </div>
          ) : (
            <div>
              {children.map(child => {
                const path = childPath(child);
                const isSelected = value === path;
                return (
                  <div key={child} className="flex items-center w-full group hover:bg-dark-bg3 transition">
                    <button
                      type="button"
                      onClick={() => handleDrillDown(child)}
                      className="flex-1 flex items-center gap-2 px-3 py-2 text-[0.78rem] text-left border-none cursor-pointer bg-transparent text-dark-text2 hover:text-dark-text min-w-0"
                    >
                      <i className="fas fa-folder text-[0.7rem] w-4 text-center text-qsis shrink-0"></i>
                      <span className="flex-1 truncate">{child}</span>
                      <i className="fas fa-chevron-right text-[0.6rem] text-dark-text3"></i>
                    </button>
                    <button
                      type="button"
                      title={isSelected ? 'Selected for upload' : 'Select for upload'}
                      onClick={() => handleSelect(path)}
                      className={`px-2.5 py-2 border-none cursor-pointer bg-transparent transition shrink-0 ${
                        isSelected ? 'text-qsis' : 'text-dark-text3 opacity-0 group-hover:opacity-100 hover:text-qsis'
                      }`}
                    >
                      <i className={`fas ${isSelected ? 'fa-check-circle' : 'fa-circle-check'}`}></i>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Create nested folder at the current browse location */}
          {canCreateFolder && (
            <div className="border-t border-dark-border">
              {!creating ? (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[0.78rem] text-left bg-transparent border-none cursor-pointer text-qsis hover:bg-qsis/5 transition"
                >
                  <i className="fas fa-plus text-[0.7rem] w-4 text-center"></i>
                  Create new subfolder inside {browse ? `${rootName} / ${browse}` : rootName}
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
                  <p className="text-[0.6rem] text-dark-text3 mt-1 px-0.5">Creating inside {browse ? `${rootName} / ${browse}` : rootName}. Press Enter to create, Esc to cancel.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}