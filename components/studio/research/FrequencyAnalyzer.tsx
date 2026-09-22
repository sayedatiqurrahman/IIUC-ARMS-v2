'use client';

import { useMemo, useState } from 'react';
import { analyzeText } from '@/lib/research/analyzer';
import { Field, TextArea } from './ui';

function fmtMin(m: number): string {
  if (m < 1) return `${Math.round(m * 60)} sec`;
  return `${Math.round(m * 10) / 10} min`;
}

export default function FrequencyAnalyzer() {
  const [text, setText] = useState('');

  const stats = useMemo(() => (text.trim() ? analyzeText(text) : null), [text]);
  const isArabic = /[\u0600-\u06FF]/.test(text);

  return (
    <div className="space-y-4">
      <Field label="Text to analyze" labelAr="النص للتحليل">
        <TextArea
          placeholder="Any passage — frequency, word counts, bigrams and reading time are computed locally."
          value={text}
          onChange={(e) => setText(e.target.value)}
          dir={isArabic ? 'rtl' : undefined}
        />
      </Field>

      {stats && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              ['Words', stats.words],
              ['Characters', `${stats.chars} / ${stats.charsNoSpace}`],
              ['Sentences', stats.sentences],
              ['Reading time', fmtMin(stats.readingMinutes)],
              ['Unique words', stats.uniqueWords],
              ['Lexical density', `${Math.round(stats.ttr * 100)}%`],
              ['Avg sentence', `${Math.round(stats.avgSentenceLen * 10) / 10} words`],
              ['Paragraphs', stats.paragraphs],
            ].map(([label, val]) => (
              <div key={String(label)} className="rounded-xl border border-dark-border bg-dark-bg p-3">
                <div className="text-[0.62rem] text-dark-text3">{label}</div>
                <div className="text-[0.9rem] font-bold text-dark-text mt-0.5" dir="auto">{String(val)}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="mb-1.5 text-[0.7rem] font-semibold text-dark-text2">Word frequency (top 40)</div>
              <div className="space-y-1">
                {stats.frequency.slice(0, 15).map((r) => (
                  <FrequencyBar key={r.word} word={r.word} count={r.count} pct={r.pct} max={stats.frequency[0]?.count || 1} isArabic={isArabic} />
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-[0.7rem] font-semibold text-dark-text2">Common word pairs (English)</div>
              <div className="space-y-1">
                {stats.bigrams.length === 0 && <p className="text-[0.7rem] text-dark-text3">No bigrams (works best on English text).</p>}
                {stats.bigrams.slice(0, 15).map((r) => (
                  <FrequencyBar key={r.word} word={r.word} count={r.count} pct={r.pct} max={stats.bigrams[0]?.count || 1} isArabic={false} />
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function FrequencyBar({ word, count, pct, max, isArabic }: { word: string; count: number; pct: number; max: number; isArabic: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[0.7rem]">
      <span className="w-28 truncate text-dark-text" dir="auto">{word}</span>
      <div className="flex-1 h-2 rounded-full bg-dark-bg overflow-hidden">
        <div className="h-full rounded-full bg-qsis/70" style={{ width: `${(count / max) * 100}%` }} />
      </div>
      <span className="w-8 text-right text-dark-text3">{count}</span>
      <span className="w-12 text-right text-dark-text3">{pct.toFixed(1)}%</span>
    </div>
  );
}