// Rule-based "humanization" assistant — Quillbot-style but offline & transparent.
// Detects formulaic/AI-style phrasing (English and Arabic) and for every flagged
// sentence proposes concrete rewrite alternatives: phrase swaps, opener
// variation, long-sentence splits. It never changes meaning; students keep
// their own voice. This is a lint for AI tell-tales, not a ghostwriter.

export interface PhraseIssue {
  phrase: string;
  suggestion: string;
  count: number;
}

export interface PhraseDef {
  phrase: string;
  suggest: string[];
}

// Ordered by surface appearance likelihood in academic prose.
export const AI_PHRASES: PhraseDef[] = [
  { phrase: 'delve into', suggest: ['examine', 'explore', 'look closely at'] },
  { phrase: 'in summary', suggest: ['to conclude', 'in short'] },
  { phrase: 'in conclusion', suggest: ['taken together', 'ultimately'] },
  { phrase: 'moreover', suggest: ['in addition', 'also', 'what is more'] },
  { phrase: 'furthermore', suggest: ['besides', 'in addition'] },
  { phrase: 'additionally', suggest: ['also', 'in addition'] },
  { phrase: 'in today’s world', suggest: ['today', 'in the present era'] },
  { phrase: "in today's world", suggest: ['today', 'in the present era'] },
  { phrase: 'in today’s fast-paced world', suggest: ['today'] },
  { phrase: "in today's fast-paced world", suggest: ['today'] },
  { phrase: 'navigate the complexities', suggest: ['handle the challenges', 'manage the details'] },
  { phrase: 'it is important to note', suggest: ['note that', 'it matters that'] },
  { phrase: 'it is worth noting', suggest: ['note that'] },
  { phrase: 'it is important to highlight', suggest: ['highlight'] },
  { phrase: 'plays a vital role', suggest: ['matters a great deal', 'is central'] },
  { phrase: 'plays a crucial role', suggest: ['is essential', 'matters'] },
  { phrase: 'plays a pivotal role', suggest: ['is central', 'leads'] },
  { phrase: 'plays a significant role', suggest: ['matters', 'contributes'] },
  { phrase: 'plays a key role', suggest: ['is central', 'helps'] },
  { phrase: 'cutting-edge', suggest: ['latest', 'new', 'modern'] },
  { phrase: 'state-of-the-art', suggest: ['current', 'modern', 'up-to-date'] },
  { phrase: 'seamless', suggest: ['smooth', 'easy'] },
  { phrase: 'robust', suggest: ['strong', 'solid', 'reliable'] },
  { phrase: 'holistic', suggest: ['complete', 'whole'] },
  { phrase: 'comprehensive', suggest: ['thorough', 'complete'] },
  { phrase: 'a comprehensive overview', suggest: ['a clear overview'] },
  { phrase: 'the landscape of', suggest: ['the area of', 'the field of'] },
  { phrase: 'in the realm of', suggest: ['in', 'within'] },
  { phrase: 'utilizes', suggest: ['uses'] },
  { phrase: 'utilization', suggest: ['use'] },
  { phrase: 'leverage', suggest: ['use', 'make the most of'] },
  { phrase: 'facilitate', suggest: ['help', 'make easier'] },
  { phrase: 'to facilitate', suggest: ['to help', 'to make easier'] },
  { phrase: 'elevate', suggest: ['raise', 'improve'] },
  { phrase: 'foster', suggest: ['support', 'encourage', 'build'] },
  { phrase: 'in order to', suggest: ['to'] },
  { phrase: 'game-changer', suggest: ['turning point', 'major change'] },
  { phrase: 'ever-evolving', suggest: ['changing', 'developing'] },
  { phrase: 'it is crucial', suggest: ['it matters', 'it is essential'] },
  { phrase: 'it is imperative', suggest: ['we must', 'it is necessary'] },
  { phrase: 'unlock the potential', suggest: ['realize the potential'] },
  { phrase: 'whenever possible', suggest: ['where possible', 'if possible'] },
  { phrase: 'the findings suggest', suggest: ['the results point to'] },
  { phrase: 'sheds light on', suggest: ['explains', 'clarifies', 'shows'] },
  { phrase: 'throws light on', suggest: ['explains', 'clarifies'] },
  { phrase: 'when it comes to', suggest: ['in', 'for', 'regarding'] },
  { phrase: 'a wide range of', suggest: ['many', 'various', 'a broad set of'] },
  { phrase: 'of paramount importance', suggest: ['essential', 'vital'] },
  { phrase: 'a crucial aspect', suggest: ['a key point'] },
  { phrase: 'it is well known that', suggest: ['as is well known', 'scholars agree that'] },
];

