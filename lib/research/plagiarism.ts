// Offline duplicate-phrase finder.
// Detects repeated sequences inside one document (self-plagiarism / copy-paste
// repetition) and overlap between two pasted texts. This is NOT a web-scale
// plagiarism search — it has no corpus. Use it to find accidental duplication
// and to check overlap between two of your own drafts.

export interface RepeatHit {
  phrase: string;
  length: number; // word count
  occurrences: number;
}

export function findRepeats(text: string, minLen = 6): RepeatHit[] {
  const words = text
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .split(' ')
    .filter((w) => w.length > 0);
  if (words.length < minLen + 1) return [];

  const counts = new Map<string, number>();
  const ngram = minLen;
  for (let i = 0; i + ngram <= words.length; i++) {
    const key = words.slice(i, i + ngram).join(' ');
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const hits: RepeatHit[] = [];
  counts.forEach((occurrences, key) => {
    if (occurrences > 1) {
      hits.push({ phrase: key, length: ngram, occurrences });
    }
  });
  return hits.sort((a, b) => b.occurrences - a.occurrences || phraseLen(b.phrase) - phraseLen(a.phrase));
}

function phraseLen(p: string): number {
  return p.trim() ? p.trim().split(/\s+/).length : 0;
}

export function longestRepeatedPhrase(hits: RepeatHit[]): string {
  const best = [...hits].sort((a, b) => b.length - a.length || b.occurrences - a.occurrences)[0];
  return best ? best.phrase : '';
}

export interface MatchesResult {
  hits: RepeatHit[];
  totalRepeatWords: number;
  totalWords: number;
  repeatPercent: number;
}

export function findMatchesIn(text: string): MatchesResult {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const hits = findRepeats(text, 6);
  const totalRepeatWords = hits.reduce((sum, h) => sum + h.length * (h.occurrences - 1), 0);
  return {
    hits,
    totalRepeatWords,
    totalWords: words.length,
    repeatPercent: words.length ? (totalRepeatWords / words.length) * 100 : 0,
  };
}

export interface PairScore {
  overlapPercent: number;
  sequences: RepeatHit[];
}

/** Overlap between two documents (finds 8+ word identical runs). */
export function overlapBetween(a: string, b: string): PairScore {
  const aw = a.toLowerCase().replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const bw = b.toLowerCase().replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const n = 8;
  if (aw.length < n || bw.length < n) return { overlapPercent: 0, sequences: [] };
  const set = new Set<string>();
  for (let i = 0; i + n <= aw.length; i++) set.add(aw.slice(i, i + n).join(' '));
  let matches = 0;
  for (let i = 0; i + n <= bw.length; i++) {
    if (set.has(bw.slice(i, i + n).join(' '))) matches++;
  }
  const overlapPercent = bw.length - n > 0 ? Math.min(100, (matches / Math.max(1, bw.length - n)) * 100) : 0;
  return { overlapPercent: Math.round(overlapPercent * 100) / 100, sequences: [] };
}