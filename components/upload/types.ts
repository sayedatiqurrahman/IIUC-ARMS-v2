import type { Profile } from '@/lib/store';

export const CURRENT_YEAR = new Date().getFullYear();
export const CURRENT_MONTH = new Date().getMonth() + 1;
export const CURRENT_SEASON = CURRENT_MONTH >= 4 && CURRENT_MONTH <= 9 ? 'Spring' : 'Autumn';

export function isPdf(name: string) { return name.toLowerCase().endsWith('.pdf'); }
export function isImage(name: string) { return /\.(jpg|jpeg|png|gif|webp)$/i.test(name); }
export function isDocsOnly(name: string) { return /\.(pdf|doc|docx|ppt|pptx)$/i.test(name); }

export interface FileWithMeta {
  file: File;
  year: string;
  yearRange: string;
}

export interface Link {
  title: string;
  url: string;
}

export interface CourseGroup {
  id: number;
  selectedCourseCode: string;
  selectedCourseTitle: string;
  files: FileWithMeta[];
  examSession: string;
  midFinal: string;
  links: Link[];
}

export interface UploadModalProps {
  session: any;
  status: string;
  profile: Profile;
  onLogin: () => void;
  onClose: () => void;
}

export const SESSION_OPTIONS = [
  { value: 'Autumn', label: 'Autumn', icon: 'fa-leaf' },
  { value: 'Spring', label: 'Spring', icon: 'fa-seedling' },
];

export function extractYearFromTitle(title: string): number {
  const match = title.match(/\b(20\d{2})\b/);
  return match ? parseInt(match[1]) : 0;
}

export function sortLinksByYear(links: { title: string; url: string }[]): { title: string; url: string }[] {
  return [...links].sort((a, b) => extractYearFromTitle(b.title) - extractYearFromTitle(a.title));
}
