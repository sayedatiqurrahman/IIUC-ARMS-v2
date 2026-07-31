'use client';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';

export interface CustomSelectOption {
  value: string;
  label: string;
  icon?: string;
  group?: string;
  disabled?: boolean;
}

interface CustomSelectProps {
  options: CustomSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}

export default function CustomSelect({ options, value, onChange, placeholder = 'Select...', searchable = false, className = '', size = 'sm' }: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlighted, setHighlighted] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.value === value);

  const filtered = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
  }, [options, search]);

  const flatOptions = useMemo(() => {
    return filtered.filter(o => !o.disabled);
  }, [filtered]);

  const groups = useMemo(() => {
    const g = new Map<string, CustomSelectOption[]>();
    for (const opt of filtered) {
      const grp = opt.group || '';
      if (!g.has(grp)) g.set(grp, []);
      g.get(grp)!.push(opt);
    }
    return g;
  }, [filtered]);

  const hasGroups = options.some(o => o.group);

  const scrollToHighlighted = useCallback((idx: number) => {
    if (!listRef.current) return;
    const buttons = listRef.current.querySelectorAll('button[data-option]');
    if (buttons[idx]) {
      buttons[idx].scrollIntoView({ block: 'nearest' });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open && searchable && searchRef.current) {
      searchRef.current.focus();
    }
    if (open) {
      // Highlight current selection or first item
      const idx = flatOptions.findIndex(o => o.value === value);
      setHighlighted(idx >= 0 ? idx : 0);
    }
  }, [open, searchable, value, flatOptions]);

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  useEffect(() => {
    setHighlighted(0);
  }, [search]);

  useEffect(() => {
    scrollToHighlighted(highlighted);
  }, [highlighted, scrollToHighlighted]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlighted(prev => {
          const next = prev < flatOptions.length - 1 ? prev + 1 : 0;
          return next;
        });
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlighted(prev => {
          const next = prev > 0 ? prev - 1 : flatOptions.length - 1;
          return next;
        });
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (highlighted >= 0 && highlighted < flatOptions.length) {
          onChange(flatOptions[highlighted].value);
          setOpen(false);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
      case 'Home':
        e.preventDefault();
        setHighlighted(0);
        break;
      case 'End':
        e.preventDefault();
        setHighlighted(flatOptions.length - 1);
        break;
    }
  }

  const sizeClasses = size === 'sm'
    ? 'py-1.5 px-2.5 text-[0.78rem] rounded-md'
    : 'py-2.5 px-3 text-[0.85rem] rounded-xl';

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        onKeyDown={handleKeyDown}
        className={`w-full bg-dark-bg border border-dark-border text-dark-text ${sizeClasses} outline-none cursor-pointer transition-colors text-left flex items-center justify-between gap-2 hover:border-dark-border2 ${open ? 'border-qsis' : ''}`}
      >
        <span className="flex items-center gap-2 truncate min-w-0">
          {selected?.icon && <i className={`fas ${selected.icon} text-qsis text-[0.7rem] flex-shrink-0`}></i>}
          <span className={`truncate ${selected ? 'text-dark-text' : 'text-dark-text3'}`}>
            {selected?.label || placeholder}
          </span>
        </span>
        <i className={`fas fa-chevron-down text-dark-text3 text-[0.55rem] flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}></i>
      </button>

      {open && (
        <div className="absolute z-[200] mt-1 w-full min-w-[180px] max-h-[280px] bg-dark-bg2 border border-dark-border rounded-xl shadow-2xl overflow-hidden flex flex-col">
          {searchable && (
            <div className="p-2 border-b border-dark-border">
              <div className="relative">
                <i className="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-text3 text-[0.65rem]"></i>
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search..."
                  className="w-full pl-7 pr-2 py-1.5 rounded-lg bg-dark-bg border border-dark-border text-dark-text text-[0.78rem] outline-none focus:border-qsis"
                />
              </div>
            </div>
          )}
          <div ref={listRef} className="overflow-y-auto flex-1 min-h-0 scroll-smooth" role="listbox"
            onWheel={(e) => e.stopPropagation()}
          >
            {hasGroups ? (
              Array.from(groups.entries()).map(([grp, opts]) => {
                let globalIdx = -1;
                return (
                  <div key={grp || '__all__'}>
                    {grp && (
                      <div className="px-3 py-1.5 bg-dark-bg3/50 sticky top-0 z-10">
                        <span className="text-[0.65rem] font-bold text-dark-text3 uppercase tracking-wider">{grp}</span>
                      </div>
                    )}
                    {opts.map(opt => {
                      const idx = flatOptions.indexOf(opt);
                      const isHighlighted = idx === highlighted;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          data-option
                          disabled={opt.disabled}
                          onClick={() => { onChange(opt.value); setOpen(false); }}
                          onMouseEnter={() => !opt.disabled && setHighlighted(idx)}
                          className={`w-full px-3 py-2 flex items-center gap-2.5 text-left cursor-pointer border-none transition-all text-[0.78rem] disabled:opacity-40 disabled:cursor-not-allowed ${isHighlighted ? 'bg-qsis/15 text-qsis font-semibold' : ''} ${opt.value === value ? 'bg-qsis/10 text-qsis' : 'bg-transparent text-dark-text hover:bg-dark-bg3'}`}
                          role="option"
                          aria-selected={opt.value === value}
                        >
                          {opt.icon && <i className={`fas ${opt.icon} text-[0.65rem] flex-shrink-0 ${isHighlighted ? 'text-qsis' : opt.value === value ? 'text-qsis' : 'text-dark-text3'}`}></i>}
                          <span className="flex-1 truncate">{opt.label}</span>
                          {opt.value === value && <i className="fas fa-check text-qsis text-[0.6rem] flex-shrink-0"></i>}
                        </button>
                      );
                    })}
                  </div>
                );
              })
            ) : (
              filtered.map(opt => {
                const idx = flatOptions.indexOf(opt);
                const isHighlighted = idx === highlighted;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    data-option
                    disabled={opt.disabled}
                    onClick={() => { onChange(opt.value); setOpen(false); }}
                    onMouseEnter={() => !opt.disabled && setHighlighted(idx)}
                    className={`w-full px-3 py-2 flex items-center gap-2.5 text-left cursor-pointer border-none transition-all text-[0.78rem] disabled:opacity-40 disabled:cursor-not-allowed ${isHighlighted ? 'bg-qsis/15 text-qsis font-semibold' : ''} ${opt.value === value ? 'bg-qsis/10 text-qsis' : 'bg-transparent text-dark-text hover:bg-dark-bg3'}`}
                    role="option"
                    aria-selected={opt.value === value}
                  >
                    {opt.icon && <i className={`fas ${opt.icon} text-[0.65rem] flex-shrink-0 ${isHighlighted ? 'text-qsis' : opt.value === value ? 'text-qsis' : 'text-dark-text3'}`}></i>}
                    <span className="flex-1 truncate">{opt.label}</span>
                    {opt.value === value && <i className="fas fa-check text-qsis text-[0.6rem] flex-shrink-0"></i>}
                  </button>
                );
              })
            )}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-dark-text3 text-[0.78rem]">No options found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
