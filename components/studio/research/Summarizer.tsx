'use client';

import { useMemo, useState } from 'react';
import { summarizeText } from '@/lib/research/summarizer';
import { analyzeText } from '@/lib/research/analyzer';
import { Btn, CopyButton, Field, Note, outBoxCls, Select, TextArea } from './ui';

export default function Summarizer() {
  const [text, setText] = useState('');
  const [ratio, setRatio] = useState(0.3);

  const result = useMemo(() => summarizeText(text, ratio), [text, ratio]);
  const before = useMemo(() => (text.trim() ? analyzeText(text) : null), [text]);

  const isArabic = /[\u0600-\u06FF]/.test(text);
  const summaryStr = result.sentences.join(' ');

  return (
    <div className="space-y-4">
      <Field label="Source text" labelAr="النص الأصلي">
        <TextArea
          placeholder="Paste your article, abstract or passage — Arabic or English, or a mix."
          value={text}
          onChange={(e) => setText(e.target.value)}
          dir={isArabic ? 'rtl' : undefined}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-[0.7rem] font-semibold text-dark-text2">Summary length: {Math.round(ratio * 100)}%</label>
        <input
          type="range"
          min={10}
          max={70}
          value={Math.round(ratio * 100)}
          onChange={(e) => setRatio(Number(e.target.value) / 100)}
          className="accent-[#22c55e] w-48"
        />
        {before && (
          <span className="text-[0.68rem] text-dark-text3">
            {before.words} words · {before.sentences} sentences · kept {result.kept}/{result.total}
          </span>
        )}
      </div>

      {result.sentences.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-[0.7rem] font-semibold text-dark-text2">Extractive summary</span>
            <CopyButton text={summaryStr} />
          </div>
          <div dir={isArabic ? 'rtl' : undefined} className={outBoxCls}>{summaryStr}</div>
          <Note>
            Extractive summary — it selects the highest-scoring original sentences in reading order (word-frequency + position scoring).
            It does not generate new sentences, so important context stays intact; always read the source for full meaning.
          </Note>
        </>
      )}
    </div>
  );
}