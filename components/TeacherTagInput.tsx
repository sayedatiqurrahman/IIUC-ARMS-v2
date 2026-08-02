'use client';

import { useState, useEffect, useRef } from 'react';

interface FacultyMember {
  id: string;
  name: string;
  title: string | null;
  shortForm: string | null;
  department: string;
}

interface TeacherTagInputProps {
  value: string;
  onChange: (value: string) => void;
  department?: string;
  placeholder?: string;
  className?: string;
}

export default function TeacherTagInput({ value, onChange, department, placeholder, className }: TeacherTagInputProps) {
  const [inputVal, setInputVal] = useState('');
  const [suggestions, setSuggestions] = useState<FacultyMember[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const tags = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (inputVal.length < 1) { setSuggestions([]); return; }
    const timer = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ search: inputVal });
      if (department) params.set('department', department);
      fetch(`/api/faculty?${params}`)
        .then(r => r.json())
        .then(data => { setSuggestions(data.members || []); setLoading(false); })
        .catch(() => setLoading(false));
    }, 200);
    return () => clearTimeout(timer);
  }, [inputVal, department]);

  function addTag(text: string) {
    const trimmed = text.trim();
    if (!trimmed || tags.some(t => t.toLowerCase() === trimmed.toLowerCase())) return;
    const newTags = [...tags, trimmed];
    onChange(newTags.join(', '));
    setInputVal('');
    setShowDropdown(false);
  }

  function removeTag(idx: number) {
    const newTags = tags.filter((_, i) => i !== idx);
    onChange(newTags.join(', '));
  }

  function selectSuggestion(member: FacultyMember) {
    const display = member.title ? `${member.name} (${member.title})` : member.name;
    addTag(display);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && inputVal.trim()) {
      e.preventDefault();
      if (showDropdown && suggestions.length > 0 && highlightIdx >= 0) {
        selectSuggestion(suggestions[highlightIdx]);
      } else {
        addTag(inputVal);
      }
    } else if (e.key === 'Backspace' && !inputVal && tags.length > 0) {
      removeTag(tags.length - 1);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    } else if (e.key === 'ArrowDown' && showDropdown) {
      e.preventDefault();
      setHighlightIdx(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp' && showDropdown) {
      e.preventDefault();
      setHighlightIdx(i => Math.max(i - 1, 0));
    }
  }

  return (
    <div ref={wrapperRef} className={`relative ${className || ''}`}>
      <div className="flex flex-wrap items-center gap-1 px-1.5 py-1 rounded border border-dark-border bg-dark-bg min-h-[28px] cursor-text"
        onClick={() => inputRef.current?.focus()}>
        {tags.map((tag, i) => (
          <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-qsis/15 text-qsis text-[0.65rem] font-medium border border-qsis/20">
            <span className="truncate max-w-[100px]">{tag}</span>
            <button onClick={(e) => { e.stopPropagation(); removeTag(i); }} className="text-qsis/60 hover:text-red-400 bg-transparent border-none cursor-pointer text-[0.55rem] leading-none p-0"><i className="fas fa-times"></i></button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputVal}
          onChange={e => { setInputVal(e.target.value); setShowDropdown(true); setHighlightIdx(-1); }}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? (placeholder || 'Add teachers...') : ''}
          className="flex-1 min-w-[60px] bg-transparent border-none outline-none text-[0.7rem] text-dark-text py-0.5 px-1"
          autoComplete="off"
        />
      </div>
      {showDropdown && inputVal.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-[150px] overflow-y-auto bg-dark-bg2 border border-dark-border rounded-lg shadow-lg">
          {loading ? (
            <div className="px-3 py-1.5 text-[0.7rem] text-dark-text3 flex items-center gap-1">
              <i className="fas fa-spinner fa-spin"></i> Searching...
            </div>
          ) : suggestions.length === 0 ? (
            <button onClick={() => addTag(inputVal)} className="w-full text-left px-3 py-1.5 text-[0.7rem] text-dark-text hover:bg-dark-bg3 flex items-center gap-1 border-none bg-transparent cursor-pointer">
              <i className="fas fa-plus text-green-400"></i> Add &quot;{inputVal}&quot; as teacher
            </button>
          ) : (
            suggestions.map((m, i) => {
              const display = m.title ? `${m.name} (${m.title})` : m.name;
              const alreadyAdded = tags.some(t => t.toLowerCase() === display.toLowerCase());
              return (
                <button
                  key={m.id}
                  disabled={alreadyAdded}
                  onClick={() => !alreadyAdded && selectSuggestion(m)}
                  className={`w-full text-left px-3 py-1.5 text-[0.7rem] flex items-center gap-1 border-none bg-transparent cursor-pointer ${
                    alreadyAdded ? 'opacity-40 cursor-default' : 'hover:bg-dark-bg3 text-dark-text'
                  } ${i === highlightIdx ? 'bg-qsis/10' : ''}`}
                >
                  <span className="font-semibold truncate">{m.name}</span>
                  {m.title && <span className="text-[0.65rem] text-dark-text3 truncate">{m.title}</span>}
                  {alreadyAdded && <i className="fas fa-check ml-auto text-green-400 text-[0.6rem]"></i>}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
