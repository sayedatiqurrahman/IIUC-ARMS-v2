import { SITE_URL } from './api';

// ─── Website deep link builder ────────────────────────────────────

function telegramLink(url: string): string {
  return SITE_URL + '/open?url=' + encodeURIComponent(url);
}

export function buildBrowseLink(params: Record<string, string>): string {
  const qs = new URLSearchParams(params);
  return telegramLink(SITE_URL + '/?' + qs.toString());
}

export function buildCourseLink(courseCode: string, dept?: string, sem?: string, cat?: string): string {
  const params: Record<string, string> = { q: courseCode };
  if (dept) params.dept = dept;
  if (sem) params.sem = sem;
  if (cat) params.cat = cat;
  return telegramLink(SITE_URL + '/?' + new URLSearchParams(params).toString());
}