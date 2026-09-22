'use client';

import { useMemo, useState } from 'react';
import { findMatchesIn, overlapBetween } from '@/lib/research/plagiarism';
import { Field, Note, outBoxCls, TextArea } from './ui';

export default function Plagiarism() {
  const [docA, setDocA] = useState('');
  const [docB, setDocB] = useState('');

  const self = useMemo(() => (docA.trim().length > 40 ? findMatchesIn(docA) : null), [docA]);
  const pair = useMemo(
    () => (docA.trim().length > 80 && docB.trim().length > 80 ? overlapBetween(docA, docB) : null),
    [docA, docB]
  );

  const level = (pct: number) =>
    pct < 10 ? 'Low' : pct < 30 ? 'Moderate' : 'High';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4">
        <Field label="Document A" labelAr="المستند أ">
          <TextArea placeholder="Paste your main document…" value={docA} onChange={(e) => setDocA(e.target.value)} />
        </Field>
        <Field label="Document B — paste a second draft to compare overlap" labelAr="المستند ب">
          <TextArea placeholder="Optional: second text for pairwise overlap…" value={docB} onChange={(e) => setDocB(e.target.value)} />
        </Field>
      </div>

      {self && (
        <div className="rounded-xl border border-dark-border bg-dark-bg p-3">
          <p className="mb-1 text-[0.72rem] font-bold text-dark-text">
            In-document duplicated phrases ({self.hits.length}):{' '}
            <span className={self.repeatPercent > 15 ? 'text-red-400' : 'text-emerald-400'}>
              {Math.round(self.repeatPercent)}%
            </span>{' '}
            repetition ({self.totalRepeatWords} repeated words / {self.totalWords})
          </p>
          {self.hits.length === 0 ? (
            <p className="text-[0.7rem] text-dark-text3">No 6+ word duplicate runs found. Good.</p>
          ) : (
            <ul className="space-y-1 text-[0.72rem] text-dark-text2 mt-2">
              {self.hits.slice(0, 10).map((h) => (
                <li key={h.phrase} className="flex items-start gap-2">
                  <span className="text-red-400/80">{h.occurrences}×</span>
                  <span className="break-words">“{h.phrase}”</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {pair && (
        <div className="rounded-xl border border-dark-border bg-dark-bg p-3">
          <p className="text-[0.72rem] font-bold text-dark-text">
            Overlap with document B:{' '}
            <span className={pair.overlapPercent > 30 ? 'text-red-400' : 'text-emerald-400'}>
              {pair.overlapPercent}% ({level(pair.overlapPercent)})
            </span>
          </p>
        </div>
      )}

      <Note>
        Offline only — it finds repeated phrases within your own paste and overlap between two texts.
        It does <strong>not</strong> search the internet or any academic database. For real plagiarism checks against published work,
        use your institution’s Turnitin/iThenticate or a web corpus tool.
      </Note>
    </div>
  );
}