// Common AI/formal filler phrasing in Arabic academic prose.
export const AR_PHRASES: PhraseDef[] = [
  { phrase: 'من الجدير بالذكر أن', suggest: ['يُشار إلى أن', 'مما يلفت النظر أن'] },
  { phrase: 'من الجدير بالذكر', suggest: ['اللافت أن', 'يشار إلى ذلك'] },
  { phrase: 'تجدر الإشارة إلى أن', suggest: ['يُشار إلى أن', 'ومما تجدر ملاحظته أن'] },
  { phrase: 'تجدر الإشارة إلى', suggest: ['يُشار إلى'] },
  { phrase: 'علاوة على ذلك', suggest: ['إضافة إلى ذلك', 'كذلك', 'ثم'] },
  { phrase: 'بالإضافة إلى ذلك', suggest: ['كذلك', 'وأيضا', 'فضلا عن ذلك'] },
  { phrase: 'في الختام', suggest: ['خلاصة القول', 'وإجمالا'] },
  { phrase: 'في النهاية', suggest: ['في نهاية المطاف', 'وخلاصة ذلك'] },
  { phrase: 'في ضوء ما سبق', suggest: ['بناء على ذلك', 'وعلى هذا'] },
  { phrase: 'من ناحية أخرى', suggest: ['وفي المقابل', 'بينما'] },
  { phrase: 'تشير النتائج إلى أن', suggest: ['تُظهر النتائج أن', 'تبيّن النتائج أن'] },
  { phrase: 'يسلط الضوء على', suggest: ['يُبرز', 'يوضّح'] },
  { phrase: 'تسلط الضوء على', suggest: ['تُبرز', 'توضّح'] },
  { phrase: 'يلعب دورا محوريا', suggest: ['يُعد أساسيا في', 'هو محور'] },
  { phrase: 'يلعب دوراً محورياً', suggest: ['يُعد أساسيا في', 'هو محور'] },
  { phrase: 'يلعب دورا كبيرا', suggest: ['يؤثر كثيرا في'] },
  { phrase: 'من المهم أن نلاحظ', suggest: ['لاحظ أن'] },
  { phrase: 'من المهم أن', suggest: ['يجدر أن'] },
  { phrase: 'يستعرض هذا البحث', suggest: ['يبحث هذا البحث في', 'يتناول هذا البحث'] },
];

