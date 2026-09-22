// Citation generator — APA, MLA, Chicago (notes-bibliography), IEEE and an
// Arabic adaption (APA-ar). Pure functions that return plain-text citations.

export type CitationType = 'book' | 'journal' | 'web' | 'thesis';
export type CitationStyle = 'apa' | 'mla' | 'chicago' | 'ieee' | 'ar';

export interface CitationFields {
  type: CitationType;
  authors: string; // "Muhammad Ali Rahman" or "Last, First" or Arabic "فلان، فلان"
  year: string;
  title: string;
  publisher?: string;
  city?: string;
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  url?: string;
  doi?: string;
  accessed?: string;
  edition?: string;
  // Arabic-specific fields for the ar style
  titleAr?: string;
  publisherAr?: string;
}

const noPunct = (s?: string) => (s || '').trim().replace(/[.。;]+$/, '');
const optSpace = (s?: string) => (s && s.trim() ? ` ${s.trim()} ` : ' ');

export function buildCitation(f: CitationFields, style: CitationStyle): string {
  switch (style) {
    case 'apa':
      return apa(f);
    case 'mla':
      return mla(f);
    case 'chicago':
      return chicago(f);
    case 'ieee':
      return ieee(f);
    case 'ar':
      return ar(f);
  }
}

function authorEn(f: CitationFields): string {
  const raw = f.authors.trim() || 'Author';
  if (/[,]/.test(raw) && !/[\u0600-\u06FF]/.test(raw)) return raw;
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return raw;
  const last = parts[parts.length - 1];
  const initials = parts
    .slice(0, -1)
    .map((p) => p.charAt(0).toUpperCase() + '.')
    .join(' ');
  return `${last}, ${initials}`;
}

function apa(f: CitationFields): string {
  const a = authorEn(f);
  const year = noPunct(f.year) || 'n.d.';
  const title = noPunct(f.title) || 'Untitled';
  if (f.type === 'book') {
    const pub = f.publisher ? `. ${noPunct(f.publisher)}` : '';
    return `${a} (${year}). ${title}${pub}.`;
  }
  if (f.type === 'journal') {
    const j = f.journal ? ` ${noPunct(f.journal)}` : '';
    const vol = f.volume ? `${noPunct(f.volume)}` : '';
    const issue = f.issue ? `(${noPunct(f.issue)})` : '';
    const pp = f.pages ? `, ${noPunct(f.pages)}` : '';
    const loc = f.doi ? ` https://doi.org/${noPunct(f.doi)}` : f.url ? ` ${f.url}` : '';
    return `${a} (${year}). ${title}.${j}${j ? ',' : ''} ${vol}${issue}${pp}.${loc}`.replace(/,\s*\./g, '.');
  }
  if (f.type === 'thesis') {
    return `${a} (${year}). ${title} [${f.publisher ? noPunct(f.publisher) : 'Thesis'}].`;
  }
  const access = f.accessed ? ` (accessed ${f.accessed})` : '';
  const site = f.publisher ? ` Retrieved from ${f.url || noPunct(f.publisher)}` : ` Retrieved from ${f.url || ''}`;
  return `${a} (${year}). ${title}${site}${access}.`;
}

function mla(f: CitationFields): string {
  const parts = f.authors.trim().split(/\s+/).filter(Boolean);
  let a = f.authors.trim();
  if (parts.length > 1 && !/,/.test(a)) {
    const first = parts.slice(0, -1).join(' ');
    a = `${parts[parts.length - 1]}, ${first}`;
  }
  const year = noPunct(f.year) || 'n.d.';
  const title = noPunct(f.title) || 'Untitled';
  if (f.type === 'book') {
    return `${a}. ${title}. ${f.edition ? noPunct(f.edition) + ' ed. ' : ''}${f.publisher ? noPunct(f.publisher) + ',' : ''} ${year}.`;
  }
  if (f.type === 'journal') {
    const vol = f.volume ? ` vol. ${noPunct(f.volume)}` : '';
    const issue = f.issue ? `, no. ${noPunct(f.issue)}` : '';
    const pp = f.pages ? `, pp. ${noPunct(f.pages)}` : '';
    const loc = f.doi ? ` doi:${noPunct(f.doi)}.` : f.url ? ` ${f.url}.` : '';
    return `${a}. "${title}." ${f.journal ? noPunct(f.journal) : ''}${vol}${issue} (${year})${pp}.${loc}`;
  }
  if (f.type === 'thesis') {
    return `${a}. "${title}." ${f.publisher || 'Thesis'}, ${year}.`;
  }
  return `${a}. "${title}." ${f.publisher ? noPunct(f.publisher) + ', ' : ''}${year}${f.url ? ', ' + f.url : ''}.`;
}

