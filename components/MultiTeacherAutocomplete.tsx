'use client';

import { useState, useEffect, useRef } from 'react';
import { useFacultySearch, deptShortName, type FacultyMember } from '@/components/useFacultySearch';

interface MultiTeacherAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  department?: string;
  placeholder?: string;
}

export default function MultiTeacherAutocomplete({ value, onChange, department, placeholder }: MultiTeacherAutocompleteProps) {
  const [query, setQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { loading, inDept, outside } = useFacultySearch(query, department || '');
  const hasDept = !!department;
  const deptSection = hasDept ? inDept : [];
  const otherSection = hasDept ? outside : [...inDept, ...outside];

  const selected: string[] = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function displayName(m: FacultyMember): string {
    return m.title ? `${m.name} (${m.title})` : m.name;
  }

  function addTeacher(name: string) {
    if (!selected.includes(name)) {
      const next = [...selected, name].join(', ');
      onChange(next);
    }
    setQuery('');
    setShowDropdown(false);
    inputRef.current?.focus();
  }

  function removeTeacher(name: string) {
    onChange(selected.filter(t => t !== name).join(', '));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && query === '' && selected.length > 0) {
      removeTeacher(selected[selected.length - 1]);
      return;
    }
    if (e.key === 'Enter' && query.trim()) {
      e.preventDefault();
      if (highlightIdx >= 0 && results.length > 0) {
        addTeacher(displayName(results[highlightIdx]));
      } else if (query.trim()) {
        addTeacher(query.trim());
      }
    }
    if (!showDropdown || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  }

  const filtered = (members: FacultyMember[]) =>
    members.filter(m => !selected.includes(displayName(m)));
  const deptFiltered = filtered(deptSection);
  const otherFiltered = filtered(otherSection);
  const results = [...deptFiltered, ...otherFiltered];

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="flex flex-wrap items-center gap-1 w-full px-2 py-1.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.78rem] min-h-[34px] focus-within:border-qsis transition-colors">
        {selected.map(t => (
          <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-qsis/10 text-qsis text-[0.7rem] font-medium">
            {t}
            <button type="button" onClick={() => removeTeacher(t)} className="text-qsis/60 hover:text-red-400 bg-transparent border-none cursor-pointer text-[0.6rem] leading-none"><i className="fas fa-times"></i></button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setShowDropdown(true); setHighlightIdx(-1); }}
          onFocus={() => { if (results.length > 0) setShowDropdown(true); }}
          onKeyDown={handleKeyDown}
          placeholder={selected.length === 0 ? (placeholder || 'Type name or short form...') : ''}
          className="flex-1 min-w-[80px] bg-transparent border-none outline-none text-[0.78rem] text-dark-text placeholder:text-dark-text3"
          autoComplete="off"
        />
      </div>
      {showDropdown && query.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-[220px] overflow-y-auto bg-dark-bg2 border border-dark-border rounded-lg shadow-lg">
          {loading ? (
            <div className="px-3 py-2 text-[0.72rem] text-dark-text3 flex items-center gap-2">
              <i className="fas fa-spinner fa-spin"></i> Searching...
            </div>
          ) : results.length === 0 ? (
            <div
              className="px-3 py-2 text-[0.72rem] text-dark-text3 cursor-pointer hover:bg-dark-bg3"
              onMouseDown={() => { addTeacher(query.trim()); }}
            >
              <i className="fas fa-plus mr-1"></i> Add &quot;{query.trim()}&quot;
            </div>
          ) : (
            (() => {
              let runningIdx = -1;
              let lastSection: string | null = null;
              const nodes: React.ReactNode[] = [];
              const renderSection = (members: FacultyMember[], header: string, keyPrefix: string) => {
                if (members.length === 0) return;
                if (lastSection !== keyPrefix) {
                  nodes.push(
                    <div key={`${keyPrefix}-h`} className="px-3 py-1.5 bg-dark-bg3/60 sticky top-0 z-10 text-[0.6rem] font-bold text-dark-text3 uppercase tracking-wider">
                      {keyPrefix === 'dept' ? <i className="fas fa-building mr-1 text-qsis"></i> : <i className="fas fa-globe mr-1 text-qsis"></i>}
                      {header}
                    </div>
                  );
                  lastSection = keyPrefix;
                }
                members.forEach(m => {
                  const idx = ++runningIdx;
                  nodes.push(
                    <div
                      key={`${keyPrefix}-${m.id}`}
                      className={`px-3 py-2 cursor-pointer flex items-center gap-2 text-[0.75rem] transition-colors ${
                        idx === highlightIdx ? 'bg-qsis/15 text-qsis' : 'hover:bg-dark-bg3 text-dark-text'
                      }`}
                      onMouseDown={() => addTeacher(displayName(m))}
                      onMouseEnter={() => setHighlightIdx(idx)}
                    >
                      <span className="font-semibold truncate">{m.name}</span>
                      {m.title && <span className="text-[0.65rem] text-dark-text3 truncate">{m.title}</span>}
                      <span className="ml-auto flex items-center gap-1 flex-shrink-0">
                        {m.shortForm && <span className="text-[0.62rem] text-dark-text3 font-mono">{m.shortForm}</span>}
                        <span className="text-[0.56rem] px-1.5 py-0.5 rounded bg-dark-bg3 border border-dark-border text-qsis font-bold">
                          {deptShortName(m.department)}
                        </span>
                      </span>
                    </div>
                  );
                });
              };
              renderSection(deptFiltered, `In ${deptShortName(department)}`, 'dept');
              renderSection(otherFiltered, hasDept ? 'Other Departments' : 'Teachers', 'outside');
              return nodes;
            })()
          )}
        </div>
      )}
    </div>
  );
}
