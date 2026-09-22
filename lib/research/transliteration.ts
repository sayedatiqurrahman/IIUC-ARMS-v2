// Arabic <-> Latin phonetic transliteration helpers.
// Converts between Arabic script and a readable Latin transliteration.
// Not a replacement for academic transliteration standards (ALA-LC etc.) —
// it is a best-effort phonetic converter for student/research use.

const AR_GREP = /[\u0621-\u064A\u066E-\u06D3\u0674]/;

export function hasArabic(text: string): boolean {
  return AR_GREP.test(text || '');
}

/** Strip Arabic diacritics (tashkeel) so the base letters can be mapped. */
export function stripDiacritics(text: string): string {
  return text.replace(/[\u064B-\u0652\u0670\u0640]/g, '');
}

// ── Arabic → Latin (phonetic, readable) ──────────────────────────────────────
// Longer digraphs first so they match before their single letters.
const AR2L: Array<[RegExp, string]> = [
  [/الإ/g, "al-'"],
  [/\u0622/g, 'aa'],
  [/\u0623/g, "a'"],
  [/\u0625/g, "i'"],
  [/\u0624/g, "u'"],
  [/\u0626/g, "'"],
  [/\u0621/g, "'"],
  [/\u0627/g, 'a'], // ا
  [/\u0628/g, 'b'], // ب
  [/\u0629/g, 'h'], // ة
  [/\u062A/g, 't'], // ت
  [/\u062B/g, 'th'], // ث
  [/\u062C/g, 'j'], // ج
  [/\u062D/g, 'h'], // ح
  [/\u062E/g, 'kh'], // خ
  [/\u062F/g, 'd'], // د
  [/\u0630/g, 'dh'], // ذ
  [/\u0631/g, 'r'], // ر
  [/\u0632/g, 'z'], // ز
  [/\u0633/g, 's'], // س
  [/\u0634/g, 'sh'], // ش
  [/\u0635/g, 's'], // ص
  [/\u0636/g, 'd'], // ض
  [/\u0637/g, 't'], // ط
  [/\u0638/g, 'z'], // ظ
  [/\u0639/g, "'"], // ع
  [/\u063A/g, 'gh'], // غ
  [/\u0641/g, 'f'], // ف
  [/\u0642/g, 'q'], // ق
  [/\u0643/g, 'k'], // ك
  [/\u0644/g, 'l'], // ل
  [/\u0645/g, 'm'], // م
  [/\u0646/g, 'n'], // ن
  [/\u0647/g, 'h'], // ه
  [/\u0648/g, 'w'], // و
  [/\u064A/g, 'y'], // ي
  [/\u0649/g, 'a'], // ى
  [/\u067E/g, 'p'], // پ
  [/\u0686/g, 'ch'], // چ
  [/\u06AF/g, 'g'], // گ
  [/\u0688/g, 'd'], // ڈ
  [/\u06CC/g, 'y'], // ی
];

export function arabicToLatin(text: string): string {
  let out = stripDiacritics(text);
  // definite article ال joined to word: al-<word> (lowercase h for ة)
  out = out.replace(/([^\s])[-\u0640]?\u0627\u0644\u0644\u0647/g, '$1 Allah');
  for (const [re, latin] of AR2L) out = out.replace(re, latin);
  // Consolidate adjacent vowels from mapping into a clean shape
  out = out.replace(/aa+/g, 'aa').replace(/hh(?![a-z])/g, 'h').replace(/(')+/g, "'");
  return out
    .split(' ')
    .map((w) => w.trim())
    .filter(Boolean)
    .join(' ');
}

// ── Latin → Arabic (phonetic) ────────────────────────────────────────────────
// Typing "Muhammad" or "muhammed" gives محمد. Long vowel conventions:
//  aa → ا / آ, ee → ي, oo → و, gh → غ, kh → خ, dh → ذ, th → ث, sh → ش.
const L2A_PATTERNS: Array<[RegExp, string]> = [
  [/dh|Dhz/gi, '\u0630'], // dh → ذ
  [/th/gi, '\u062B'],
  [/gh/gi, '\u063A'],
  [/kh/gi, '\u062E'],
  [/sh/gi, '\u0634'],
  [/ch/gi, '\u0686'],
  [/aa/gi, '\u0627'],
  [/ee/gi, '\u064A'],
  [/oo/gi, '\u0648'],
];

const L2A_LETTERS: Array<[RegExp, string]> = [
  [/'/g, '\u0621'],
];

// Single-letter map. Order matters: apply digraphs first, then singles.
const L2A_SINGLE: Record<string, string> = {
  a: '\u0627',
  b: '\u0628',
  t: '\u062A',
  j: '\u062C',
  h: '\u062D',
  d: '\u062F',
  r: '\u0631',
  z: '\u0632',
  s: '\u0633',
  f: '\u0641',
  q: '\u0642',
  k: '\u0643',
  l: '\u0644',
  m: '\u0645',
  n: '\u0646',
  w: '\u0648',
  y: '\u064A',
  p: '\u067E',
  g: '\u06AF',
  i: '\u064A', // short i/e written as ي (best effort)
  e: '\u064A',
  u: '\u0648', // short u/o written as و
  o: '\u0648',
};

export function latinToArabic(text: string): string {
  let s = text.trim();
  if (hasArabic(s)) return text;
  for (const [re, ar] of L2A_PATTERNS) s = s.replace(re, ar);
  s = s.replace(/dh/gi, '\u0630');
  let out = '';
  for (const ch of s) {
    const lo = ch.toLowerCase();
    out += L2A_SINGLE[lo] || ch;
  }
  // Collapse doubled letters (gemination) and octave of leftover Latin marks.
  out = out.replace(/(.)\1/g, '$1');
  out = out.replace(/\u0621\u0621/g, '\u0621');
  out = out.replace(/[a-zA-Z]/g, '');
  return out.trim();
}

/** Author name → Arabic script attempt (Latin input). */
export function authorNameToArabic(name: string): string {
  if (hasArabic(name)) return name;
  return latinToArabic(name).trim();
}

/** Name → "Last, F. M." citation format (English-style citation order). */
export function formatCitationName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  // Already in "Last, F. M." / "Last, First" shape
  if (/^[A-Za-z'\u0600-\u06FF-]+,\s*[A-Za-z\u0600-\u06FF]\.?/.test(trimmed)) return trimmed.trim();
  const parts = trimmed.split(/[\s\u060C]+/).filter(Boolean);
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  const firsts = parts.slice(0, -1);
  const initials = firsts
    .map((p) => `${p.charAt(0)}.`)
    .join(' ');
  return `${capitalize(last)}, ${initials}`;
}

export function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}