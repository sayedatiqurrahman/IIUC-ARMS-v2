'use client';

import { useState, useEffect, useRef } from 'react';

interface FacultyMember {
  id: string;
  name: string;
  title: string | null;
  shortForm: string | null;
  department: string;
}

interface TeacherAutocompleteProps {
  value: string;
  onChange: (value: string, shortForm?: string) => void;
  department?: string;
  placeholder?: string;
}

export default function TeacherAutocomplete({ value, onChange, department, placeholder }: TeacherAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<FacultyMember[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    if (query.length < 1) { setSuggestions([]); return; }
    const timer = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ search: query });
      if (department) params.set('department', department);
      fetch(`/api/faculty?${params}`)
        .then(r => r.json())
        .then(data => { setSuggestions(data.members || []); setLoading(false); })
        .catch(() => setLoading(false));
    }, 200);
    return () => clearTimeout(timer);
  }, [query, department]);

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

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showDropdown || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && highlightIdx >= 0) {
      e.preventDefault();
      select(suggestions[highlightIdx]);
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
        onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || 'Type name or short form...'}
        className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors"
        autoComplete="off"
      />
      {showDropdown && (query.length > 0) && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-[200px] overflow-y-auto bg-dark-bg2 border border-dark-border rounded-lg shadow-lg">
          {loading ? (
            <div className="px-3 py-2 text-[0.75rem] text-dark-text3 flex items-center gap-2">
              <i className="fas fa-spinner fa-spin"></i> Searching...
            </div>
          ) : suggestions.length === 0 ? (
            <div className="px-3 py-2 text-[0.75rem] text-dark-text3">
              <i className="fas fa-info-circle mr-1"></i> No match found — type to save as new teacher
            </div>
          ) : (
            suggestions.map((m, i) => (
              <div
                key={m.id}
                className={`px-3 py-2 cursor-pointer flex items-center gap-2 text-[0.78rem] transition-colors ${
                  i === highlightIdx ? 'bg-qsis/15 text-qsis' : 'hover:bg-dark-bg3 text-dark-text'
                }`}
                onClick={() => select(m)}
                onMouseEnter={() => setHighlightIdx(i)}
              >
                <span className="font-semibold truncate">{m.name}</span>
                {m.title && <span className="text-[0.68rem] text-dark-text3 truncate">{m.title}</span>}
                {m.shortForm && <span className="ml-auto text-[0.65rem] text-dark-text3 font-mono flex-shrink-0">{m.shortForm}</span>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
