'use client';

import { useMemo, useState } from 'react';
import { buildCitation, STYLE_LABELS, CITATION_FIELD_LABELS, type CitationFields, type CitationStyle } from '@/lib/research/citations';
import { Btn, CopyButton, Field, outBoxCls, Select, TextInput } from './ui';

export default function CitationGenerator() {
  const [fields, setFields] = useState<CitationFields>({
    type: 'journal',
    authors: '',
    year: '',
    title: '',
    publisher: '',
    journal: '',
    volume: '',
    issue: '',
    pages: '',
    url: '',
    doi: '',
    accessed: '',
    edition: '',
    city: '',
    titleAr: '',
    publisherAr: '',
  });
  const [refs, setRefs] = useState<string[]>([]);

  const set = (k: keyof CitationFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFields((f) => ({ ...f, [k]: e.target.value }));

  const citations = useMemo(() => {
    const rows: Partial<Record<CitationStyle, string>> = {};
    if (!fields.title.trim()) return rows;
    for (const style of ['apa', 'mla', 'chicago', 'ieee', 'ar'] as CitationStyle[]) {
      rows[style] = buildCitation(fields, style);
    }
    return rows;
  }, [fields]);

  const addToRefs = () => {
    const c = citations.apa || buildCitation(fields, 'apa');
    if (c) setRefs((r) => [...r, c]);
  };

  const visibleForType = (t: CitationFields['type']) =>
    t === 'journal' ? ['journal', 'volume', 'issue', 'pages'] : t === 'web' ? ['url', 'accessed'] : ['publisher', 'city'];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={CITATION_FIELD_LABELS.type}>
          <Select value={fields.type} onChange={set('type')}>
            <option value="journal">Journal article</option>
            <option value="book">Book</option>
            <option value="web">Website/online</option>
            <option value="thesis">Thesis/dissertation</option>
          </Select>
        </Field>
        <Field label={CITATION_FIELD_LABELS.year} labelAr="السنة">
          <TextInput placeholder="2024" value={fields.year} onChange={set('year')} />
        </Field>
      </div>
      <Field label={CITATION_FIELD_LABELS.authors} labelAr="المؤلف(ون)">
        <TextInput placeholder="Muhammad Ali Rahman  /  Rahman, M. A." value={fields.authors} onChange={set('authors')} />
      </Field>
      <Field label={CITATION_FIELD_LABELS.title} labelAr="العنوان">
        <TextInput placeholder="Impact of peer review on student performance" value={fields.title} onChange={set('title')} />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(visibleForType(fields.type) as string[]).map((key) => (
          <Field key={key} label={CITATION_FIELD_LABELS[key as keyof typeof CITATION_FIELD_LABELS]}>
            <TextInput value={fields[key as keyof CitationFields] as string} onChange={set(key as keyof CitationFields)} />
          </Field>
        ))}
      </div>

      <div className="rounded-xl border border-qsis/30 bg-qsis/5 px-3 py-2 text-[0.7rem] text-dark-text2">
        Arabic-source fields (for the APA-ar style):{' '}
        <span className="inline-flex gap-3">
          <input placeholder="العنوان بالعربية" value={fields.titleAr} onChange={set('titleAr')} className="w-40 rounded-lg border border-dark-border bg-dark-bg px-2 py-1 text-[0.7rem] outline-none focus:border-qsis" />
          <input placeholder="الناشر بالعربية" value={fields.publisherAr} onChange={set('publisherAr')} className="w-40 rounded-lg border border-dark-border bg-dark-bg px-2 py-1 text-[0.7rem] outline-none focus:border-qsis" />
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Btn onClick={addToRefs}>Add APA to list</Btn>
        <Btn variant="ghost" onClick={() => setRefs([])}>Clear list</Btn>
      </div>

      {Object.keys(citations).length === 0 ? (
        <p className="text-[0.7rem] text-dark-text3">Enter a title to preview citations in all five styles.</p>
      ) : (
        <div className="space-y-2">
          {(Object.entries(citations) as [CitationStyle, string][]).map(([style, text]) => (
            <div key={style} className="rounded-xl border border-dark-border bg-dark-bg p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[0.68rem] font-bold text-qsis">{STYLE_LABELS[style]}</span>
                <CopyButton text={text} />
              </div>
              <div dir={style === 'ar' ? 'rtl' : undefined} className={outBoxCls}>{text}</div>
            </div>
          ))}
        </div>
      )}

      {refs.length > 0 && (
        <div className="rounded-xl border border-dark-border bg-dark-bg2 p-3">
          <p className="mb-2 text-[0.7rem] font-bold text-dark-text flex items-center justify-between">
            <span>Reference list ({refs.length})</span>
            <CopyButton label="Copy all" text={refs.join('\n')} />
          </p>
          <ol className="space-y-1.5 list-decimal pl-5 text-[0.74rem] text-dark-text">
            {refs.map((r, i) => (
              <li key={i} className="leading-relaxed">{r}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}