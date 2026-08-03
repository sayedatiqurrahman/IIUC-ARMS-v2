import { config } from './config';
import { FACULTIES } from './departments';

export interface SelectOption {
  value: string;
  label: string;
  icon: string;
  group?: string;
}

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

export function getSemesterOptions(): SelectOption[] {
  return config.semesters.map(s => ({ value: s.id, label: s.label, icon: 'fa-calendar' }));
}

export function getDepartmentOptions(): SelectOption[] {
  return FACULTIES.flatMap(f =>
    f.departments.map(d => ({
      value: d.id,
      label: `${d.shortName} — ${d.name}`,
      icon: d.icon || 'fa-building',
      group: f.shortName,
    }))
  );
}

export { getFileIcon, getMimeFromExt, getFileIconByType, esc, timeAgo, makeId, getRawUrl, extractYear, showToast, safeJson } from './utils.tsx';
