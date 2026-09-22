// Extractive summarizer for English and Arabic text.
// Scores sentences by term frequency (content words only) with position and
// length normalization, then returns the top-K sentences in original order.

const EN_STOP = new Set(
  'a an and are as at be but by for from had has have he her his i if in into is it its me my no not of on or our shall she so that the their them then there they this to was we were what when which who will with you your about all also am any because been being can could did do does done each few how more most other over some such than too very'.split(' ')
);

const AR_STOP = new Set(
  'في من إلى على عن مع أن إن كان كانت يكون تكون هذا هذه ذلك تلك الذي التي هو هي هم نحن أنا عند بين بعد قبل خلال حتى ثم أو و لا ما لم لن قد س قد إلى على عند من في'.split(' ')
);

function isContentWord(lower: string): boolean {
  if (/[\u0600-\u06FF]/.test(lower)) return !AR_STOP.has(lower) && lower.length >= 3;
  return !EN_STOP.has(lower) && lower.length >= 4 && /^[a-z]/.test(lower);
}

export interface SummaryResult {
  sentences: string[];
  ratio: number;
  kept: number;
  total: number;
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?؟!؟])\s+|(?<=[.!?؛؟])(?=\s*[A-Z\u0621-\u064A])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

export function summarizeText(text: string, ratio: number): SummaryResult {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const sents = splitSentences(cleaned);
  if (sents.length === 0) return { sentences: [], ratio, kept: 0, total: 0 };

  const freq = new Map<string, number>();
  for (const w of cleaned.split(/[^a-zA-Z\u0621-\u064A]+/)) {
    const lw = w.toLowerCase();
    if (isContentWord(lw)) freq.set(lw, (freq.get(lw) || 0) + 1);
  }
  const maxF = Math.max(1, ...Array.from(freq.values()));

  const scored = sents
    .map((s, idx) => {
      const words = s.split(/[^a-zA-Z\u0621-\u064A]+/).filter(Boolean);
      const contentWords = words.filter((w) => isContentWord(w.toLowerCase()));
      let score = 0;
      for (const w of contentWords) score += (freq.get(w.toLowerCase()) || 0) / maxF;
      score /= Math.max(1, words.length); // length normalization
      // Sentences near the start and end of a passage tend to carry key info.
      const positionBonus =
        idx === 0 ? 0.15 : idx === 1 ? 0.08 : idx >= sents.length - 2 ? 0.06 : 0;
      return { s, idx, score: score + positionBonus };
    })
    .sort((a, b) => b.score - a.score);

  const keep = Math.max(1, Math.min(sents.length, Math.round(sents.length * ratio)));
  const chosen = new Set(scored.slice(0, keep).map((x) => x.idx));
  const sentences = sents.filter((_, i) => chosen.has(i));
  return { sentences, ratio: sentences.length / sents.length, kept: sentences.length, total: sents.length };
}