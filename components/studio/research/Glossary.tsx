'use client';

import { useMemo, useState } from 'react';
import { GLOSSARY, GLOSSARY_CATEGORIES, searchGlossary } from '@/lib/research/glossary';
import { CopyButton, TextInput } from './ui';

export default function Glossary() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [dir, setDir] = useState(true); // true = EN→AR, false = AR→EN

  const rows = useMemo(() => {
    let list = searchGlossary(q);
    if (cat !== 'All') list = list.filter((t) => t.category === cat);
    return list;
  }, [q, cat]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <TextInput
          className="flex-1 min-w-[200px]"
          placeholder="Search English or Arabic…  ابحث بالعربية أو الإنجليزية"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-[0.78rem] text-dark-text outline-none focus:border-qsis"
        >
          <option>All</option>
          {GLOSSARY_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <button
          onClick={() => setDir((d) => !d)}
          className="rounded-xl border border-dark-border bg-dark-bg2 px-3 py-2 text-[0.72rem] font-semibold text-dark-text2 hover:border-qsis/50 transition cursor-pointer"
        >
          {dir ? 'EN → AR' : 'AR → EN'}
        </button>
      </div>

      <p className="text-[0.7rem] text-dark-text3">{GLOSSARY.length} terms · {cat}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {rows.map((t) => (
          <div key={t.en} className="group flex items-center justify-between gap-2 rounded-xl border border-dark-border bg-dark-bg px-3 py-2 hover:border-qsis/40 transition">
            <div className="min-w-0">
              <div className="text-[0.78rem] font-semibold text-dark-text truncate">
                {dir ? t.en : <span dir="rtl" lang="ar">{t.ar}</span>}
              </div>
              <div className="text-[0.7rem] text-dark-text2">
                {dir ? (
                  <span dir="rtl" lang="ar">{t.ar}</span>
                ) : (
                  t.en
                )}
              </div>
              <div className="text-[0.62rem] text-dark-text3 mt-0.5">{t.category}</div>
            </div>
            <CopyButton text={`${t.en} — ${t.ar}`} />
          </div>
        ))}
        {rows.length === 0 && <p className="text-[0.75rem] text-dark-text3 col-span-2 py-6 text-center">No matches.</p>}
      </div>
    </div>
  );
}