'use client';

import { useMemo, useState } from 'react';
import { extractTextFromFile, type ExtractResult } from '@/lib/research/file-extract';
import { analyzeText } from '@/lib/research/analyzer';
import { assessAILikeness } from '@/lib/research/ai-detect';
import { humanizeReport } from '@/lib/research/humanize';
import { findMatchesIn } from '@/lib/research/plagiarism';
import { useLocale } from './locale';
import { Btn, CopyButton, Note, outBoxCls } from './ui';

type Tab = 'overview' | 'scan' | 'rewrite' | 'repeat';

export default function FileVerify() {
  const { lang } = useLocale();
  const isAr = lang === 'ar';
  const [extracted, setExtracted] = useState<ExtractResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [drag, setDrag] = useState(false);

  const analysis = useMemo(() => {
    if (!extracted) return null;
    return {
      stats: analyzeText(extracted.text),
      ai: assessAILikeness(extracted.text),
      human: humanizeReport(extracted.text),
      repeats: findMatchesIn(extracted.text),
    };
  }, [extracted]);

  const onFile = async (f: File) => {
    setError('');
    setBusy(true);
    try {
      const res = await extractTextFromFile(f);
      setExtracted(res);
      setTab('overview');
    } catch (e: any) {
      setError(e?.message || 'Could not read the file');
    } finally {
      setBusy(false);
    }
  };

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: isAr ? 'نظرة عامة' : 'Overview' },
    { id: 'scan', label: isAr ? 'فحص الذكاء الاصطناعي' : 'AI scan' },
    { id: 'rewrite', label: isAr ? 'تحسين الصياغة' : 'Rewrites' },
    { id: 'repeat', label: isAr ? 'التكرار' : 'Repeats' },
  ];

  const aiColor = (s: number) => (s <= 35 ? '#22c55e' : s < 62 ? '#facc15' : '#ef4444');

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        className={`rounded-2xl border-2 border-dashed p-8 text-center transition ${drag ? 'border-qsis bg-qsis/10' : 'border-dark-border bg-dark-bg2/50'}`}
      >
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-qsis/15 text-qsis">
          <span className="material-symbols-outlined text-2xl">folder_open</span>
        </div>
        <p className="text-[0.8rem] font-semibold text-dark-text">
          {isAr ? 'احضِر ملفا لفحصه محليا' : 'Drop a file to verify it — entirely on your device'}
        </p>
        <p className="mt-1 text-[0.68rem] text-dark-text3">
          {isAr ? '.docx / .pdf / .txt — لا يُرفع شيء إلى أي خادم' : '.docx / .pdf / .txt — nothing is uploaded to any server'}
        </p>
        <label className="mt-4 inline-block cursor-pointer">
          <span className="rounded-xl bg-qsis px-4 py-2 text-[0.78rem] font-semibold text-white transition hover:brightness-110">
            {isAr ? 'اختيار ملف' : 'Choose a file'}
          </span>
          <input
            type="file"
            accept=".txt,.md,.docx,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = '';
            }}
          />
        </label>
        {busy && <p className="mt-3 text-[0.7rem] text-qsis">{isAr ? 'جارٍ استخراج النص…' : 'Extracting text…'}</p>}
        {error && <p className="mt-3 text-[0.7rem] text-red-400">{error}</p>}
      </div>

      {extracted && analysis && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex overflow-hidden rounded-xl border border-dark-border">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-2 text-[0.7rem] font-semibold transition cursor-pointer ${tab === t.id ? 'bg-qsis text-white' : 'bg-dark-bg2 text-dark-text2 hover:text-qsis'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <span className="text-[0.68rem] text-dark-text3">{extracted.fileName} · {extracted.words} {isAr ? 'كلمة' : 'words'}</span>
          </div>

          {tab === 'overview' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-dark-border bg-dark-bg p-4 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-[0.68rem] text-dark-text3">{isAr ? 'احتمال أن يكون النص مولدا بالذكاء الاصطناعي' : 'AI-generated likelihood'}</div>
                  <div className="text-2xl font-black text-dark-text">{analysis.ai.score}%</div>
                  <div className="text-[0.72rem] font-semibold" style={{ color: aiColor(analysis.ai.score) }}>{analysis.ai.label}</div>
                </div>
                <div className="w-40 h-2.5 rounded-full bg-dark-bg overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${analysis.ai.score}%`, background: aiColor(analysis.ai.score) }} />
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[0.72rem] text-dark-text2">
                  <Stat label={isAr ? 'الجمل' : 'Sentences'} value={String(analysis.stats.sentences)} />
                  <Stat label={isAr ? 'الكلمات' : 'Words'} value={String(analysis.stats.words)} />
                  <Stat label={isAr ? 'الحديثة الكثافة' : 'Lexical density'} value={`${Math.round(analysis.stats.ttr * 100)}%`} />
                  <Stat label={isAr ? 'التكرار' : 'Repetition'} value={`${analysis.repeats.repeatPercent.toFixed(1)}%`} />
                </div>
              </div>
              <div className={outBoxCls} dir="auto">{extracted.text}</div>
            </div>
          )}

          {tab === 'scan' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-[0.65rem]">
                <Legend color="#22c55e" label={isAr ? 'إنساني' : 'human'} />
                <Legend color="#facc15" label={isAr ? 'مشكوك' : 'uncertain'} />
                <Legend color="#ef4444" label={isAr ? 'يشبه الذكاء الاصطناعي' : 'AI-like'} />
              </div>
              <div className="rounded-xl border border-dark-border bg-dark-bg p-3 text-[0.78rem] leading-loose" dir="auto">
                {analysis.ai.sentences.map((s) => (
                  <span
                    key={s.index}
                    className="rounded px-0.5"
                    style={{ backgroundColor: `${aiColor(s.score)}22`, borderBottom: `2px solid ${aiColor(s.score)}` }}
                    title={`${s.score}% — ${s.label}`}
                  >
                    {s.sentence}{' '}
                  </span>
                ))}
              </div>
              <div className="space-y-1.5">
                {analysis.ai.sentences
                  .filter((s) => s.score > 35)
                  .map((s) => (
                    <div key={s.index} className="rounded-lg border border-dark-border bg-dark-bg2 p-2.5 text-[0.72rem]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold" style={{ color: aiColor(s.score) }}>{s.score}%</span>
                        <span className="text-dark-text3">#{s.index + 1}</span>
                      </div>
                      <div className="mt-1 text-dark-text " dir="auto">{s.sentence}</div>
                      {s.hits.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {s.hits.map((h) => (
                            <span key={h.phrase} className="rounded-full bg-red-900/30 border border-red-800/40 px-2 py-0.5 text-[0.62rem] text-red-300">
                              “{h.phrase}” → {h.suggestion}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {tab === 'rewrite' && (
            <div className="space-y-2">
              {analysis.human.sentences.map((s) => (
                <div key={s.index} className={`rounded-xl border p-3 ${s.alternatives.length === 0 ? 'border-dark-border bg-dark-bg2/40' : 'border-amber-700/30 bg-amber-900/10'}`}>
                  <div className="text-[0.7rem] text-dark-text" dir="auto">{s.original}</div>
                  {s.alternatives.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {s.alternatives.map((a, i) => (
                        <li key={i} className="text-[0.7rem] text-emerald-300 leading-relaxed" dir="auto">
                          {isAr ? 'بديل' : 'alt '}{i + 1}: {a}
                        </li>
                      ))}
                    </ul>
                  )}
                  {s.alternatives.length === 0 && <div className="mt-1 text-[0.65rem] text-dark-text3">{isAr ? 'لا توجد صياغات مشكوك فيها' : 'No formulaic phrasing.'}</div>}
                </div>
              ))}
            </div>
          )}

          {tab === 'repeat' && (
            <div className="space-y-2">
              <div className="rounded-xl border border-dark-border bg-dark-bg p-3 text-[0.72rem]">
                {isAr ? 'نسبة التكرار داخل المستند:' : 'In-document repeated phrases: '}
                <span className={analysis.repeats.repeatPercent > 15 ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>{analysis.repeats.repeatPercent.toFixed(1)}%</span>
                {' '}({analysis.repeats.totalRepeatWords} / {analysis.repeats.totalWords} {isAr ? 'كلمة' : 'words'})
              </div>
              {analysis.repeats.hits.slice(0, 15).map((h) => (
                <div key={h.phrase} className="rounded-lg border border-dark-border bg-dark-bg2 p-2.5 text-[0.72rem] flex gap-2">
                  <span className="text-red-400 font-semibold shrink-0">{h.occurrences}×</span>
                  <span className="text-dark-text" dir="auto">“{h.phrase}”</span>
                </div>
              ))}
              {analysis.repeats.hits.length === 0 && <p className="text-[0.7rem] text-dark-text3">{isAr ? 'لا يوجد تكرار للعبارات (6+ كلمات).' : 'No 6+ word duplicate runs.'}</p>}
            </div>
          )}

          <div className="flex items-center justify-between">
            <Btn variant="ghost" onClick={() => setExtracted(null)}>{isAr ? 'ملف آخر' : 'Another file'}</Btn>
            <CopyButton label={isAr ? 'نسخ النص' : 'Copy text'} text={extracted.text} />
          </div>
        </>
      )}

      <Note>
        {isAr
          ? 'يُستخرج النص داخل متصفحك فقط ثم تُجرى كل الفحوصات محليا. الملفات الممسوحة ضوئيا (صور داخل PDF) تحتاج إلى OCR ولا يدعمها هذا الاستخراج.'
          : 'Text is extracted and analysed entirely in your browser. Scanned/image-only PDFs need OCR and are not supported by this extractor.'}
      </Note>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[0.68rem] text-dark-text3">{label}</div>
      <div className="font-bold text-dark-text">{value}</div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-dark-border bg-dark-bg2 px-2.5 py-1 text-dark-text2">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}