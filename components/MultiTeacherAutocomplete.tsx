'use client';

import { useState, useEffect, useRef } from 'react';

interface FacultyMember {
  id: string;
  name: string;
  title: string | null;
  shortForm: string | null;
  department: string;
}

interface MultiTeacherAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  department?: string;
  placeholder?: string;
}

export default function MultiTeacherAutocomplete({ value, onChange, department, placeholder }: MultiTeacherAutocompleteProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<FacultyMember[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected: string[] = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];

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

  function addTeacher(name: string) {
    if (!selected.includes(name)) {
      const next = [...selected, name].join(', ');
      onChange(next);
    }
    setQuery('');
    setSuggestions([]);
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
      if (highlightIdx >= 0 && suggestions.length > 0) {
        addTeacher(suggestions[highlightIdx].title ? `${suggestions[highlightIdx].name} (${suggestions[highlightIdx].title})` : suggestions[highlightIdx].name);
      } else if (query.trim()) {
        addTeacher(query.trim());
      }
    }
    if (!showDropdown || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  }

  const filteredSuggestions = suggestions.filter(s => {
    const display = s.title ? `${s.name} (${s.title})` : s.name;
    return !selected.includes(display);
  });

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
          onFocus={() => { if (filteredSuggestions.length > 0) setShowDropdown(true); }}
          onKeyDown={handleKeyDown}
          placeholder={selected.length === 0 ? (placeholder || 'Type name or short form...') : ''}
          className="flex-1 min-w-[80px] bg-transparent border-none outline-none text-[0.78rem] text-dark-text placeholder:text-dark-text3"
          autoComplete="off"
        />
      </div>
      {showDropdown && query.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-[180px] overflow-y-auto bg-dark-bg2 border border-dark-border rounded-lg shadow-lg">
          {loading ? (
            <div className="px-3 py-2 text-[0.72rem] text-dark-text3 flex items-center gap-2">
              <i className="fas fa-spinner fa-spin"></i> Searching...
            </div>
          ) : filteredSuggestions.length === 0 ? (
            <div
              className="px-3 py-2 text-[0.72rem] text-dark-text3 cursor-pointer hover:bg-dark-bg3"
              onMouseDown={() => { addTeacher(query.trim()); }}
            >
              <i className="fas fa-plus mr-1"></i> Add &quot;{query.trim()}&quot;
            </div>
          ) : (
            filteredSuggestions.map((m, i) => (
              <div
                key={m.id}
                className={`px-3 py-2 cursor-pointer flex items-center gap-2 text-[0.75rem] transition-colors ${
                  i === highlightIdx ? 'bg-qsis/15 text-qsis' : 'hover:bg-dark-bg3 text-dark-text'
                }`}
                onMouseDown={() => {
                  const display = m.title ? `${m.name} (${m.title})` : m.name;
                  addTeacher(display);
                }}
                onMouseEnter={() => setHighlightIdx(i)}
              >
                <span className="font-semibold truncate">{m.name}</span>
                {m.title && <span className="text-[0.65rem] text-dark-text3 truncate">{m.title}</span>}
                {m.shortForm && <span className="ml-auto text-[0.62rem] text-dark-text3 font-mono flex-shrink-0">{m.shortForm}</span>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
