export function getDefaultSession(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  return month < 6 ? `Spring - ${year}` : `Autumn - ${year}`;
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
