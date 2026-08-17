'use client';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';

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
  error?: boolean;
  /** When true and a value is selected, prepends a "-- Select --" option with
   *  empty value so the user can deselect (go back to placeholder state). */
  showEmpty?: boolean;
}

const MOBILE_BREAKPOINT = 640;

export default function CustomSelect({ options, value, onChange, placeholder = 'Select...', searchable = false, className = '', size = 'sm', error = false, showEmpty = false }: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlighted, setHighlighted] = useState(-1);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.value === value);

  // When showEmpty is set and a value is selected, prepend a "-- Select --"
  // option so the user can go back to the placeholder (Off Day) state.
  const effectiveOptions = (showEmpty && value)
    ? [{ value: '', label: '-- Select --', icon: 'fa-eraser' }, ...options]
    : options;

  const filtered = useMemo(() => {
    if (!search) return effectiveOptions;
    const q = search.toLowerCase();
    return effectiveOptions.filter(o => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
  }, [effectiveOptions, search]);

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

  const hasGroups = effectiveOptions.some(o => o.group);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

  const scrollToHighlighted = useCallback((idx: number) => {
    if (!listRef.current) return;
    const buttons = listRef.current.querySelectorAll('button[data-option]');
    if (buttons[idx]) {
      buttons[idx].scrollIntoView({ block: 'nearest' });
    }
  }, []);

  // Compute the best viewport position for the desktop popover so it is never
  // clipped by overflow containers or pushed off-screen.
  const updatePos = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const width = Math.max(rect.width, 180);
    const left = Math.max(4, Math.min(rect.left, window.innerWidth - width - 4));
    const below = rect.bottom + 4;
    const spaceBelow = window.innerHeight - below;
    const spaceAbove = rect.top - 4;
    const openUp = spaceBelow < 280 && spaceAbove > spaceBelow;
    const top = openUp ? Math.max(4, spaceAbove - Math.min(280, spaceAbove)) : below;
    setPos({ top, left, width });
  }, []);

  const openDropdown = useCallback(() => {
    updatePos();
    setOpen(true);
  }, [updatePos]);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setPos(null);
  }, []);

  const toggle = useCallback(() => {
    if (open) closeDropdown();
    else openDropdown();
  }, [open, closeDropdown, openDropdown]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current && ref.current.contains(target)) return;
      if (dropdownRef.current && dropdownRef.current.contains(target)) return;
      closeDropdown();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, closeDropdown]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) closeDropdown();
      else updatePos();
    };
    const onResize = () => updatePos();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, updatePos, closeDropdown]);

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
        openDropdown();
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
          closeDropdown();
        }
        break;
      case 'Escape':
        e.preventDefault();
        closeDropdown();
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

  const optionsContent = (
    <>
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
                      onClick={() => { onChange(opt.value); closeDropdown(); }}
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
                onClick={() => { onChange(opt.value); closeDropdown(); }}
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
    </>
  );

  return (
    <div ref={ref} className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        onClick={toggle}
        onKeyDown={handleKeyDown}
        className={`w-full bg-dark-bg border text-dark-text ${sizeClasses} outline-none cursor-pointer transition-colors text-left flex items-center justify-between gap-2 hover:border-dark-border2 ${open ? 'border-qsis' : error ? 'border-red-500' : 'border-dark-border'}`}
      >
        <span className="flex items-center gap-2 truncate min-w-0">
          {selected?.icon && <i className={`fas ${selected.icon} text-qsis text-[0.7rem] flex-shrink-0`}></i>}
          <span className={`truncate ${selected ? 'text-dark-text' : 'text-dark-text3'}`}>
            {selected?.label || placeholder}
          </span>
        </span>
        <i className={`fas fa-chevron-down text-dark-text3 text-[0.55rem] flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}></i>
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        isMobile ? (
          <div className="fixed inset-0 z-[9999]">
            <div className="absolute inset-0 bg-black/70" onClick={closeDropdown}></div>
            <div
              ref={dropdownRef}
              className="absolute inset-x-0 bottom-0 bg-dark-bg2 border border-dark-border rounded-t-2xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh]"
            >
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-dark-border bg-dark-bg3">
                <span className="text-[0.8rem] font-semibold text-dark-text truncate">
                  {selected?.label || placeholder}
                </span>
                <button type="button" onClick={closeDropdown} className="w-7 h-7 rounded-full bg-dark-bg hover:bg-dark-border flex items-center justify-center text-dark-text2 text-[0.7rem] cursor-pointer border-none flex-shrink-0">
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="w-10 h-1 rounded-full bg-dark-border mx-auto mt-2 flex-shrink-0"></div>
              {optionsContent}
            </div>
          </div>
        ) : pos ? (
          <div
            ref={dropdownRef}
            className="fixed z-[9999] bg-dark-bg2 border border-dark-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[280px]"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
            onWheel={(e) => e.stopPropagation()}
          >
            {optionsContent}
          </div>
        ) : null,
        document.body
      )}
    </div>
  );
}
