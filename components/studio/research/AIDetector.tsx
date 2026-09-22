'use client';

import { useMemo, useState } from 'react';
import { assessAILikeness } from '@/lib/research/ai-detect';
import { Field, Note, TextArea } from './ui';

const COLORS: Record<string, string> = {
  'Likely human': 'text-emerald-400',
  'Uncertain — mix of human & AI traits': 'text-amber-300',
  'Highly formulaic': 'text-red-400',
};

export default function AIDetector() {
  const [text, setText] = useState('');
  const res = useMemo(() => (text.trim().length > 40 ? assessAILikeness(text) : null), [text]);
  const isArabic = /[\u0600-\u06FF]/.test(text);

  const gauge = res ? Math.min(100, Math.max(0, res.score)) : 0;

  return (
    <div className="space-y-4">
      <Field label="Text to scan (min ~40 words)" labelAr="النص المراد فحصه">
        <TextArea
          placeholder="Paste your passage…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          dir={isArabic ? 'rtl' : undefined}
        />
      </Field>

      {res && (
        <>
          <div className="rounded-xl border border-dark-border bg-dark-bg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[0.7rem] font-semibold text-dark-text2">Formulaic-likeness score</span>
              <span className={`text-[0.85rem] font-bold ${COLORS[res.label] || 'text-dark-text'}`}>{res.label}</span>
            </div>
            <div className="h-2.5 rounded-full bg-dark-bg overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${gauge}%`, background: `${gauge < 35 ? '#22c55e' : gauge < 62 ? '#facc15' : '#ef4444'}` }} />
            </div>
            <div className="mt-1 flex justify-between text-[0.62rem] text-dark-text3">
              <span>0 · natural, varied</span>
              <span>50 · mixed</span>
              <span>100 · uniform, formulaic</span>
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[0.72rem]">
              <Signal label="Avg sentence" value={`${Math.round(res.signals.avgSentenceLen * 10) / 10} w`} hint="AI text often 15–22" />
              <Signal label="Rhythm (CV)" value={`${Math.round(res.signals.sentenceLenCv * 100)}%`} hint="lower = more uniform" />
              <Signal label="Vocab richness" value={`${Math.round(res.signals.uniqueRatio * 100)}%`} hint="low = repetitive vocabulary" />
              <Signal label="Cliche hits" value={`${Math.round(res.signals.clichePerSentence * 100) / 100}/sent`} hint="formulaic phrases found" />
            </div>
          </div>

          <Note>
            Heuristic surface analysis only — it looks at text *statistics* (sentence-rhythm uniformity, vocabulary diversity,
            long-sentence share, formulaic phrases), not model probabilities. So it can be wrong in both directions and no institution
            treats it as evidence. Use it to spot patterns worth revising, not as a verdict.
          </Note>
        </>
      )}
    </div>
  );
}

function Signal({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-dark-border bg-dark-bg2 p-2.5">
      <div className="text-dark-text2 font-semibold">{value}</div>
      <div className="text-dark-text3 text-[0.62rem]">{label}</div>
      <div className="text-dark-text3 text-[0.6rem] mt-0.5">{hint}</div>
    </div>
  );
}