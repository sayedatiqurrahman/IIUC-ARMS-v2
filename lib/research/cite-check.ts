// Heuristic citation verifier. Detects which style a pasted citation is in and
// checks that the required pieces are present and well-formed (author, year,
// title, journal/volume/pages, DOI/URL). It does not reach any database — it
// can tell you whether a citation LOOKS complete and correct, not whether the
// work itself exists.

export type CiteStyle = 'apa' | 'mla' | 'chicago' | 'ieee' | 'ar' | 'unknown';

export interface CiteCheckItem {
  key: string;
  label: string;
  labelAr: string;
  ok: boolean;
  detail: string;
  tip?: string;
}

export interface CiteReport {
  style: CiteStyle;
  styleLabel: string;
  items: CiteCheckItem[];
  passCount: number;
  total: number;
  score: number; // 0..100
  verdict: 'Looks complete' | 'Incomplete — fix the issues below' | 'Hard to verify';
}

const yearOk = (s: string) => {
  const m = s.match(/\b(19|20)\d{2}\b/);
  return m ? +m[1] : null;
};

function makeItems(style: CiteStyle, text: string): CiteCheckItem[] {
  const t = text.trim();
  const items: CiteCheckItem[] = [];

  const author = t.replace(/^[.\s\xa0\d\[\]()]*/, '').split(/(?:[,;()]|\s+(?:et\s+al\.?|and|&|and\s+others))/i)[0];
  items.push({
    key: 'author',
    label: 'Author(s)',
    labelAr: 'المؤلف(ون)',
    ok: author.length >= 3 && !/\b(author|n\.?a\.?|there|the|unknown|مؤلف|بدون)\b/i.test(author),
    detail: author.trim() || 'missing',
    tip: 'Give the author surname (and initials) — “Author” is a placeholder.',
  });

  const yr = yearOk(t);
  const hasYear = yr !== null;
  items.push({
    key: 'year',
    label: 'Year',
    labelAr: 'السنة',
    ok: hasYear,
    detail: hasYear ? String(yr) : 'not found',
    tip: 'Include a 4-digit year (e.g. 2019). For APA it sits in parentheses after the author.',
  });

  const title = t.split(/[.(][\x20\t]*$/)[0];
  const hasTitle = title.split(/\s+/).filter(Boolean).length >= 3;
  items.push({
    key: 'title',
    label: 'Title',
    labelAr: 'العنوان',
    ok: hasTitle,
    detail: hasTitle ? 'present' : 'too short / missing',
    tip: 'Add a complete title (at least 3 words). APA italicises book/journal titles.',
  });

  const doi = t.match(/10\.\d{4,9}\/\S+/i)?.[0];
  const url = t.match(/https?:\/\/\S+/i)?.[0];
  const hasLocator = !!(doi || url);
  items.push({
    key: 'locator',
    label: 'DOI / URL',
    labelAr: 'الرابط / DOI',
    ok: hasLocator,
    detail: doi ? `DOI ${doi}` : url ? 'URL present' : 'missing',
    tip: 'Online and journal sources should carry a DOI (10.…/…) or a full http(s) URL. Printed books omit both — make sure the publisher + place are present instead.',
  });

  if (doi) {
    const doiOk = /^10\.\d{4,9}\/[\S]+$/.test(doi);
    items.push({
      key: 'doi',
      label: 'DOI format',
      labelAr: 'تنسيق DOI',
      ok: doiOk,
      detail: doiOk ? 'valid-looking DOI' : `“${doi.slice(0, 40)}” — check the DOI format`,
      tip: 'A DOI looks like `10.1000/xyz123`. No trailing dot — move the period after.',
    });
  }

  const pages = t.match(/\b(p\.|pp\.|ص\.|رقم الصفحات)?\s*\d{1,4}\s*[-–]\s*\d{1,4}\b/);
  const volume = t.match(/(?:vol\.?|\(\d{1,4}\)|مج)\s*\d+/i);
  if (style === 'apa' || style === 'chicago' || style === 'mla') {
    items.push({
      key: 'pages',
      label: 'Pages',
      labelAr: 'الصفحات',
      ok: !!pages,
      detail: pages ? pages[0].replace(/\s+/g, ' ') : 'not found',
      tip: 'Journal articles need page range (pp. 1–12) unless the source is a website.',
    });
  }
  if (style === 'apa' || style === 'chicago') {
    items.push({
      key: 'volume',
      label: 'Journal + volume/issue',
      labelAr: 'المجلة والمجلد',
      ok: !!volume,
      detail: volume ? volume[0] : 'not found',
      tip: 'Add the journal name plus volume (and issue in parentheses): *Journal Name*, 12(3).',
    });
  }
  if (style === 'ieee') {
    items.push({ key: 'num', label: 'Reference number', labelAr: 'رقم المرجع', ok: /^\[\d+\]\s/.test(t) || /\d+\)/.test(t), detail: /^\[\d+\]\s/.test(t) ? 'bracketed number OK' : 'missing [n]', tip: 'IEEE references start with a bracketed number, e.g. [1].' });
  }
  return items.filter(Boolean);
}

export function detectStyle(text: string): CiteStyle {
  const t = text.trim();
  if (!t) return 'unknown';
  if (/^\[\d+\]\s/.test(t)) return 'ieee';
  const hasParenYear = /\(\d{4}\)/.test(t) || /\(\s*(?:19|20)\d{2}\s*\)/.test(t);
  const quotedTitle = /(“[^”]+”|"[^"]+")/;
  if (/[\u0600-\u06FF]/.test(t)) return 'ar';
  if (hasParenYear) return 'apa';
  if (quotedTitle.test(t)) return 'mla';
  if (/^[A-Z][^,]+,\s*[^.]*\d{4}[^.]*\./.test(t)) return 'chicago';
  return 'unknown';
}

export function verifyCitation(text: string, forcedStyle?: CiteStyle): CiteReport {
  const trimmed = text.trim();
  if (!trimmed) {
    return { style: 'unknown', styleLabel: '—', items: [], passCount: 0, total: 0, score: 0, verdict: 'Hard to verify' };
  }
  const style = forcedStyle || detectStyle(trimmed);
  const items = makeItems(style, trimmed);
  const passCount = items.filter((i) => i.ok).length;
  const total = items.length;
  const score = total ? Math.round((passCount / total) * 100) : 0;
  const verdict: CiteReport['verdict'] =
    score >= 80 ? 'Looks complete'
      : score >= 50 ? 'Incomplete — fix the issues below'
        : 'Hard to verify';
  const styleLabel =
    style === 'apa' ? 'APA (7th)' : style === 'mla' ? 'MLA (9th)' : style === 'chicago' ? 'Chicago' : style === 'ieee' ? 'IEEE' : style === 'ar' ? 'APA — Arabic' : 'Undetected';
  return { style, styleLabel, items, passCount, total, score, verdict };
}

export const CITE_STYLES: Array<{ id: CiteStyle; label: string; labelAr: string }> = [
  { id: 'apa', label: 'APA (7th)', labelAr: 'APA' },
  { id: 'mla', label: 'MLA (9th)', labelAr: 'MLA' },
  { id: 'chicago', label: 'Chicago', labelAr: 'شيكاغو' },
  { id: 'ieee', label: 'IEEE', labelAr: 'IEEE' },
  { id: 'ar', label: 'APA — Arabic', labelAr: 'APA — العربية' },
];