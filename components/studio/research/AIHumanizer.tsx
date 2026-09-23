'use client';

import { useMemo, useRef, useState } from 'react';
import { assessAILikeness } from '@/lib/research/ai-detect';
import { humanizeReport } from '@/lib/research/humanize';
import { findMatchesIn } from '@/lib/research/plagiarism';
import { extractTextFromFile } from '@/lib/research/file-extract';
import { DEMO_TEXT_EN } from '@/lib/research/demo-data';
import { downloadDocxReport } from '@/lib/research/report-docx';
import { useLocale } from './locale';
import { Btn, CopyButton, Field, Note, outBoxCls, TextArea } from './ui';

const aiColor = (s: number) => (s <= 35 ? '#22c55e' : s < 62 ? '#facc15' : '#ef4444');

export default function AIHumanizer() {
  const { lang } = useLocale();
  const isAr = lang === 'ar';
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [applied, setApplied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const verdict = useMemo(() => (text.trim().length > 10 ? assessAILikeness(text) : null), [text]);
  const report = useMemo(() => (text.trim().length > 10 ? humanizeReport(text) : null), [text, applied]);
  const repeats = useMemo(() => (text.trim().length > 10 ? findMatchesIn(text) : null), [text]);
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  const L = {
    input: isAr ? 'الصق النص أو ارفع ملفا' : 'Paste your text or upload a file',
    choose: isAr ? 'رفع ملف' : 'Upload file',
    drop: isAr ? 'يُقرأ الملف محليا فقط (.docx / .pdf / .txt)' : 'read locally only (.docx / .pdf / .txt)',
    verdict: isAr ? 'نتيجة الفحص' : 'Verdict',
    scan: isAr ? 'تمييز الجمل الملونة' : 'Sentence scan',
    rewrite: isAr ? 'اقتراحات إعادة الصياغة' : 'Rewrite suggestions',
    applyAll: isAr ? 'تطبيق أفضل الاقتراحات' : 'Apply best suggestions',
    reset: isAr ? 'إعادة النص الأصلي' : 'Reset',
    flagged: isAr ? 'جملة تشبه الصياغة الآلية' : 'AI-like phrase',
    noFlags: isAr ? 'لا توجد صياغات مشكوك فيها.' : 'No obvious formulaic phrasing.',
    current: isAr ? 'النص الحالي' : 'Current text',
    demo: isAr ? 'جرّب نصا تجريبيا' : 'Try demo text',
    open: isAr ? 'اختيار ملف…' : 'Choose file…',
    report: isAr ? 'تحميل التقرير (.docx)' : 'Download report (.docx)',
  };

  const handleFile = async (f: File) => {
    setErr('');
    setBusy(true);
    try {
      const res = await extractTextFromFile(f);
      setText(res.text);
      setApplied(false);
    } catch (e: any) {
      setErr(e?.message || 'Could not read the file');
    } finally {
      setBusy(false);
    }
  };

  const applyAll = () => {
    if (!report) return;
    let out = text;
    for (const s of report.sentences) {
      if (s.alternatives.length > 0) {
        out = out.replace(s.original, s.alternatives[0]);
      }
    }
    setText(out);
    setApplied(true);
  };

  const exportDocx = async () => {
    if (!verdict || !report || !repeats) return;
    await downloadDocxReport({
      fileName: 'pasted-text.txt',
      aiScore: verdict.score,
      aiLabel: verdict.label,
      aiColor: aiColor(verdict.score),
      overview: [
        { label: isAr ? 'الجمل' : 'Sentences', value: String(verdict.sentences.length) },
        { label: isAr ? 'الكلمات' : 'Words', value: String(wordCount) },
        { label: isAr ? 'جمل مشكوك فيها' : 'AI-like sentences', value: String(verdict.sentences.filter((s) => s.score > 35).length) },
        { label: isAr ? 'التكرار' : 'Repetition', value: `${repeats.repeatPercent.toFixed(1)}%` },
      ],
      sentences: verdict.sentences.map((s) => ({
        text: s.sentence,
        score: s.score,
        color: aiColor(s.score),
        label: s.label,
        hits: s.hits || [],
      })),
      rewrites: report.sentences.map((s) => ({ original: s.original, alternatives: s.alternatives })),
      repeats: {
        percent: repeats.repeatPercent,
        totalRepeatWords: repeats.totalRepeatWords,
        totalWords: repeats.totalWords,
        hits: repeats.hits,
      },
      text,
      lang: isAr ? 'ar' : 'en',
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Field label={L.input} labelAr={isAr ? undefined : 'الصق النص أو ارفع ملفا'}>
          <div className="flex gap-2">
            <TextArea className="min-h-[9rem]" placeholder={isAr ? 'الصق فقرتك الأكاديمية هنا… أو ارفع ملفا' : 'Paste your academic paragraph… or upload a file'} value={text} onChange={(e) => { setText(e.target.value); setApplied(false); }} dir={isAr ? 'rtl' : undefined} />
          </div>
        </Field>
        <div className="shrink-0 flex flex-col items-start gap-1.5">
          <Btn type="button" onClick={() => fileRef.current?.click()} title={L.open}>{L.choose}</Btn>
          <input ref={fileRef} type="file" accept=".txt,.md,.docx,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
          <span className="text-[0.62rem] text-dark-text3">{L.drop}</span>
          {busy && <span className="text-[0.65rem] text-qsis">{isAr ? 'قراءة الملف…' : 'Reading…'}</span>}
          {err && <span className="text-[0.65rem] text-red-400">{err}</span>}
        </div>
      </div>

      {verdict && report && (
        <>
          <div className="rounded-xl border border-dark-border bg-dark-bg p-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[0.68rem] text-dark-text3">{L.verdict}</div>
              <div className="text-2xl font-black text-dark-text">{verdict.score}%</div>
              <div className="text-[0.72rem] font-semibold" style={{ color: aiColor(verdict.score) }}>{verdict.label}</div>
            </div>
            <div className="w-40 h-2.5 rounded-full bg-dark-bg overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${verdict.score}%`, background: aiColor(verdict.score) }} />
            </div>
            <div className="text-[0.7rem] text-dark-text3 grid gap-0.5">
              <span>{isAr ? 'جمل:' : 'sentences:'} {verdict.sentences.length}</span>
              <span>{isAr ? 'عبارات مشكوك فيها:' : 'AI-like sentences:'} {verdict.sentences.filter((s) => s.score > 35).length}</span>
            </div>
          </div>

          <div className="rounded-xl border border-dark-border bg-dark-bg p-3">
            <p className="mb-2 text-[0.7rem] font-bold text-dark-text">{L.scan}</p>
            <div className="text-[0.78rem] leading-loose" dir="auto">
              {verdict.sentences.map((s) => (
                <span key={s.index} className="rounded px-0.5" style={{ backgroundColor: `${aiColor(s.score)}22`, borderBottom: `2px solid ${aiColor(s.score)}` }}>
                  {s.sentence}{' '}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-dark-border bg-dark-bg p-3">
            <p className="mb-2 text-[0.7rem] font-bold text-dark-text">{L.rewrite}</p>
            {report.sentences.filter((s) => s.alternatives.length > 0).length === 0 ? (
              <p className="text-[0.72rem] text-emerald-400">{L.noFlags}</p>
            ) : (
              <div className="space-y-2">
                {report.sentences.map((s) => (
                  <div key={s.index} className={`rounded-lg border p-2.5 ${s.alternatives.length === 0 ? 'border-dark-border bg-dark-bg2/40' : 'border-amber-700/30 bg-amber-900/10'}`}>
                    <div className="text-[0.72rem] text-dark-text" dir="auto">{s.original}</div>
                    {s.alternatives.length > 0 && (
                      <ul className="mt-1.5 space-y-1">
                        {s.alternatives.map((a, i) => (
                          <li key={i} className="text-[0.7rem] text-emerald-300 leading-relaxed" dir="auto">• {a}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Btn onClick={applyAll} disabled={applied}>{L.applyAll}</Btn>
                  <Btn variant="ghost" onClick={() => { setApplied(false); }}>{L.reset}</Btn>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[0.7rem] font-semibold text-dark-text2">{L.current}</span>
            <div className="flex items-center gap-2">
              <Btn variant="ghost" onClick={() => { setText(DEMO_TEXT_EN); setApplied(false); }}>{L.demo}</Btn>
              <Btn variant="ghost" onClick={exportDocx}>
                <i className="material-symbols-outlined align-middle text-sm">download</i>{' '}{L.report}
              </Btn>
              <CopyButton text={text} />
            </div>
          </div>
          <div className={outBoxCls} dir="auto">{text || <span className="text-dark-text3">{isAr ? 'الصق نصا للبدء.' : 'Paste text to begin.'}</span>}</div>

          <Note>
            {isAr
              ? 'كل شيء يعمل في متصفحك — لا يُرسل النص في أي مكان. الفحص سطحي (إحصائي) وليس نموذج ذكاء اصطناعي، لذا راجِع الاقتراحات بعناية قبل اعتمادها.'
              : 'Everything runs in your browser — nothing is sent anywhere. The scan is heuristic (statistical), not an ML model, so review suggestions carefully before relying on them.'}
          </Note>
        </>
      )}
    </div>
  );
}