const FORMULAIC_OPENERS = [
  { re: /^(moreover|furthermore|additionally)\s*[,:]/i, drop: true },
  { re: /^in\s+(addition|summary|conclusion|today'?s\s+world)[,.]?\s+/i, drop: true },
  { re: /^it\s+is\s+(important|worth)\s+to\s+(note|highlight|mention)\s+that\s+/i, drop: false },
  { re: /^it\s+is\s+(crucial|imperative|essential|vital)\s+to\s+/i, drop: false },
  { re: /^the\s+findings\s+(suggest|demonstrate|show)\s+that\s+/i, drop: false },
  { re: /^this\s+study\s+(demonstrates|reveals|highlights)\s+that\s+/i, drop: false },
];

export interface SentenceFlag {
  phrase: string;
  suggestion: string;
}

export interface SentenceRewrite {
  index: number;
  original: string;
  flags: SentenceFlag[];
  long: boolean;
  alternatives: string[];
}

export interface HumanizeReport {
  issues: PhraseIssue[];
  longSentences: number[];
  rewrite: string;
  changed: number;
  sentences: SentenceRewrite[];
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const splitWords = (s: string) => s.split(/[^a-zA-Z0-9\u0621-\u064A]+/).filter(Boolean).length;

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?؟])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function hasArabic(s: string): boolean {
  return /[\u0600-\u06FF]/.test(s);
}

function capitalize(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Apply phrase swaps to a single sentence. Returns { out, flags } */
function swapPhrases(sentence: string, lang: 'en' | 'ar'): { out: string; flags: SentenceFlag[] } {
  let out = sentence;
  const flags: SentenceFlag[] = [];
  const list = lang === 'ar' ? AR_PHRASES : AI_PHRASES;
  for (const { phrase, suggest } of list) {
    const idx = out.toLowerCase().indexOf(phrase.toLowerCase());
    if (idx === -1) continue;

    // Sentence-opening "in today's (fast-paced) world" — cut it and the comma
    // entirely instead of leaving ", it is important to…".
    const restAfter = out.slice(idx + phrase.length);
    if (idx === 0 && phrase.indexOf('today') !== -1 && /^[,.]?\s+/.test(restAfter)) {
      out = capitalize(restAfter.replace(/^[,.]?\s+/, '').trim());
      flags.push({ phrase, suggestion: '—' });
      continue;
    }

    // Avoid "…note that that…": if the original already continues with "that",
    // prefer a suggestion that does not itself end in "that".
    const followedByThat = /^\s+that\b/i.test(restAfter);
    let replacement = suggest.find((s) => !!s && !(followedByThat && /\bthat\s*$/i.test(s)));
    if (replacement === undefined && followedByThat) {
      const fallback = suggest.find((s) => !!s);
      replacement = fallback ? fallback.replace(/\s+that\s*$/i, '') : '';
    }
    if (replacement === undefined) replacement = suggest.find((s) => !!s);
    if (!replacement) continue;
    out = replaceOnce(out, phrase, replacement);
    if (idx === 0) out = capitalize(out);
    flags.push({ phrase, suggestion: replacement });
  }
  return { out, flags };
}

function replaceOnce(src: string, phrase: string, replacement: string): string {
  const i = src.toLowerCase().indexOf(phrase.toLowerCase());
  if (i === -1) return src;
  return src.slice(0, i) + replacement + src.slice(i + phrase.length);
}

/** Build EN/AR rewrite variants for a sentence. */
function variantsFor(sentence: string, flags: SentenceFlag[], long: boolean, lang: 'en' | 'ar'): string[] {
  const variants: string[] = [];
  if (lang === 'en') {
    const swapped = swapPhrases(sentence, 'en').out;
    if (swapped !== sentence) variants.push(swapped);

    // Opener variation: cut or replace the formulaic connector.
    let openerFixed = sentence;
    let tweaked = false;
    for (const { re, drop } of FORMULAIC_OPENERS) {
      const m = openerFixed.match(re);
      if (!m) continue;
      const rest = openerFixed.slice(m[0].length).trim();
      if (!rest) continue;
      if (drop) {
        const nxt = rest.charAt(0).toUpperCase() + rest.slice(1);
        if (nxt !== openerFixed) { openerFixed = nxt; tweaked = true; }
        break;
      }
      const lead = re.source.startsWith('^the\\s+findings|^this') ? '' : '';
      void lead;
      if (rest !== openerFixed) { openerFixed = capitalize(rest); tweaked = true; }
      break;
    }
    if (tweaked && openerFixed !== sentence && !variants.includes(openerFixed)) variants.push(openerFixed);

    if (long) {
      const split = splitLongSentence(sentence);
      if (split && !variants.includes(split)) variants.push(split);
    }

    // "It is X that Y" -> "Y are X" inversion when flags found an opener pattern.
    const itIs = sentence.match(/^It\s+is\s+(clear|evident|apparent)\s+that\s+(.+)$/i);
    if (itIs) {
      const y = capitalize(itIs[2].trim());
      const alt = `${y} — this is ${itIs[1].toLowerCase()}.`;
      if (!variants.includes(alt)) variants.push(alt);
    }
  } else {
    const swapped = swapPhrases(sentence, 'ar').out;
    if (swapped !== sentence) variants.push(swapped);

    // Arabic opener drop.
    let arabicFixed = sentence;
    let tweaked = false;
    for (const { phrase, suggest } of AR_PHRASES) {
      const re = new RegExp('^' + escapeRe(phrase) + '[\\s،]+', 'i');
      const m = arabicFixed.match(re);
      if (!m) continue;
      const rest = arabicFixed.slice(m[0].length).trim();
      if (!rest) continue;
      const top = suggest.find((s) => s !== '');
      if (top) arabicFixed = `${top} ${rest}`;
      else arabicFixed = rest;
      tweaked = true;
      break;
    }
    if (tweaked && arabicFixed !== sentence && !variants.includes(arabicFixed)) variants.push(arabicFixed);

    if (long) {
      const split = splitLongSentence(sentence, true);
      if (split && !variants.includes(split)) variants.push(split);
    }
  }
  return variants.slice(0, 3);
}

/** Split an over-long sentence at a conjunction near its middle third. */
function splitLongSentence(sentence: string, arabic = false): string | null {
  const words = sentence.split(/\s+/);
  if (words.length < 30) return null;
  return genericSplit(sentence, words, arabic);
}

function genericSplit(sentence: string, words: string[], arabic: boolean): string | null {
  let cut = -1;
  const joints = arabic
    ? ['،', 'و', 'لكن']
    : ['and', 'but', 'which', 'that', 'because', 'although', 'however'];
  for (let i = Math.floor(words.length * 0.35); i < Math.min(words.length - 1, Math.floor(words.length * 0.85)); i++) {
    for (const j of joints) {
      const w = words[i].replace(/[،,؛;]/g, '');
      if (w === j || (arabic && words[i].includes('،'))) { cut = i; break; }
    }
    if (cut !== -1) break;
  }
  if (cut === -1 || cut >= words.length - 1) return null;
  const first = words.slice(0, cut + 1).join(' ').replace(/\s+[,،]$/, '') + (arabic ? '،' : '.');
  const second = capitalize(words.slice(cut + 1).join(' ').replace(/^[,،]\s*/, ''));
  const out = `${first} ${second}`;
  return out === sentence ? null : out;
}

export function sentenceRewrites(text: string): HumanizeReport['sentences'] {
  const sents = splitSentences(text);
  const lang: 'en' | 'ar' = hasArabic(text) ? 'ar' : 'en';
  return sents.map((s, i) => {
    const wordCount = splitWords(s);
    const long = wordCount >= 45;
    const flags = swapPhrases(s, lang).flags;
    const alternatives = flags.length > 0 || long ? variantsFor(s, flags, long, lang) : [];
    return { index: i, original: s, flags, long, alternatives };
  });
}

export function humanizeReport(text: string): HumanizeReport {
  const lower = text.toLowerCase();
  const issues: PhraseIssue[] = [];
  const lang: 'en' | 'ar' = hasArabic(text) ? 'ar' : 'en';
  const list = lang === 'ar' ? AR_PHRASES : AI_PHRASES;

  for (const { phrase, suggest } of list) {
    const count = lower.split(phrase.toLowerCase()).length - 1;
    if (count > 0) {
      issues.push({ phrase, suggestion: suggest.filter(Boolean).join(' / ') || '—', count });
    }
  }

  const sents = splitSentences(text);
  const longSentences: number[] = [];
  sents.forEach((s, i) => {
    if (splitWords(s) >= 45) longSentences.push(i);
  });

  let out = text;
  let changed = 0;
  for (const { phrase, suggest } of list) {
    const replacement = suggest.find((s) => s !== '');
    if (!replacement) continue;
    const re = new RegExp(escapeRe(phrase), 'gi');
    const matches = out.match(re) || [];
    if (matches.length === 0) continue;
    changed += matches.length;
    out = out.replace(re, replacement);
  }

  const sentences = sents.map((s, i) => {
    const wordCount = splitWords(s);
    const long = wordCount >= 45;
    const flags = swapPhrases(s, lang).flags;
    const alternatives = flags.length > 0 || long ? variantsFor(s, flags, long, lang) : [];
    return { index: i, original: s, flags, long, alternatives };
  });

  return { issues, longSentences, rewrite: out, changed, sentences };
}

export const HUMANIZE_NOTE =
  'Runs entirely on your device. It flags phrasing common in AI-generated text (English and Arabic) and suggests natural alternatives. Rewrites never change meaning — always review the result before submitting.';