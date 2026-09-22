// Text analyzer supporting English + Arabic: counts, sentence stats,
// word frequency (with bigrams) and reading-time estimates.

export interface FrequencyRow {
  word: string;
  count: number;
  pct: number;
}

const AR_WORD = /[\u0621-\u064A\u066E-\u06D3\u0674]+/g;
const EN_WORD = /[a-zA-Z\u00C0-\u024F]+(?:['’-][a-zA-Z\u00C0-\u024F]+)*/g;

export interface AnalyzeResult {
  words: number;
  chars: number;
  charsNoSpace: number;
  sentences: number;
  paragraphs: number;
  readingMinutes: number;
  uniqueWords: number;
  ttr: number;
  avgSentenceLen: number;
  lang: 'ar' | 'en' | 'mixed';
  frequency: FrequencyRow[];
  bigrams: FrequencyRow[];
}

const AR_STOP = new Set(
  'في من إلى على عن مع أن إن كان كانت يكون تكون هذا هذه ذلك تلك الذي التي اللي هو هي هم نحن أنا عند بين بعد قبل خلال حتى ثم أو و لا ما لم لن قد س قد لا، وال و في من'.split(/\s+/)
);

const EN_STOP = new Set(
  'the a an and or of to in on at for from by with about as is are was were be been being it its this that these those they their them he she his her we our you your i me my not no do does did but if then than so and also just very can could will would should may might more most some such all any over under again once there here'.split(' ')
);

function tokenizeWords(text: string): string[] {
  const trimmed = text.trim();
  let arCount = 0;
  let enCount = 0;
  arCount = Array.from(trimmed.matchAll(AR_WORD)).length;
  enCount = Array.from(trimmed.matchAll(EN_WORD)).length;
  const lang: AnalyzeResult['lang'] = arCount && enCount ? 'mixed' : arCount ? 'ar' : enCount ? 'en' : 'en';
  const words: string[] = [];
  const push = (m: RegExpMatchArray) => {
    const w = m[0].toLowerCase();
    if (w.length > 1) words.push(w);
  };
  Array.from(trimmed.matchAll(AR_WORD)).forEach(push);
  if (lang !== 'ar') {
    Array.from(trimmed.matchAll(EN_WORD)).forEach(push);
  }
  return words;
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?؟؟\u060C\u061F])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function analyzeText(text: string): AnalyzeResult {
  const trimmed = text ?? '';
  const words = tokenizeWords(trimmed);
  const sents = sentences(trimmed);
  const paras = trimmed.split(/\n\s*\n|\n+/).filter((p) => p.trim().length > 0).length;

  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);

  const total = words.length || 1;
  const frequency = Array.from(freq.entries())
    .filter(([w]) => !AR_STOP.has(w) && !EN_STOP.has(w))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([word, count]) => ({ word, count, pct: (count / total) * 100 }));

  const bigramMap = new Map<string, number>();
  for (let i = 0; i < words.length - 1; i++) {
    const key = `${words[i]} ${words[i + 1]}`;
    bigramMap.set(key, (bigramMap.get(key) || 0) + 1);
  }
  const bigrams = Array.from(bigramMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word, count]) => ({ word, count, pct: (count / (total - 1 || 1)) * 100 }));

  const chars = trimmed.length;
  const charsNoSpace = trimmed.replace(/\s/g, '').length;

  // Arabic text demands a lower reading speed (~150 wpm).
  const hasAr = /[\u0600-\u06FF]/.test(trimmed);
  const wpm = hasAr ? 150 : 200;
  const readingMinutes = total / wpm;

  return {
    words: total,
    chars,
    charsNoSpace,
    sentences: sents.length,
    paragraphs: paras,
    readingMinutes,
    uniqueWords: freq.size,
    ttr: freq.size / total,
    avgSentenceLen: sents.length ? total / sents.length : 0,
    lang: hasAr && /[a-zA-Z]/.test(trimmed) ? 'mixed' : hasAr ? 'ar' : 'en',
    frequency,
    bigrams,
  };
}