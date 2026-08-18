'use client';

import { useState, useEffect, useRef } from 'react';
import { useFacultySearch, deptShortName, type FacultyMember } from '@/components/useFacultySearch';

interface TeacherAutocompleteProps {
  value: string;
  onChange: (value: string, shortForm?: string) => void;
  department?: string;
  placeholder?: string;
}

export default function TeacherAutocomplete({ value, onChange, department, placeholder }: TeacherAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [prevValue, setPrevValue] = useState(value);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { loading, inDept, outside } = useFacultySearch(query, department || '');
  const hasDept = !!department;
  const deptSection = hasDept ? inDept : [];
  const otherSection = hasDept ? outside : [...inDept, ...outside];

  useEffect(() => { setQuery(value); setPrevValue(value); }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function select(member: FacultyMember) {
    const display = member.title ? `${member.name} (${member.title})` : member.name;
    setQuery(display);
    onChange(display, member.shortForm || undefined);
    setShowDropdown(false);
  }

  const results = [...deptSection, ...otherSection];

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showDropdown || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && highlightIdx >= 0) {
      e.preventDefault();
      select(results[highlightIdx]);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  }

  return (
    <div ref={wrapperRef} className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setShowDropdown(true); setHighlightIdx(-1); onChange(e.target.value); }}
        onFocus={() => { setPrevValue(value); setQuery(''); setShowDropdown(true); }}
        onBlur={() => { setTimeout(() => { if (!query) { setQuery(prevValue); onChange(prevValue); } setShowDropdown(false); }, 200); }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || 'Type name or short form...'}
        className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors"
        autoComplete="off"
      />
      {showDropdown && (query.length > 0) && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-[240px] overflow-y-auto bg-dark-bg2 border border-dark-border rounded-lg shadow-lg">
          {loading ? (
            <div className="px-3 py-2 text-[0.75rem] text-dark-text3 flex items-center gap-2">
              <i className="fas fa-spinner fa-spin"></i> Searching...
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-[0.75rem] text-dark-text3">
              <i className="fas fa-info-circle mr-1"></i> No match found — type to save as new teacher
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
                    <div key={`${keyPrefix}-h`} className="px-3 py-1.5 bg-dark-bg3/60 sticky top-0 z-10 text-[0.62rem] font-bold text-dark-text3 uppercase tracking-wider">
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
                      className={`px-3 py-2 cursor-pointer flex items-center gap-2 text-[0.78rem] transition-colors ${
                        idx === highlightIdx ? 'bg-qsis/15 text-qsis' : 'hover:bg-dark-bg3 text-dark-text'
                      }`}
                      onMouseDown={(e) => { e.preventDefault(); select(m); }}
                      onMouseEnter={() => setHighlightIdx(idx)}
                    >
                      <span className="font-semibold truncate">{m.name}</span>
                      {m.title && <span className="text-[0.68rem] text-dark-text3 truncate">{m.title}</span>}
                      <span className="ml-auto flex items-center gap-1 flex-shrink-0">
                        {m.shortForm && <span className="text-[0.65rem] text-dark-text3 font-mono">{m.shortForm}</span>}
                        <span className="text-[0.58rem] px-1.5 py-0.5 rounded bg-dark-bg3 border border-dark-border text-qsis font-bold">
                          {deptShortName(m.department)}
                        </span>
                      </span>
                    </div>
                  );
                });
              };
              renderSection(deptSection, `In ${deptShortName(department)}`, 'dept');
              renderSection(otherSection, hasDept ? 'Other Departments' : 'Teachers', 'outside');
              return nodes;
            })()
          )}
        </div>
      )}
    </div>
  );
}
