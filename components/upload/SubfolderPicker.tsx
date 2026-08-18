'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { config } from '@/lib/config';
import { getDepartmentFolder, getFacultyIdForDepartment } from '@/lib/departments';

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
}

/**
 * Extracts existing subfolder names from the tree for a given course+category path.
 * Subfolders are the directory segments between the category and the actual files.
 */
function extractSubfolders(
  tree: any[],
  deptFolder: string,
  semester: string,
  courseFolder: string,
  category: string,
  midFinal?: string,
): string[] {
  const prefix = `${deptFolder}/${semester}/${courseFolder}/`;
  const midFinalPart = midFinal ? `${midFinal}/` : '';
  const catPrefix = `${prefix}${midFinalPart}${category}/`;
  const subfolders = new Set<string>();

  for (const item of tree) {
    const path = item.githubPath || item.path || '';
    if (!path.startsWith(catPrefix)) continue;
    const rel = path.substring(catPrefix.length);
    if (!rel || rel === '.gitkeep') continue;
    const parts = rel.split('/');
    // The first segment after category is the subfolder (or a file at root)
    if (parts.length > 1) {
      subfolders.add(parts[0]);
    }
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

  const existingSubfolders = useMemo(() => {
    if (!deptFolder || !semester || !courseFolder || !category) return [];
    const isExamCat = category === config.categories.notes.folder || category === config.categories.questions.folder;
    const mf = isExamCat ? midFinal : undefined;
    return extractSubfolders(tree, deptFolder, semester, courseFolder, category, mf);
  }, [tree, treeLength, deptFolder, semester, courseFolder, category, midFinal]);

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

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;

    // Build the folder path for creation
    const isExamCat = category === config.categories.notes.folder || category === config.categories.questions.folder;
    const mfPart = isExamCat && midFinal ? `${midFinal}/` : '';
    const folderPath = `${config.uploadPath}/${deptFolder}/${semester}/${courseFolder}/${mfPart}${category}/${name}`;

    setCreatingFolder(true);
    try {
      const res = await fetch('/api/github/create-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath }),
      });
      const data = await res.json();
      if (data.success) {
        onChange(name);
        setOpen(false);
        setCreating(false);
        setNewName('');
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
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-dark-border bg-dark-bg2 shadow-xl overflow-hidden">
          {/* Root option */}
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false); }}
            className={`w-full flex items-center gap-2 px-3 py-2 text-[0.78rem] text-left border-none cursor-pointer transition ${
              !value ? 'bg-qsis/10 text-qsis font-medium' : 'bg-transparent text-dark-text2 hover:bg-dark-bg3'
            }`}
          >
            <i className="fas fa-home text-[0.7rem] w-4 text-center"></i>
            Root (upload to category folder)
            {!value && <i className="fas fa-check text-[0.6rem] ml-auto text-qsis"></i>}
          </button>

          {/* Existing subfolders */}
          {existingSubfolders.length > 0 && (
            <div className="border-t border-dark-border">
              <div className="px-3 py-1 text-[0.62rem] text-dark-text3 uppercase tracking-wider font-semibold bg-dark-bg3/50">
                Existing subfolders
              </div>
              {existingSubfolders.map(sf => (
                <button
                  key={sf}
                  type="button"
                  onClick={() => { onChange(sf); setOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-[0.78rem] text-left border-none cursor-pointer transition ${
                    value === sf ? 'bg-qsis/10 text-qsis font-medium' : 'bg-transparent text-dark-text2 hover:bg-dark-bg3'
                  }`}
                >
                  <i className="fas fa-folder text-[0.7rem] w-4 text-center text-dark-text3"></i>
                  <span className="truncate">{sf}</span>
                  {value === sf && <i className="fas fa-check text-[0.6rem] ml-auto text-qsis"></i>}
                </button>
              ))}
            </div>
          )}

          {/* Create new */}
          <div className="border-t border-dark-border">
            {!creating ? (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-[0.78rem] text-left bg-transparent border-none cursor-pointer text-qsis hover:bg-qsis/5 transition"
              >
                <i className="fas fa-plus text-[0.7rem] w-4 text-center"></i>
                Create new subfolder
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
                <p className="text-[0.6rem] text-dark-text3 mt-1 px-0.5">Press Enter to create, Esc to cancel</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
