// Rule-based "humanization" assistant. Detects formulaic/AI-style phrasing and
// over-long sentences, and suggests concrete alternations. It does not rewrite
// meaning — it flags patterns and proposes clearer, more natural substitutes.
// Students should keep their own voice; this is a lint for AI tell-tales, not a
// ghostwriter.

export interface PhraseIssue {
  phrase: string;
  suggestion: string;
  count: number;
}

// Ordered by surface appearance likelihood in academic prose.
export const AI_PHRASES: Array<{ phrase: string; suggest: string[] }> = [
  { phrase: 'delve into', suggest: ['examine', 'explore', 'look closely at'] },
  { phrase: 'in summary', suggest: ['to conclude', 'in short', ''] },
  { phrase: 'in conclusion', suggest: ['taken together', 'ultimately'] },
  { phrase: 'moreover', suggest: ['in addition', 'also', 'what is more'] },
  { phrase: 'furthermore', suggest: ['besides', 'in addition'] },
  { phrase: 'additionally', suggest: ['also', 'in addition'] },
  { phrase: 'in today’s world', suggest: ['today', 'in the present era'] },
  { phrase: 'in today\'s world', suggest: ['today', 'in the present era'] },
  { phrase: 'navigate the complexities', suggest: ['handle the challenges', 'manage the details'] },
  { phrase: 'it is important to note', suggest: ['note that', 'it matters that'] },
  { phrase: 'plays a vital role', suggest: ['matters a great deal', 'is central'] },
  { phrase: 'plays a crucial role', suggest: ['is essential', 'matters'] },
  { phrase: 'plays a pivotal role', suggest: ['is central', 'leads'] },
  { phrase: 'plays a significant role', suggest: ['matters', 'contributes'] },
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
];

export interface HumanizeReport {
  issues: PhraseIssue[];
  longSentences: number[];
  rewrite: string;
  changed: number;
}

const splitWords = (s: string) => s.split(/[^a-zA-Z0-9\u0621-\u064A]+/).filter(Boolean).length;

export function humanizeReport(text: string): HumanizeReport {
  const lower = text.toLowerCase();
  const issues: PhraseIssue[] = [];
  const rewrite = text;
  const longSentences: number[] = [];
  const sents = text.split(/(?<=[.!?؟!؟])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 0);
  sents.forEach((s, i) => {
    if (splitWords(s) >= 45) longSentences.push(i);
  });

  for (const { phrase, suggest } of AI_PHRASES) {
    const count = lower.split(phrase).length - 1;
    if (count > 0) {
      issues.push({
        phrase,
        suggestion: suggest.filter(Boolean).join(' / ') || '—',
        count,
      });
    }
  }

  let out = text;
  let changed = 0;
  for (const { phrase, suggest } of AI_PHRASES) {
    const replacement = suggest.find((s) => s !== '');
    if (!replacement) continue;
    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const matches = out.match(re) || [];
    if (matches.length === 0) continue;
    changed += matches.length;
    out = out.replace(re, replacement);
  }

  return { issues, longSentences, rewrite: out, changed };
}

export const HUMANIZE_NOTE =
  'Heuristic only — flags formulaic phrasing that is common in AI-generated text and suggests natural alternatives. Rewrites never change meaning; always review the result.';