import { ExamSlot } from '@/lib/exam-routine-config';

export interface ExamCourse {
  code: string;
  title: string;
  teacher?: string;
  room?: string;
  rollRange?: string;
  fromGithub?: boolean;
}

export interface ExamRow {
  date: string;
  day: string;
  courses: Record<string, ExamCourse>;
  semesterSlots: Record<string, string>;
}

export interface ExamRoutineItem {
  id: string;
  semester: string;
  session: string;
  department: string;
  examType: string;
  rows: ExamRow[];
  slots: ExamSlot[];
  createdAt?: number;
  published?: boolean;
  isDraft?: boolean;
  status?: string;
  publishedBy?: { name: string; title?: string; email?: string };
  publishedAt?: number;
}

export type ExamAllStep = 'setup' | 'courses' | 'assign';

export interface ExamAllSemesterSem {
  name: string;
  enabled: boolean;
  courses: ExamCourse[];
}

export const LS_EXAM_DRAFTS = 'qsis-exam-draft-routines';
export const LS_EXAM_ALL_DRAFTS = 'qsis-exam-all-drafts';
export const LS_EXAM_PUBLISHED = 'qsis-exam-published-routines';
export const DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
export const EXAM_TYPES = ['Midterm', 'Final', 'Quiz', 'Makeup', 'Practical'];

export function getDefaultSession(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  return month < 6 ? `Spring - ${year}` : `Autumn - ${year}`;
}

export function expandRollRange(range: string): string[] {
  if (!range.trim()) return [];
  const parts = range.split('-').map(s => s.trim());
  if (parts.length !== 2) return [range.trim()];
  const [start, end] = parts;
  const prefix = start.replace(/\d+$/, '');
  const suffix = end.replace(/\d+$/, '');
  if (prefix !== suffix || prefix === start) return [range.trim()];
  const startNum = parseInt(start.replace(/^\D+/, ''));
  const endNum = parseInt(end.replace(/^\D+/, ''));
  if (isNaN(startNum) || isNaN(endNum) || endNum < startNum) return [range.trim()];
  const rolls: string[] = [];
  const numWidth = start.replace(/^\D+/, '').length;
  for (let i = startNum; i <= endNum; i++) {
    rolls.push(`${prefix}${String(i).padStart(numWidth, '0')}`);
  }
  return rolls;
}

export function formatRollCount(rollStr: string): string {
  if (!rollStr || rollStr === '-') return '';
  if (rollStr.includes(',')) {
    const ids = rollStr.split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length <= 1) return rollStr;
    return `${ids.length} students`;
  }
  const rolls = expandRollRange(rollStr);
  if (rolls.length <= 1) return rollStr;
  return `${rolls.length} students (${rolls[0]}–${rolls[rolls.length - 1]})`;
}

export function getDefaultRow(slots: ExamSlot[]): ExamRow {
  const courses: Record<string, ExamCourse> = {};
  const semesterSlots: Record<string, string> = {};
  slots.filter(s => s.enabled).forEach(s => { courses[s.id] = { code: '', title: '' }; semesterSlots[s.id] = ''; });
  return { date: '', day: '', courses, semesterSlots };
}
