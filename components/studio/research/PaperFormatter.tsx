'use client';

import { useState } from 'react';
import { guideSectionsCopy, PAPER_GUIDES } from '@/lib/research/paper-format';
import { useLocale } from './locale';
import { Btn, CopyButton, Note, outBoxCls, Select } from './ui';

export default function PaperFormatter() {
  const { lang } = useLocale();
  const [guideId, setGuideId] = useState(PAPER_GUIDES[0].id);

  const guide = PAPER_GUIDES.find((g) => g.id === guideId) || PAPER_GUIDES[0];
  const isAr = lang === 'ar';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={guideId} onChange={(e) => setGuideId(e.target.value)} className="max-w-[260px]">
          {PAPER_GUIDES.map((g) => (
            <option key={g.id} value={g.id}>{isAr ? g.nameAr : g.name}</option>
          ))}
        </Select>
        <span className="text-[0.68rem] text-dark-text3">
          {isAr ? 'قالب العناوين وقواعد التنسيق للبحث أو الرسالة — قابل للنسخ.' : 'Section roadmap + formatting rules for your paper or thesis — copyable.'}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-2">
          {guide.sections.map((s, i) => (
            <div key={i} className="rounded-xl border border-dark-border bg-dark-bg p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[0.8rem] font-bold text-qsis" dir={s.ar && s.en.includes('صفحة العنوان') ? 'rtl' : undefined}>
                  <>{isAr && /[\u0600-\u06FF]/.test(s.en) ? <span className="text-dark-text" dir="rtl">{s.en}</span> : s.en}</>
                </h3>
                <CopyButton text={`${s.en}\n${s.notes.map((n) => `- ${n}`).join('\n')}`} />
              </div>
              {isAr && s.en.includes('صفحة العنوان') && <div className="text-[0.7rem] text-dark-text3" dir="rtl">{s.en}</div>}
              {s.notes && s.notes.length > 0 && (
                <ul className="mt-1.5 space-y-1">
                  {s.notes.map((n, j) => (
                    <li key={j} className="text-[0.7rem] text-dark-text2 leading-relaxed flex gap-1.5"><span className="text-qsis">•</span><span>{n}</span></li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-qsis/30 bg-qsis/5 p-3">
            <p className="mb-2 text-[0.72rem] font-bold text-dark-text">{isAr ? 'قواعد التنسيق' : 'Formatting rules'}</p>
            <ul className="space-y-2">
              {guide.rules.map((r, i) => (
                <li key={i} className="text-[0.7rem] text-dark-text2 leading-relaxed flex gap-1.5">
                  <span className="text-qsis">{i + 1}.</span>
                  <span>{isAr ? r.ar : r.en}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-2">
            <CopyButton label={isAr ? 'نسخ الخطة كاملة' : 'Copy full outline'} text={guideSectionsCopy(guide)} />
            <Btn variant="ghost" onClick={() => setGuideId((g) => PAPER_GUIDES[(PAPER_GUIDES.findIndex((x) => x.id === g) + 1) % PAPER_GUIDES.length].id)}>
              {isAr ? 'قالب آخر' : 'Next template'}
            </Btn>
          </div>
          <div className={outBoxCls} dir="auto">{guide.sections.map((s) => s.en).join('\n\n')}</div>
        </div>
      </div>

      <Note>
        {isAr
          ? 'هذا دليل تنسيق، وليس أداة إنشاء وثائق. طبّقه داخل Word / LaTeX، وراجع قالب جامعتك قبل التسليم.'
          : 'A formatting guide, not a document builder. Apply it in Word/LaTeX and always check your university’s own template first.'}
      </Note>
    </div>
  );
}