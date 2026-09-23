'use client';

import { useMemo, useState } from 'react';
import { CITE_STYLES, verifyCitation, type CiteStyle } from '@/lib/research/cite-check';
import { useLocale } from './locale';
import { Field, Note, outBoxCls, Select, TextArea } from './ui';

export default function CiteCheck() {
  const { lang } = useLocale();
  const [text, setText] = useState('');
  const [forced, setForced] = useState<'auto' | CiteStyle>('auto');

  const report = useMemo(() => {
    const t = text.trim();
    if (t.length < 10) return null;
    return verifyCitation(t, forced === 'auto' ? undefined : forced);
  }, [text, forced]);

  const isAr = lang === 'ar';
  const L = {
    input: isAr ? 'الصق الاستشهاد هنا' : 'Paste a citation to verify',
    placeholder: isAr ? 'على سبيل المثال: محمد، أ (2019). أثر التغذية الراجعة على أداء الطلاب. مجلة العلوم التربوية، 5(2)، 1-12.' : 'e.g. Rahman, M. A. (2019). Feedback and performance. Journal of Education, 5(2), 1-12. https://doi.org/…',
    style: isAr ? 'النمط' : 'Style',
    auto: isAr ? 'تلقائي' : 'Auto-detect',
    verdict: isAr ? 'النتيجة' : 'Verdict',
    checks: isAr ? 'العناصر التي تم فحصها' : 'Checks',
    missing: isAr ? 'بهذه العناصر' : 'with these elements',
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={forced} onChange={(e) => setForced(e.target.value as 'auto' | CiteStyle)} className="max-w-[220px]">
          <option value="auto">{L.auto}</option>
          {CITE_STYLES.map((s) => (
            <option key={s.id} value={s.id}>{lang === 'ar' ? s.labelAr : s.label}</option>
          ))}
        </Select>
        <span className="text-[0.68rem] text-dark-text3">
          {isAr ? 'يُفحص الإكتمال والشكل محليا — لا يتصل بأي قاعدة بيانات.' : 'Checks completeness & shape locally — it does not look the work up anywhere.'}
        </span>
      </div>

      <Field label={L.input} labelAr={isAr ? undefined : 'الصق الاستشهاد هنا'}>
        <TextArea
          placeholder={L.placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          dir={isAr || /[\u0600-\u06FF]/.test(text) ? 'rtl' : undefined}
        />
      </Field>

      {report && (
        <>
          <div className="rounded-xl border border-dark-border bg-dark-bg p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[0.68rem] text-dark-text3">{L.style}</div>
              <div className="text-[0.85rem] font-bold text-qsis">{report.styleLabel}</div>
            </div>
            <div className="text-right">
              <div className="text-[0.68rem] text-dark-text3">{L.verdict}</div>
              <div className={`text-[0.85rem] font-bold ${report.score >= 80 ? 'text-emerald-400' : report.score >= 50 ? 'text-amber-300' : 'text-red-400'}`}>
                {report.score}% — {report.verdict}
              </div>
            </div>
            <div className="w-40 h-2.5 rounded-full bg-dark-bg overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${report.score}%`, background: report.score >= 80 ? '#22c55e' : report.score >= 50 ? '#facc15' : '#ef4444' }} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {report.items.map((it) => (
              <div key={it.key} className={`rounded-xl border p-3 text-[0.73rem] ${it.ok ? 'border-emerald-700/40 bg-emerald-900/10' : 'border-red-700/40 bg-red-900/10'}`}>
                <div className="flex items-center gap-2 font-semibold text-dark-text">
                  <span className={it.ok ? 'text-emerald-400' : 'text-red-400'}>{it.ok ? '✔' : '✘'}</span>
                  <span>{isAr ? it.labelAr : it.label}</span>
                </div>
                <div className="mt-0.5 text-dark-text2">{it.detail}</div>
                {it.tip && <div className="mt-1 text-[0.65rem] text-dark-text3">{it.tip}</div>}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[0.7rem] font-semibold text-dark-text2">{L.checks}</span>
          </div>
          <div dir="auto" className={outBoxCls}>{text}</div>

          <Note>
            {isAr
              ? 'هذه أداة فحص شكلي فقط: تتحقق من أن العناصر الأساسية (المؤلف، السنة، العنوان، المجلد، الصفحات، DOI/الرابط) موجودة ومكتوبة بصيغة سليمة. لا يمكنها التحقق من وجود المصدر نفسه أو دقة بياناته — تأكد يدويا من المصادر قبل النشر.'
              : 'A formatting check only: it confirms the essential pieces (author, year, title, journal/volume, pages, DOI/URL) are present and well-formed. It cannot confirm the source exists or that its details are real — always verify citations against the actual publication.'}
          </Note>
        </>
      )}
    </div>
  );
}