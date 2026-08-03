'use client';

import { useState, useMemo } from 'react';
import CustomSelect from '@/components/CustomSelect';
import { CURRENT_YEAR, CURRENT_SEASON, SESSION_OPTIONS, sortLinksByYear } from './types';
import type { Link } from './types';

export default function LinksEditor({ links, onAdd, onRemove, semesterLabel, authorName }: { links: Link[]; onAdd: (title: string, url: string) => void; onRemove: (idx: number) => void; semesterLabel?: string; authorName?: string }) {
  const [session, setSession] = useState(CURRENT_SEASON);
  const [year, setYear] = useState(String(CURRENT_YEAR));
  const [url, setUrl] = useState('');
  const [expanded, setExpanded] = useState(false);

  const autoTitle = useMemo(() => {
    if (!session || !year || !semesterLabel || !authorName) return '';
    return `${session} ${year} - ${semesterLabel} - ${authorName}`;
  }, [session, year, semesterLabel, authorName]);

  const yearOptions = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    const y = CURRENT_YEAR - i;
    return { value: String(y), label: String(y), icon: 'fa-calendar' };
  }), []);

  const sortedLinks = useMemo(() => sortLinksByYear(links), [links]);

  function handleAdd() {
    if (!autoTitle.trim() || !url.trim()) return;
    onAdd(autoTitle.trim(), url);
    setUrl('');
  }

  return (
    <div className="mb-3 bg-dark-bg3 border border-dark-border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-3 py-2 bg-transparent border-none cursor-pointer hover:bg-dark-bg2 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-[0.75rem] font-semibold text-dark-text2 flex items-center gap-1.5">
          <i className="fas fa-link text-qsis"></i> Shared Links
          {links.length > 0 && <span className="text-[0.65rem] text-dark-text3">({links.length})</span>}
        </span>
        <i className={`fas fa-chevron-${expanded ? 'up' : 'down'} text-[0.6rem] text-dark-text3`}></i>
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-dark-border">
          {sortedLinks.length > 0 && (
            <div className="flex flex-col gap-1.5 mt-2 mb-2">
              {sortedLinks.map((link, i) => (
                <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-dark-bg border border-dark-border group">
                  <i className="fas fa-external-link-alt text-[0.6rem] text-dark-text3"></i>
                  <span className="text-[0.75rem] text-dark-text font-semibold truncate flex-1">{link.title}</span>
                  <span className="text-[0.6rem] text-dark-text3 truncate max-w-[150px]">{link.url.replace(/^https?:\/\//, '').slice(0, 40)}</span>
                  <button className="w-4 h-4 rounded bg-red-500/10 text-red-400 border-none cursor-pointer flex items-center justify-center text-[0.55rem] hover:bg-red-500/20 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => onRemove(i)}>
                    <i className="fas fa-times"></i>
                  </button>
                </div>
              ))}
            </div>
          )}
          {autoTitle && (
            <div className="px-2.5 py-1.5 rounded-lg bg-dark-bg border border-dark-border mb-2">
              <span className="text-[0.72rem] text-dark-text2">Title: </span>
              <span className="text-[0.72rem] text-qsis font-semibold">{autoTitle}</span>
            </div>
          )}
          <div className="flex gap-2 mt-1">
            <div className="w-[110px]">
              <CustomSelect value={session} onChange={setSession} placeholder="Session" options={SESSION_OPTIONS} />
            </div>
            <div className="w-[90px]">
              <CustomSelect value={year} onChange={setYear} placeholder="Year" options={yearOptions} />
            </div>
            <input
              type="url"
              placeholder="https://..."
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              className="flex-1 px-2.5 py-1.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.75rem] outline-none focus:border-qsis"
            />
            <button
              className="px-2.5 py-1.5 rounded-lg bg-qsis text-white text-[0.72rem] font-semibold border-none cursor-pointer hover:opacity-90 disabled:opacity-50"
              onClick={handleAdd}
              disabled={!autoTitle.trim() || !url.trim()}
            >
              <i className="fas fa-plus"></i>
            </button>
          </div>
          <p className="text-[0.6rem] text-dark-text3 mt-1.5">Title: Autumn 2026 - 6th Semester - Author</p>
        </div>
      )}
    </div>
  );
}
