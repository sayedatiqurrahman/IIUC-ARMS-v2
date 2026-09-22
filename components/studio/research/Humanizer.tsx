'use client';

import { useMemo, useState } from 'react';
import { HUMANIZE_NOTE, humanizeReport } from '@/lib/research/humanize';
import { Btn, CopyButton, Field, Note, outBoxCls, TextArea } from './ui';

export default function Humanizer() {
  const [text, setText] = useState('');
  const [applied, setApplied] = useState(false);

  const report = useMemo(() => (text.trim().length > 20 ? humanizeReport(text) : null), [text, applied]);

  const replaceClichés = () => {
    const rep = humanizeReport(text);
    setText(rep.rewrite);
    setApplied(true);
  };

  return (
    <div className="space-y-4">
      <Field label="Your draft" labelAr="مسودتك">
        <TextArea placeholder="Paste your academic paragraph…" value={text} onChange={(e) => setText(e.target.value)} />
      </Field>

      {report && (
        <>
          {report.issues.length === 0 ? (
            <p className="text-[0.75rem] text-emerald-400">No obvious AI-typical phrases found.</p>
          ) : (
            <div className="rounded-xl border border-dark-border bg-dark-bg p-3">
              <p className="mb-2 text-[0.72rem] font-bold text-dark-text">
                {report.issues.length} formulaic pattern(s) detected — consider replacing:
              </p>
              <ul className="space-y-1.5">
                {report.issues.map((i) => (
                  <li key={i.phrase} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[0.72rem]">
                    <span className="text-red-400 font-semibold">“{i.phrase}”</span>
                    <span className="text-dark-text3">×{i.count} →</span>
                    <span className="text-emerald-300">{i.suggestion}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <Btn onClick={replaceClichés} disabled={text !== report.rewrite && applied}>
                  Apply replacements ({report.changed} change{report.changed === 1 ? '' : 's'})
                </Btn>
                {report.longSentences.length > 0 && (
                  <span className="text-[0.7rem] text-amber-300/90 self-center">
                    ⚠ {report.longSentences.length} sentence(s) ≥ 45 words — split them for readability.
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-[0.7rem] font-semibold text-dark-text2">Current draft</span>
            <CopyButton text={text} />
          </div>
          <div className={outBoxCls}>{text || <span className="text-dark-text3">Paste a draft to begin.</span>}</div>

          <Note>{HUMANIZE_NOTE}</Note>
        </>
      )}
    </div>
  );
}