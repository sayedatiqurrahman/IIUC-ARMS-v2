'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { CLUB_ROLES, ASSISTANT_ROLE_TEMPLATES, getRoleLabel } from '@/lib/club-roles';

interface RoleComboboxProps {
  value: string;
  onChange: (value: string) => void;
  customRoles?: Array<{ key: string; label: string }>;
  onSaveCustom?: (key: string, label: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

// Build numbered assistant role keys like "asst_office_secretary_1", "asst_office_secretary_2", etc.
function buildAssistantEntries(): Array<{ key: string; label: string; group: string }> {
  const entries: Array<{ key: string; label: string; group: string }> = [];
  for (const [templateKey, tmpl] of Object.entries(ASSISTANT_ROLE_TEMPLATES)) {
    for (let i = 1; i <= 3; i++) {
      const key = `${templateKey}_${i}`;
      entries.push({ key, label: `${tmpl.label} ${i}`, group: tmpl.group });
    }
  }
  return entries;
}

const ASSISTANT_ENTRIES = buildAssistantEntries();

export default function RoleCombobox({ value, onChange, customRoles = [], onSaveCustom, placeholder = 'Type or select a role...', className = '', disabled = false }: RoleComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [customInput, setCustomInput] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // All built-in roles + assistants
  const builtInOptions = useMemo(() => {
    const opts: Array<{ key: string; label: string; group: string }> = [];
    // Main roles (skip 'member', we'll add it at the end)
    for (const [key, r] of Object.entries(CLUB_ROLES)) {
      if (key === 'member') continue;
      opts.push({ key, label: r.label, group: r.group });
    }
    // Assistant roles
    for (const a of ASSISTANT_ENTRIES) {
      opts.push(a);
    }
    // Member always at the end
    opts.push({ key: 'member', label: 'Member', group: 'Members' });
    return opts;
  }, []);

  // Custom roles as options
  const customOptions = useMemo(() => {
    return customRoles.map(r => ({ key: r.key, label: r.label, group: 'Custom' }));
  }, [customRoles]);

  // All options combined
  const allOptions = useMemo(() => [...builtInOptions, ...customOptions], [builtInOptions, customOptions]);

  // Filter by query
  const filtered = useMemo(() => {
    if (!query.trim()) return allOptions;
    const q = query.toLowerCase();
    return allOptions.filter(o =>
      o.label.toLowerCase().includes(q) ||
      o.key.toLowerCase().includes(q) ||
      o.group.toLowerCase().includes(q)
    );
  }, [allOptions, query]);

  // Check if query is a custom role not in list
  const queryIsNew = query.trim() && !allOptions.some(o => o.label.toLowerCase() === query.toLowerCase()) && !allOptions.some(o => o.key === query.toLowerCase().replace(/[^a-z0-9_]/g, '_'));

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Reset highlight when filter changes
  useEffect(() => { setHighlightIdx(0); }, [filtered.length, query]);

  const displayLabel = getRoleLabel(value, customRoles);

  function selectOption(key: string) {
    onChange(key);
    setOpen(false);
    setQuery('');
    setCustomInput('');
  }

  function saveCustomAndSelect() {
    const cleanLabel = query.trim();
    if (!cleanLabel) return;
    const cleanKey = cleanLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_');
    if (onSaveCustom) onSaveCustom(cleanKey, cleanLabel);
    onChange(cleanKey);
    setOpen(false);
    setQuery('');
    setCustomInput('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'Escape') { setOpen(false); setQuery(''); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, filtered.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, 0)); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (queryIsNew && query.trim()) {
        saveCustomAndSelect();
      } else if (filtered[highlightIdx]) {
        selectOption(filtered[highlightIdx].key);
      }
    }
  }

  return (
    <div className={`relative ${className}`} ref={dropRef}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { if (!disabled) { setOpen(!open); setQuery(''); } }}
        disabled={disabled}
        className="w-full px-3 py-2.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-sm text-left flex items-center justify-between gap-2 outline-none focus:border-qsis transition disabled:opacity-50"
      >
        <span className="truncate">{displayLabel}</span>
        <i className={`fas fa-chevron-down text-dark-text2 text-xs transition-transform ${open ? 'rotate-180' : ''}`}></i>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-dark-bg2 border border-dark-border rounded-xl shadow-2xl max-h-72 overflow-hidden flex flex-col">
          {/* Search input */}
          <div className="p-2 border-b border-dark-border">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setCustomInput(e.target.value); }}
              onKeyDown={handleKeyDown}
              placeholder="Search roles..."
              className="w-full px-2.5 py-1.5 rounded-lg bg-dark-bg border border-dark-border text-dark-text text-sm outline-none focus:border-qsis"
              autoFocus
            />
          </div>
          {/* Options list */}
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 && !queryIsNew && (
              <div className="px-3 py-4 text-center text-dark-text2 text-sm">No roles found</div>
            )}
            {filtered.map((opt, i) => {
              const isSelected = opt.key === value;
              const isHighlighted = i === highlightIdx;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => selectOption(opt.key)}
                  onMouseEnter={() => setHighlightIdx(i)}
                  className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2.5 transition ${
                    isHighlighted ? 'bg-qsis/15' : 'hover:bg-dark-bg3'
                  } ${isSelected ? 'text-qsis' : 'text-dark-text'}`}
                >
                  {isSelected && <i className="fas fa-check text-qsis text-xs w-4"></i>}
                  {!isSelected && <span className="w-4"></span>}
                  <span className="flex-1 truncate">{opt.label}</span>
                  <span className="text-[0.65rem] text-dark-text2 uppercase tracking-wider">{opt.group}</span>
                </button>
              );
            })}
            {/* Save as custom */}
            {queryIsNew && (
              <button
                type="button"
                onClick={saveCustomAndSelect}
                className="w-full px-3 py-2.5 text-left text-sm flex items-center gap-2.5 bg-qsis/10 border-t border-dark-border hover:bg-qsis/20 transition"
              >
                <i className="fas fa-plus text-qsis text-xs w-4 text-center"></i>
                <span className="text-qsis font-semibold">Create &ldquo;{query.trim()}&rdquo;</span>
                <span className="text-[0.65rem] text-qsis/60 uppercase tracking-wider">Custom</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
