// Heuristic "AI-likeness" estimator. This is NOT an actual AI-content detector
// (those need models trained on billions of tokens). It scores common surface
// signals of machine-generated prose — uniform sentence rhythm (low burstiness),
// vocabulary repetition, generic transitions and formulaic phrasing — and is
// honest about being an approximate guide, not a verdict.

import { AI_PHRASES } from './humanize';

export interface AIScoring {
  score: number; // 0..100, higher = more formulaic/AI-like by surface signals
  label: 'Likely human' | 'Uncertain — mix of human & AI traits' | 'Highly formulaic';
  signals: {
    avgSentenceLen: number;
    sentenceLenCv: number; // coefficient of variation (burstiness proxy)
    uniqueRatio: number; // type-token ratio
    clichePerSentence: number;
    longSentenceShare: number;
  };
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?؟!؟])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function meanStd(a: number[]): { mean: number; std: number } {
  if (a.length === 0) return { mean: 0, std: 0 };
  const mean = a.reduce((x, y) => x + y, 0) / a.length;
  const variance = a.reduce((x, y) => x + (y - mean) ** 2, 0) / a.length;
  return { mean, std: Math.sqrt(variance) };
}

export function assessAILikeness(text: string): AIScoring {
  const sents = sentences(text);
  const words = text.split(/\s+/).filter(Boolean);
  const totalWords = words.length;
  const unique = new Set(words.map((w) => w.toLowerCase())).size;
  const uniqueRatio = totalWords ? unique / totalWords : 0;

  const lens = sents.map((s) => s.split(/\s+/).filter(Boolean).length);
  const { mean: avgSentenceLen, std } = meanStd(lens);
  const sentenceLenCv = avgSentenceLen ? std / avgSentenceLen : 0;
  const longSentenceShare = lens.length
    ? lens.filter((l) => l >= 30).length / lens.length
    : 0;

  let clicheHits = 0;
  const lower = text.toLowerCase();
  for (const p of AI_PHRASES) {
    const idx = lower.indexOf(p.phrase);
    if (idx !== -1) clicheHits += 1 / (sents.length || 1);
  }
  const clichePerSentence = clicheHits;

  // Score each signal on a roughly-formulaic-vs-human axis.
  // cv < 0.35 → uniform rhythm (machine-like);    cv > 0.6 → natural burstiness
  const cvScore = Math.max(0, Math.min(1, (0.6 - sentenceLenCv) / 0.4));
  const ttrScore = Math.max(0, Math.min(1, (0.55 - uniqueRatio) / 0.3));
  const clicheScore = Math.max(0, Math.min(1, clichePerSentence / 1.5));
  const longScore = Math.max(0, Math.min(1, longSentenceShare / 0.4));
  const tooShort = totalWords < 40;
  let score: number;
  if (!tooShort) {
    score = cvScore * 34 + ttrScore * 26 + clicheScore * 24 + longScore * 16;
  } else {
    score = NaN;
  }

  const rounded = Math.round(score);
  const label: AIScoring['label'] =
    Number.isNaN(rounded) ? 'Uncertain — mix of human & AI traits'
      : rounded <= 35 ? 'Likely human'
        : rounded < 62 ? 'Uncertain — mix of human & AI traits'
          : 'Highly formulaic';

  return {
    score: Number.isNaN(rounded) ? 0 : rounded,
    label,
    signals: {
      avgSentenceLen,
      sentenceLenCv,
      uniqueRatio,
      clichePerSentence,
      longSentenceShare,
    },
  };
}