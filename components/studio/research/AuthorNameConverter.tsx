'use client';

import { useState } from 'react';
import { arabicToLatin, formatCitationName, hasArabic, authorNameToArabic } from '@/lib/research/transliteration';
import { Btn, CopyButton, Field, Note, outBoxCls, TextArea } from './ui';

export default function AuthorNameConverter() {
  const [input, setInput] = useState('');
  const [multi, setMulti] = useState('');

  const lines = input
    .split('\n')
    .map((n) => n.trim())
    .filter(Boolean);

  const isAr = hasArabic(input);
  const rows = lines.map((n) => {
    const citation = formatCitationName(n);
    const ar = isAr ? n : authorNameToArabic(n);
    const latin = isAr ? arabicToLatin(n) : n;
    return { n, citation, ar, latin };
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Name(s) — one per line" labelAr="الأسماء — اسم لكل سطر">
          <TextArea
            className="min-h-[9rem]"
            placeholder={'Muhammad Ali Rahman\nAisha Khatun'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </Field>

        {rows.length > 0 && (
          <>
            <div>
              <div className="mb-1.5 text-[0.7rem] font-semibold text-dark-text2">Citation format (Last, F. M.)</div>
              <div className="space-y-1.5">
                {rows.map((r) => (
                  <div key={r.n} className="flex items-center justify-between gap-2 rounded-lg border border-dark-border bg-dark-bg px-2.5 py-1.5">
                    <span className="text-[0.74rem] text-dark-text">{(r.citation)}</span>
                    <CopyButton text={r.citation} />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between text-[0.7rem] font-semibold text-dark-text2">
                <span>Arabic script</span>
                <CopyButton text={rows.map((r) => r.ar).join('\n')} />
              </div>
              <div className="space-y-1.5">
                {rows.map((r) => (
                  <div key={r.n} className="flex items-center justify-between gap-2 rounded-lg border border-dark-border bg-dark-bg px-2.5 py-1.5">
                    <span dir="rtl" lang="ar" className="text-[0.84rem] text-dark-text">{r.ar}</span>
                    <CopyButton text={r.ar} />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Field label="One-off (optional)" labelAr="دفعة واحدة">
          <div className="flex gap-2">
            <input
              value={multi}
              onChange={(e) => setMulti(e.target.value)}
              placeholder="e.g. Uthman ibn Affan"
              className="flex-1 rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-[0.8rem] text-dark-text outline-none focus:border-qsis placeholder:text-dark-text3 min-w-[220px]"
            />
            <Btn
              onClick={() => {
                if (multi.trim()) setInput((old) => (old ? old + '\n' + multi.trim() : multi.trim()));
              }}
            >
              Add
            </Btn>
          </div>
        </Field>
      </div>

      <Note>
        Converts a name to “Last, Initial.” citation form and offers the Arabic script. Transliteration is phonetic and approximate — confirm with your supervisor or the source before publishing.
      </Note>
    </div>
  );
}