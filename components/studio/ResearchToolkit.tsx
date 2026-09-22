'use client';

import { useState } from 'react';
import CitationGenerator from './research/CitationGenerator';
import PhoneticConverter from './research/PhoneticConverter';
import Glossary from './research/Glossary';
import Summarizer from './research/Summarizer';
import FrequencyAnalyzer from './research/FrequencyAnalyzer';
import OutlineGenerator from './research/OutlineGenerator';
import AuthorNameConverter from './research/AuthorNameConverter';
import Plagiarism from './research/Plagiarism';
import AIDetector from './research/AIDetector';
import Humanizer from './research/Humanizer';

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
  { id: 'phonetic', label: 'Arabic ↔ Latin Converter', ar: 'محوّل العربية–لاتينية', icon: 'translate', blurb: 'Two-way phonetic conversion: Arabic script ⇄ Latin typing for names, titles and transliteration.', component: PhoneticConverter },
  { id: 'glossary', label: 'Bilingual Glossary', ar: 'قاموس أكاديمي', icon: 'menu_book', blurb: '150+ English ↔ Arabic academic terms in research methods, statistics, writing and publishing.', component: Glossary },
  { id: 'summarizer', label: 'Summarizer & Extractive Paraphrase', ar: 'مُلخّص النصوص', icon: 'summarize', blurb: 'Extractive sentence scoring for English and Arabic. Choose your target length.', component: Summarizer },
  { id: 'analyzer', label: 'Frequency Analyzer', ar: 'محلّل التكرار', icon: 'monitoring', blurb: 'Word & character counts, top frequency, bigrams, reading time and lexical density.', component: FrequencyAnalyzer },
  { id: 'outline', label: 'Outline Generator', ar: 'خريطة البحث', icon: 'account_tree', blurb: 'Standard and dissertation structures with English + Arabic headings in one click.', component: OutlineGenerator },
  { id: 'authors', label: 'Author Name Converter', ar: 'محوّل أسماء المؤلفين', icon: 'badge', blurb: 'Turn names into “Last, F. M.” citation form and produce the Arabic script.', component: AuthorNameConverter },
  { id: 'plagiarism', label: 'Plagiarism Checker (offline)', ar: 'كاشف الاستنساخ', icon: 'fact_check', blurb: 'Finds duplicated phrases inside your draft and overlap between two drafts. No internet scan.', component: Plagiarism, tag: 'offline' },
  { id: 'aidetect', label: 'AI-Likeness Scanner', ar: 'فحص أنماط الذكاء الاصطناعي', icon: 'science', blurb: 'Heuristic formulaic-likeness score — sentence rhythm, vocabulary diversity and clichés.', component: AIDetector, tag: 'heuristic' },
  { id: 'humanize', label: 'Humanization Assistant', ar: 'مساعد تحسين الصياغة', icon: 'edit_note', blurb: 'Flags AI-typical phrasing and proposes natural alternatives; split runaway long sentences.', component: Humanizer, tag: 'heuristic' },
];

export default function ResearchToolkit() {
  const [active, setActive] = useState<string | null>(null);
  const tool = TOOLS.find((t) => t.id === active) || null;
  const ActiveView = tool?.component || null;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-qsis/30 bg-qsis/5 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.72rem] leading-relaxed text-dark-text2 max-w-xl">
          <span className="font-bold text-qsis">English · العربية</span> — a research companion focused on the two languages
          you publish in. Every tool runs entirely in your browser; nothing you paste leaves your device.
        </p>
        <span className="rounded-full border border-dark-border bg-dark-bg px-3 py-1 text-[0.62rem] text-dark-text3">
          {TOOLS.length} tools · No sign-in · No uploads
        </span>
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
              <h3 className="text-[0.85rem] font-bold text-dark-text group-hover:text-qsis transition-colors">{t.label}</h3>
              <p className="mt-0.5 text-[0.68rem] text-dark-text3" dir="rtl" lang="ar">{t.ar}</p>
              <p className="mt-1.5 text-[0.7rem] text-dark-text2 leading-relaxed">{t.blurb}</p>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dark-border bg-dark-bg2/70 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3.5 border-b border-dark-border bg-dark-bg2">
            <button onClick={() => setActive(null)} className="text-[0.72rem] text-dark-text2 hover:text-qsis transition cursor-pointer bg-transparent border-none flex items-center gap-1.5">
              <i className="fas fa-arrow-left text-xs"></i> All tools
            </button>
            <span className="w-px h-5 bg-dark-border"></span>
            <span className="material-symbols-outlined text-qsis text-xl">{tool.icon}</span>
            <div>
              <h2 className="text-[0.88rem] font-bold text-dark-text">{tool.label}</h2>
              <p className="text-[0.64rem] text-dark-text3" dir="rtl" lang="ar">{tool.ar}</p>
            </div>
          </div>
          <div className="p-5">{ActiveView && <ActiveView />}</div>
        </div>
      )}
    </div>
  );
}