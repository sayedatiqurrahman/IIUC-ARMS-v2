'use client';

import { useState } from 'react';
import { arabicToLatin, latinToArabic, hasArabic } from '@/lib/research/transliteration';
import { Btn, CopyButton, Field, Note, outBoxCls, TextArea } from './ui';

export default function PhoneticConverter() {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'auto' | 'ar2en' | 'en2ar'>('auto');
  const isArabicInput =
    mode === 'ar2en' ? true : mode === 'en2ar' ? false : hasArabic(text);

  const output = isArabicInput ? arabicToLatin(text) : latinToArabic(text);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(['auto', 'ar2en', 'en2ar'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-xl px-3 py-1.5 text-[0.72rem] font-semibold transition cursor-pointer border ${
              mode === m ? 'bg-qsis text-white border-qsis' : 'border-dark-border bg-dark-bg2 text-dark-text2 hover:border-qsis/50'
            }`}
          >
            {m === 'auto' ? '◉ Auto-detect' : m === 'ar2en' ? 'العربية → Latin' : 'Latin → العربية'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label={isArabicInput ? 'Arabic text' : 'Latin transliteration'}>
          <TextArea
            placeholder={isArabicInput ? 'اكتب النص العربي هنا…' : 'Type phonetically, e.g. "Muhammad ibn Abdullah"'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            dir={isArabicInput ? 'rtl' : undefined}
          />
        </Field>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[0.7rem] font-semibold text-dark-text2">Converted</span>
            <CopyButton text={output} />
          </div>
          <div dir={!isArabicInput ? 'rtl' : undefined} lang={!isArabicInput ? 'ar' : 'en'} className={outBoxCls + ' min-h-[10rem]'}>
            {output || <span className="text-dark-text3">Output appears here as you type…</span>}
          </div>
        </div>
      </div>

      <Note>
        Best-effort phonetic conversion, not a formal transliteration standard (e.g. ALA-LC). Verify names and terms before citing them.
      </Note>
    </div>
  );
}