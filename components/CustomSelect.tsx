'use client';
import { useState, useRef, useEffect, useMemo } from 'react';

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
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = options.find(o => o.value === value);

  const filtered = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
  }, [options, search]);

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
  }, [open, searchable]);

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const sizeClasses = size === 'sm'
    ? 'py-1.5 px-2.5 text-[0.78rem] rounded-md'
    : 'py-2.5 px-3 text-[0.85rem] rounded-xl';

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
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
                  placeholder="Search..."
                  className="w-full pl-7 pr-2 py-1.5 rounded-lg bg-dark-bg border border-dark-border text-dark-text text-[0.78rem] outline-none focus:border-qsis"
                />
              </div>
            </div>
          )}
          <div className="overflow-y-auto flex-1 min-h-0">
            {hasGroups ? (
              Array.from(groups.entries()).map(([grp, opts]) => (
                <div key={grp || '__all__'}>
                  {grp && (
                    <div className="px-3 py-1.5 bg-dark-bg3/50 sticky top-0 z-10">
                      <span className="text-[0.65rem] font-bold text-dark-text3 uppercase tracking-wider">{grp}</span>
                    </div>
                  )}
                  {opts.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={opt.disabled}
                      onClick={() => { onChange(opt.value); setOpen(false); }}
                      className={`w-full px-3 py-2 flex items-center gap-2.5 text-left cursor-pointer border-none transition-colors text-[0.78rem] disabled:opacity-40 disabled:cursor-not-allowed ${opt.value === value ? 'bg-qsis/10 text-qsis' : 'bg-transparent text-dark-text hover:bg-dark-bg3'}`}
                    >
                      {opt.icon && <i className={`fas ${opt.icon} text-[0.65rem] flex-shrink-0 ${opt.value === value ? 'text-qsis' : 'text-dark-text3'}`}></i>}
                      <span className="flex-1 truncate">{opt.label}</span>
                      {opt.value === value && <i className="fas fa-check text-qsis text-[0.6rem] flex-shrink-0"></i>}
                    </button>
                  ))}
                </div>
              ))
            ) : (
              filtered.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={opt.disabled}
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className={`w-full px-3 py-2 flex items-center gap-2.5 text-left cursor-pointer border-none transition-colors text-[0.78rem] disabled:opacity-40 disabled:cursor-not-allowed ${opt.value === value ? 'bg-qsis/10 text-qsis' : 'bg-transparent text-dark-text hover:bg-dark-bg3'}`}
                >
                  {opt.icon && <i className={`fas ${opt.icon} text-[0.65rem] flex-shrink-0 ${opt.value === value ? 'text-qsis' : 'text-dark-text3'}`}></i>}
                  <span className="flex-1 truncate">{opt.label}</span>
                  {opt.value === value && <i className="fas fa-check text-qsis text-[0.6rem] flex-shrink-0"></i>}
                </button>
              ))
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
