export function getDefaultSession(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  return month < 6 ? `Spring - ${year}` : `Autumn - ${year}`;
}

// Canonical university ID form: letter-prefix, digits, no spaces/hyphens/underscores.
// e.g. "q-233099" / "HS 233099" / "C2020_001" -> "Q233099" / "HS233099" / "C2020001"
export function normalizeUniversityId(id: string): string {
  const t = (id || '').trim().replace(/[\s_-]+/g, '');
  if (!t) return '';
  const m = t.match(/^([a-zA-Z]+)(\d+.*)$/);
  return m ? m[1].toUpperCase() + m[2] : t.toUpperCase();
}

export function extractYearFromTitle(title: string): number {
  const match = title.match(/\b(20\d{2})\b/);
  return match ? parseInt(match[1]) : 0;
}

export function sortLinksByYear(links: { title: string; url: string }[]): { title: string; url: string }[] {
  return [...links].sort((a, b) => extractYearFromTitle(b.title) - extractYearFromTitle(a.title));
}

export {
  getFileIcon,
  getMimeFromExt,
  getFileIconByType,
  esc,
  timeAgo,
  makeId,
  getRawUrl,
  extractYear,
  showToast,
  safeJson,
  getSemesterOptions,
  getDepartmentOptions,
  type SelectOption,
} from './utils.tsx';
