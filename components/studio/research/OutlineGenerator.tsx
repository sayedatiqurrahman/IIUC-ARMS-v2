'use client';

import { useState } from 'react';
import { DISSERTATION_OUTLINE, STANDARD_OUTLINE, type OutlineTemplate } from '@/lib/research/outline';
import { Btn, CopyButton } from './ui';

export default function OutlineGenerator() {
  const [template, setTemplate] = useState<OutlineTemplate>(STANDARD_OUTLINE);
  const [includeAr, setIncludeAr] = useState(true);
  const [topic, setTopic] = useState('');

  const renderBullet = (b: string, bAr: string, i: number) => (
    <li key={i} className="leading-relaxed">
      <span>{b}</span>
      {includeAr && bAr && <span dir="rtl" lang="ar" className="ml-2 text-dark-text3">— {bAr}</span>}
    </li>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <select
          value={template.title}
          onChange={(e) => setTemplate(e.target.value === 'Thesis' ? DISSERTATION_OUTLINE : STANDARD_OUTLINE)}
          className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-[0.78rem] text-dark-text outline-none focus:border-qsis"
        >
          <option>{STANDARD_OUTLINE.title}</option>
          <option>Thesis</option>
        </select>
        <label className="flex items-center gap-2 text-[0.72rem] text-dark-text2 cursor-pointer">
          <input type="checkbox" checked={includeAr} onChange={(e) => setIncludeAr(e.target.checked)} className="accent-[#22c55e]" />
          Include Arabic headings
        </label>
      </div>

      <div>
        <label className="mb-1.5 block text-[0.7rem] font-semibold text-dark-text2">Your topic (optional) — added under the title</label>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. The role of Islamic finance in economic development  /  دور التمويل الإسلامي في التنمية الاقتصادية"
          className="w-full rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-[0.8rem] text-dark-text outline-none focus:border-qsis placeholder:text-dark-text3"
        />
      </div>

      <div className="space-y-3">
        {template.sections.map((s) => (
          <div key={s.heading} className="rounded-xl border border-dark-border bg-dark-bg p-3">
            <p className="mb-1.5 text-[0.8rem] font-bold text-dark-text flex flex-wrap gap-2">
              {s.heading}
              {includeAr && <span dir="rtl" lang="ar" className="font-normal text-dark-text3">({s.headingAr})</span>}
            </p>
            <ul className="space-y-0.5 text-[0.74rem] text-dark-text2">{s.bullets.map((b, i) => renderBullet(b, s.bulletsAr[i], i))}</ul>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Btn
          onClick={() => {
            setTemplate((t) =>
              t.title === STANDARD_OUTLINE.title ? DISSERTATION_OUTLINE : STANDARD_OUTLINE
            );
          }}
        >
          Switch to {template.title === STANDARD_OUTLINE.title ? 'Thesis' : 'Standard'} outline
        </Btn>
        <CopyButton
          label="Copy outline"
          text={[
            topic ? `Title: ${topic}` : '',
            ...template.sections.flatMap((s) => [
              s.heading,
              ...s.bullets.map((b, i) => (includeAr ? `  - ${b} (${s.bulletsAr[i]})` : `  - ${b}`)),
            ]),
          ]
            .filter(Boolean)
            .join('\n')}
        />
      </div>
    </div>
  );
}