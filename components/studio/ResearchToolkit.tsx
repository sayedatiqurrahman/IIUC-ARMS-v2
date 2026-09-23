'use client';

import { useState } from 'react';
import CitationGenerator from './research/CitationGenerator';
import Glossary from './research/Glossary';
import Summarizer from './research/Summarizer';
import FrequencyAnalyzer from './research/FrequencyAnalyzer';
import AuthorNameConverter from './research/AuthorNameConverter';
import Plagiarism from './research/Plagiarism';
import AIHumanizer from './research/AIHumanizer';
import FileVerify from './research/FileVerify';
import CiteCheck from './research/CiteCheck';
import OutlineFormatter from './research/OutlineFormatter';
import { LocaleProvider, useLocale } from './research/locale';

interface ToolDef {
  id: string;
  label: string;
  ar: string;
  icon: string;
  blurb: string;
  component: React.ComponentType<{}>;
  tag?: string;
}

const TOOLS: ToolDef[] = [
  { id: 'citations', label: 'Citation Generator', ar: 'مولّد الاستشهادات', icon: 'format_quote', blurb: 'APA, MLA, Chicago, IEEE + APA-ar for books, articles, web & theses, with a reference-list builder.', component: CitationGenerator },
  { id: 'citecheck', label: 'Citation Verifier', ar: 'مدقق الاستشهادات', icon: 'verified', blurb: 'Paste a citation and check its style, author, year, journal, pages, DOI/URL — bilingual.', component: CiteCheck },
  { id: 'aidetect', label: 'AI Detector & Humanizer', ar: 'كشف الذكاء الاصطناعي وتحسين الصياغة', icon: 'science', blurb: 'Quillbot-style: per-sentence likelihood scan with color-marked sentences, then rewrite suggestions for every flagged sentence.', component: AIHumanizer, tag: 'heuristic' },
  { id: 'doccheck', label: 'Document Verifier', ar: 'فحص مستند كامل', icon: 'folder_open', blurb: 'Upload .docx / .pdf / .txt and verify the WHOLE file at once — stats, AI scan, rewrites and repeats. Read locally, never uploaded.', component: FileVerify, tag: 'local' },
  { id: 'formats', label: 'Outline & Formatter', ar: 'خريطة البحث والتنسيق', icon: 'article', blurb: 'Combined: research/dissertation outline (Standard or Thesis) with content bullets + APA / MLA / Chicago / IEEE / Arabic formatting rules, English & Arabic.', component: OutlineFormatter },
  { id: 'summarizer', label: 'Summarizer & Extractive Paraphrase', ar: 'مُلخّص النصوص', icon: 'summarize', blurb: 'Extractive sentence scoring for English and Arabic. Choose your target length.', component: Summarizer },
  { id: 'analyzer', label: 'Frequency Analyzer', ar: 'محلّل التكرار', icon: 'monitoring', blurb: 'Word & character counts, top frequency, bigrams, reading time and lexical density.', component: FrequencyAnalyzer },
  { id: 'authors', label: 'Author Name Converter', ar: 'محوّل أسماء المؤلفين', icon: 'badge', blurb: 'Turn names into “Last, F. M.” citation form and produce the Arabic script.', component: AuthorNameConverter },
  { id: 'glossary', label: 'Bilingual Glossary', ar: 'قاموس أكاديمي', icon: 'menu_book', blurb: '150+ English ↔ Arabic academic terms in research methods, statistics, writing and publishing.', component: Glossary },
  { id: 'plagiarism', label: 'Plagiarism Checker (offline)', ar: 'كاشف الاستنساخ', icon: 'fact_check', blurb: 'Finds duplicated phrases inside your draft and overlap between two drafts. No internet scan.', component: Plagiarism, tag: 'offline' },
];

function LangToggle() {
  const { lang, setLang } = useLocale();
  return (
    <div className="flex overflow-hidden rounded-xl border border-dark-border">
      {(['en', 'ar'] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={`px-3 py-1.5 text-[0.68rem] font-bold transition cursor-pointer ${lang === l ? 'bg-qsis text-white' : 'bg-dark-bg2 text-dark-text2 hover:text-qsis'}`}
        >
          {l === 'en' ? 'English' : 'العربية'}
        </button>
      ))}
    </div>
  );
}

function Inner() {
  const [active, setActive] = useState<string | null>(null);
  const { lang } = useLocale();
  const tool = TOOLS.find((t) => t.id === active) || null;
  const ActiveView = tool?.component || null;
  const isAr = lang === 'ar';

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-qsis/30 bg-qsis/5 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.72rem] leading-relaxed text-dark-text2 max-w-xl" dir={isAr ? 'rtl' : undefined}>
          <span className="font-bold text-qsis">{isAr ? 'العربية · English' : 'English · العربية'}</span>
          {isAr
            ? ' — رفيق بحثي يركز على اللغتين اللتين تنشر بهما. كل أداة تعمل في متصفحك بالكامل؛ لا يُرسل أي نص إلى أي خادم.'
            : ' — a research companion focused on the two languages you publish in. Every tool runs entirely in your browser; nothing you paste leaves your device.'}
        </p>
        <div className="flex items-center gap-3">
          <LangToggle />
          <span className="rounded-full border border-dark-border bg-dark-bg px-3 py-1 text-[0.62rem] text-dark-text3">
            {TOOLS.length} tools · No sign-in · No uploads
          </span>
        </div>
      </div>

      {!tool ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className="group text-left rounded-2xl border border-dark-border bg-dark-bg2 p-4 hover:border-qsis/50 hover:bg-dark-bg3 transition cursor-pointer"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="material-symbols-outlined text-2xl text-qsis">{t.icon}</span>
                {t.tag && <span className="rounded-full border border-amber-700/40 bg-amber-900/20 px-2 py-0.5 text-[0.58rem] font-medium text-amber-300">{t.tag}</span>}
              </div>
              <h3 className="text-[0.85rem] font-bold text-dark-text group-hover:text-qsis transition-colors" dir={isAr ? 'rtl' : undefined}>
                {isAr ? t.ar : t.label}
              </h3>
              <p className="mt-0.5 text-[0.68rem] text-dark-text3" dir={isAr ? undefined : 'rtl'} lang="ar">{isAr ? t.label : t.ar}</p>
              <p className="mt-1.5 text-[0.7rem] text-dark-text2 leading-relaxed" dir={isAr ? 'rtl' : undefined}>{t.blurb}</p>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dark-border bg-dark-bg2/70 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3.5 border-b border-dark-border bg-dark-bg2">
            <button onClick={() => setActive(null)} className="text-[0.72rem] text-dark-text2 hover:text-qsis transition cursor-pointer bg-transparent border-none flex items-center gap-1.5">
              <i className="fas fa-arrow-left text-xs"></i> {isAr ? 'كل الأدوات' : 'All tools'}
            </button>
            <span className="w-px h-5 bg-dark-border"></span>
            <span className="material-symbols-outlined text-qsis text-xl">{tool.icon}</span>
            <div className="flex-1 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[0.88rem] font-bold text-dark-text" dir={isAr ? 'rtl' : undefined}>{isAr ? tool.ar : tool.label}</h2>
                <p className="text-[0.64rem] text-dark-text3" dir={isAr ? undefined : 'rtl'} lang="ar">{isAr ? tool.label : tool.ar}</p>
              </div>
              <LangToggle />
            </div>
          </div>
          <div className="p-5">{ActiveView && <ActiveView />}</div>
        </div>
      )}
    </div>
  );
}

export default function ResearchToolkit() {
  return (
    <LocaleProvider>
      <Inner />
    </LocaleProvider>
  );
}