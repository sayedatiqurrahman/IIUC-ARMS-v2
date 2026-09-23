'use client';

import { useState } from 'react';
import { STANDARD_OUTLINE, DISSERTATION_OUTLINE, type OutlineSection, type OutlineTemplate } from '@/lib/research/outline';
import { PAPER_GUIDES, type PaperFormatGuide } from '@/lib/research/paper-format';
import { useLocale } from './locale';
import { Btn, CopyButton, Note, Select } from './ui';

// Match a formatter-guide section onto the content bullets of the outline
// template, by keyword (works for both Standard and Thesis structures).
const SECTION_RULES: RegExp[] = [
  /(introduction|intro|مقدمة)/i,
  /(literature|دراسات|سابقة|الإطار|framework)/i,
  /(method|منهج)/i,
  /(result|نتائج|findings)/i,
  /(discussion|مناقش)/i,
  /(conclusion|خاتمة|خلاص)/i,
  /(reference|bibliograph|مراجع)/i,
];

function matchOutline(enOrAr: string, template: OutlineTemplate): OutlineSection | null {
  const lower = enOrAr.toLowerCase();
  for (const re of SECTION_RULES) {
    if (!re.test(lower)) continue;
    const found = template.sections.find((s) => re.test(s.heading.toLowerCase() + ' ' + (s.headingAr || '').toLowerCase()));
    return found || null;
  }
  return null;
}

function fullCopy(guide: PaperFormatGuide, template: OutlineTemplate, topic: string, includeAr: boolean): string {
  const lines: string[] = [];
  if (topic.trim()) lines.push(`Title / العنوان: ${topic.trim()}`);
  lines.push(`${template.title}${includeAr ? ` — ${template.titleAr}` : ''}`);
  lines.push(`${guide.name}${includeAr ? ` — ${guide.nameAr}` : ''}`);
  for (let i = 0; i < guide.sections.length; i++) {
    const s = guide.sections[i];
    const os = matchOutline(s.en, template);
    lines.push(`\n${s.en}`);
    if (includeAr) lines.push(`${s.ar}`);
    for (const n of s.notes) lines.push(`  • ${n}`);
    if (os) {
      for (let j = 0; j < os.bullets.length; j++) {
        lines.push(`  - ${os.bullets[j]}${includeAr ? ' (العربية: ' + os.bulletsAr[j] + ')' : ''}`);
      }
    }
  }
  lines.push(`\nFormatting rules (${guide.name}):`);
  guide.rules.forEach((r) => lines.push(`  ${includeAr ? r.ar : r.en}`));
  return lines.join('\n');
}

export default function OutlineFormatter() {
  const { lang } = useLocale();
  const isAr = lang === 'ar';
  const [template, setTemplate] = useState<OutlineTemplate>(STANDARD_OUTLINE);
  const [guideId, setGuideId] = useState(PAPER_GUIDES[0].id);
  const [includeAr, setIncludeAr] = useState(false);
  const [topic, setTopic] = useState('');

  const guide = PAPER_GUIDES.find((g) => g.id === guideId) || PAPER_GUIDES[0];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-dark-border bg-dark-bg p-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          <Select value={guideId} onChange={(e) => setGuideId(e.target.value)} className="max-w-[230px]">
            {PAPER_GUIDES.map((g) => (
              <option key={g.id} value={g.id}>{isAr ? g.nameAr : g.name}</option>
            ))}
          </Select>
          <Select value={template.title} onChange={(e) => setTemplate(e.target.value === 'Dissertation / Thesis Outline' ? DISSERTATION_OUTLINE : STANDARD_OUTLINE)} className="max-w-[220px]">
            <option value={STANDARD_OUTLINE.title}>{isAr ? (STANDARD_OUTLINE.titleAr) : STANDARD_OUTLINE.title}</option>
            <option value={DISSERTATION_OUTLINE.title}>{isAr ? DISSERTATION_OUTLINE.titleAr : DISSERTATION_OUTLINE.title}</option>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-[0.72rem] text-dark-text2 cursor-pointer">
          <input type="checkbox" checked={includeAr} onChange={(e) => setIncludeAr(e.target.checked)} className="accent-[#22c55e]" />
          {isAr ? 'إظهار العناوين العربية' : 'Include Arabic headings'}
        </label>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={isAr ? 'موضوعك (اختياري)' : 'Your topic (optional)'}
          className="min-w-[220px] flex-1 rounded-xl border border-dark-border bg-dark-bg2 px-3 py-2 text-[0.8rem] text-dark-text outline-none focus:border-qsis placeholder:text-dark-text3"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-2">
          {guide.sections.map((s, i) => {
            const os = matchOutline(s.en, template);
            return (
              <div key={i} className="rounded-xl border border-dark-border bg-dark-bg p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[0.8rem] font-bold text-dark-text flex flex-wrap gap-2">
                    <span dir="auto">{s.en}</span>
                    {includeAr && <span dir="rtl" lang="ar" className="font-normal text-dark-text3">{s.ar}</span>}
                  </h3>
                </div>
                <ul className="mt-1.5 space-y-1">
                  {s.notes.map((n, j) => (
                    <li key={j} className="text-[0.7rem] text-dark-text2 leading-relaxed flex gap-1.5"><span className="text-qsis">•</span><span>{n}</span></li>
                  ))}
                  {os && os.bullets.map((b, j) => (
                    <li key={`b${j}`} className="text-[0.7rem] text-dark-text2 leading-relaxed flex gap-1.5">
                      <span className="text-qsis/60">–</span>
                      <span className="flex flex-wrap gap-1.5">
                        {b}
                        {includeAr && <span dir="rtl" lang="ar" className="text-dark-text3">({os.bulletsAr[j]})</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-qsis/30 bg-qsis/5 p-3">
            <p className="mb-2 text-[0.72rem] font-bold text-dark-text">{isAr ? 'قواعد التنسيق' : 'Formatting rules'} — {isAr ? guide.nameAr : guide.name}</p>
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
            <CopyButton label={isAr ? 'نسخ الخطة كاملة' : 'Copy full outline'} text={fullCopy(guide, template, topic, includeAr)} />
            <Btn variant="ghost" onClick={() => setGuideId((g) => PAPER_GUIDES[(PAPER_GUIDES.findIndex((x) => x.id === g) + 1) % PAPER_GUIDES.length].id)}>
              {isAr ? 'قالب آخر' : 'Next template'}
            </Btn>
          </div>
          <Note>
            {isAr
              ? 'دمج بين خريطة البحث (الخطوط العريضة) ودليل التنسيق: خطوات الأقسام ومحتواها معا، وقواعد كل أسلوب توثيق.'
              : 'Combines the research outline (section roadmap + content bullets) with the formatting rules for each citation style.'}
          </Note>
        </div>
      </div>
    </div>
  );
}