// Quillbot-style AI-likeness scanner (offline heuristic).
// Not an ML detector — it scores EACH sentence on surface signals: formulaic
// openers, AI-typical phrasing (English + Arabic), dense AI-favoured vocabulary,
// and global rhythm/vocabulary uniformity. Returns a per-sentence verdict so a
// whole file can be scanned sentence-by-sentence, like Quillbot's highlighter.

import { AI_PHRASES, AR_PHRASES } from './humanize';

export interface SentenceHit {
  phrase: string;
  suggestion: string;
}

export interface SentenceVerdict {
  index: number;
  sentence: string;
  score: number; // 0..100 — higher = more AI-like by surface signals
  label: 'Likely human' | 'Uncertain' | 'Likely AI';
  hits: SentenceHit[];
  long: boolean;
}

export interface AIScoring {
  score: number;
  label: 'Likely human' | 'Uncertain — mix of human & AI traits' | 'Likely AI';
  sentences: SentenceVerdict[];
  signals: {
    avgSentenceLen: number;
    sentenceLenCv: number;
    uniqueRatio: number;
    clichePerSentence: number;
    longSentenceShare: number;
  };
}

const FORMULAIC_OPENERS = [
  /^(moreover|furthermore|additionally|conversely)\s*[,:]/i,
  /^in\s+(addition|summary|conclusion|today'?s\s+(fast-paced\s+)?world)/i,
  /^it\s+is\s+(important|worth|crucial|imperative|essential|vital|well\s+known)\s+(to\s+)?(note|highlight|mention|remember)\s+that/i,
  /^(the\s+findings|this\s+study|this\s+research|the\s+results)\s+(suggest|demonstrate|reveal|highlight|show|underscore)\s+that/i,
  /^in\s+the\s+(realm|landscape|world)\s+of/i,
];

const DENSE_EN = [
  'crucial', 'vital', 'significant', 'pivotal', 'essential', 'paramount',
  'robust', 'seamless', 'comprehensive', 'holistic', 'delve', 'delve',
  'navigate', 'leverage', 'utilize', 'utilizes', 'utilization', 'facilitate',
  'facilitates', 'foster', 'fosters', 'elevate', 'unlock', 'cutting-edge',
  'state-of-the-art', 'game-changer', 'innovative', 'groundbreaking',
  'moreover', 'furthermore', 'additionally', 'conversely', 'consequently',
  'therefore', 'thus', 'shedding light', 'sheds light',
];

const DENSE_AR = [
  'الجدير بالذكر', 'تجدر الإشارة', 'علاوة على ذلك', 'بالإضافة إلى ذلك',
  'دورا محوريا', 'دوراً محورياً', 'تسليط الضوء', 'يسلط الضوء', 'تشير النتائج',
];

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?؟])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function meanStd(a: number[]): { mean: number; std: number } {
  if (a.length === 0) return { mean: 0, std: 0 };
  const mean = a.reduce((x, y) => x + y, 0) / a.length;
  const variance = a.reduce((x, y) => x + (y - mean) ** 2, 0) / a.length;
  return { mean, std: Math.sqrt(variance) };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function assessAILikeness(text: string): AIScoring {
  const sents = splitSentences(text);
  const words = text.split(/\s+/).filter(Boolean);
  const lowerAll = text.toLowerCase();
  const unique = new Set(words.map((w) => w.toLowerCase())).size;
  const uniqueRatio = words.length ? unique / words.length : 0;
  const lens = sents.map((s) => s.split(/\s+/).filter(Boolean).length);
  const { mean: avgSentenceLen, std } = meanStd(lens);
  const sentenceLenCv = avgSentenceLen ? std / avgSentenceLen : 0;
  const longSentenceShare = lens.length ? lens.filter((l) => l >= 45).length / lens.length : 0;

  // Global uniformity contributions that every sentence inherits.
  const baseUniform = clamp01((0.6 - sentenceLenCv) / 0.35) * 14; // low burstiness
  const baseRepetition = clamp01((0.62 - uniqueRatio) / 0.3) * 10; // vocabulary repetition

  const verdicts: SentenceVerdict[] = sents.map((s, i) => {
    const lower = s.toLowerCase();
    const hits: SentenceHit[] = [];
    const allPhrases = AI_PHRASES.concat(AR_PHRASES);
    let phraseScore = 0;
    for (const { phrase, suggest } of allPhrases) {
      const pat = ' ' + phrase.toLowerCase() + ' ';
      const hay = ' ' + lower + ' ';
      if (hay.indexOf(pat) !== -1 && !hits.some((h) => h.phrase === phrase)) {
        hits.push({ phrase, suggestion: suggest.find((x) => x !== '') || '—' });
        phraseScore += 13;
        if (hits.length >= 3) break;
      }
    }

    let openerScore = 0;
    for (const re of FORMULAIC_OPENERS) {
      if (re.test(lower)) { openerScore = 15; break; }
    }

    let denseScore = 0;
    for (const d of DENSE_EN) {
      if (denseScore >= 14) break;
      if (hay2(lower, d)) denseScore += 5;
    }
    if (denseScore < 14) {
      for (const d of DENSE_AR) {
        if (denseScore >= 14) break;
        if (lower.indexOf(d) !== -1) denseScore += 5;
      }
    }

    const wc = lower.split(/\s+/).filter(Boolean).length;
    const long = wc >= 45;
    const longScore = long ? 6 : 0;

    let score = baseUniform + baseRepetition + Math.min(38, phraseScore) + openerScore + Math.min(14, denseScore) + longScore;
    score = Math.round(Math.max(0, Math.min(100, score)));

    const label: SentenceVerdict['label'] =
      score <= 35 ? 'Likely human' : score < 62 ? 'Uncertain' : 'Likely AI';

    return { index: i, sentence: s, score, label, hits, long };
  });

  const perSent = verdicts.reduce((x, v) => x + v.score, 0);
  const avg = verdicts.length ? perSent / verdicts.length : 0;
  const score = Math.round(avg);
  const label: AIScoring['label'] =
    score <= 35 ? 'Likely human'
      : score < 62 ? 'Uncertain — mix of human & AI traits'
        : 'Likely AI';

  let clicheCount = 0;
  for (const { phrase } of AI_PHRASES) {
    const pat = ' ' + phrase.toLowerCase() + ' ';
    if ((' ' + lowerAll + ' ').indexOf(pat) !== -1) clicheCount++;
  }
  for (const { phrase } of AR_PHRASES) {
    if (lowerAll.indexOf(phrase.toLowerCase()) !== -1) clicheCount++;
  }

  return {
    score,
    label,
    sentences: verdicts,
    signals: {
      avgSentenceLen,
      sentenceLenCv,
      uniqueRatio,
      clichePerSentence: sents.length ? clicheCount / sents.length : 0,
      longSentenceShare,
    },
  };
}

function hay2(lower: string, d: string): boolean {
  return lower.indexOf(d) !== -1;
}