function chicago(f: CitationFields): string {
  const parts = f.authors.trim().split(/\s+/).filter(Boolean);
  let a = f.authors.trim();
  if (parts.length > 1 && !/,/.test(a)) {
    const firsts = parts.slice(0, -1).join(' ');
    a = `${parts[parts.length - 1]}, ${firsts}`;
  }
  const year = noPunct(f.year) || 'n.d.';
  const title = noPunct(f.title) || 'Untitled';
  if (f.type === 'book') {
    const city = f.city ? noPunct(f.city) + ': ' : '';
    return `${a}. ${title}. ${city}${f.publisher ? noPunct(f.publisher) + ', ' : ''}${year}.`;
  }
  if (f.type === 'journal') {
    const vol = f.volume ? `${noPunct(f.volume)}` : '';
    const issue = f.issue ? `, no. ${noPunct(f.issue)}` : '';
    const pp = f.pages ? `: ${noPunct(f.pages)}` : '';
    const loc = f.doi ? ` https://doi.org/${noPunct(f.doi)}` : f.url ? ` ${f.url}` : '';
    return `${a}. "${title}." ${f.journal || ''} ${vol}${issue} (${year})${pp}.${loc}`;
  }
  if (f.type === 'thesis') {
    return `${a}. "${title}." ${f.publisher || 'Thesis'}, ${year}.`;
  }
  return `${a}. "${title}." ${f.publisher || ''}, ${year}. ${f.url || ''}`.replace(/\s+/g, ' ').trim();
}

function ieee(f: CitationFields): string {
  const parts = f.authors.trim().split(/\s+/).filter(Boolean);
  let a = f.authors.trim();
  if (parts.length > 1 && !/,/.test(a)) {
    const initials = parts
      .slice(0, -1)
      .map((p) => p.charAt(0).toUpperCase() + '.')
      .join(' ');
    a = `${initials} ${parts[parts.length - 1]}`;
  }
  const year = noPunct(f.year) || 'n.d.';
  const title = noPunct(f.title) || 'Untitled';
  if (f.type === 'journal') {
    const vol = f.volume ? `vol. ${noPunct(f.volume)}` : '';
    const issue = f.issue ? `no. ${noPunct(f.issue)}` : '';
    const pp = f.pages ? `pp. ${noPunct(f.pages)}` : '';
    return `${a}, "${title}," ${f.journal || ''}, ${vol}${issue ? ', ' + issue : ''}, ${pp ? pp + ', ' : ''}${year}.`.replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim();
  }
  if (f.type === 'book') {
    return `${a}, ${title}. ${f.city ? noPunct(f.city) + ': ' : ''}${f.publisher || ''}, ${year}.`.replace(/\s+/g, ' ').trim();
  }
  if (f.type === 'thesis') {
    return `${a}, "${title}," ${f.publisher || 'Thesis'}, ${year}.`;
  }
  return `${a}, "${title}," ${f.publisher || 'Website'}, ${year}. [Online]. Available: ${f.url || ''}`.trim();
}

// Arabic adaptation (APA-ar): Arabic-first fields with right-direction layout.
// Mirrors APA's structure: Author, (Year). Title. Publisher.
function ar(f: CitationFields): string {
  const authors = f.authors.trim() || 'مؤلف';
  const year = noPunct(f.year) || 'بدون سنة';
  const title =
    (f.titleAr && f.titleAr.trim()) || (f.title && hasArabicChars(f.title) ? noPunct(f.title) : noPunct(f.title) || 'عنوان بدون تحديد');
  const publisher = f.publisherAr || f.publisher || '';
  if (f.type === 'journal') {
    const j = f.journal && hasArabicChars(f.journal) ? f.journal : f.journal || '';
    const vol = f.volume ? `، مج ${noPunct(f.volume)}` : '';
    const issue = f.issue ? `(${noPunct(f.issue)})` : '';
    const pp = f.pages ? `، ص ${noPunct(f.pages)}` : '';
    return `${authors} (${year}). ${title}. ${j}${vol}${issue}${pp}${f.doi ? `. https://doi.org/${noPunct(f.doi)}` : ''}`.trim();
  }
  return `${authors} (${year}). ${title}${publisher ? `. ${publisher}` : ''}.`.trim();
}

function hasArabicChars(s: string): boolean {
  return /[\u0600-\u06FF]/.test(s);
}

const STYLE_LABELS: Record<CitationStyle, string> = {
  apa: 'APA (7th)',
  mla: 'MLA (9th)',
  chicago: 'Chicago',
  ieee: 'IEEE',
  ar: 'APA — Arabic',
};
export { STYLE_LABELS };

export const CITATION_FIELD_LABELS = {
  type: 'Source type',
  authors: 'Author(s)',
  year: 'Year',
  title: 'Title',
  publisher: 'Publisher',
  city: 'City',
  journal: 'Journal name',
  volume: 'Volume',
  issue: 'Issue',
  pages: 'Pages',
  url: 'URL',
  doi: 'DOI',
  accessed: 'Accessed date',
  edition: 'Edition',
  titleAr: 'العنوان (Arabic)',
  publisherAr: 'الناشر (Arabic)',
} as const;