/* ─── Shared Helper Functions for Routine Components ─── */

import type { RoutineCourse, RoutineSlot, RoutinePeriod, RoutineItem, DraftData, AllSemesterDraft, TeacherConflict } from './types';
import { DEFAULT_DAYS, SEMESTERS, DEFAULT_PERIODS, DEFAULT_FEMALE_PERIODS } from './types';

/* ─── Time Helpers ─── */
export function to24h(time12h: string): string {
  if (!time12h) return '';
  const match = time12h.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return '';
  let h = parseInt(match[1]); const m = match[2]; const ap = match[3].toUpperCase();
  if (ap === 'AM' && h === 12) h = 0;
  else if (ap === 'PM' && h !== 12) h += 12;
  return `${String(h).padStart(2, '0')}:${m}`;
}

export function to12h(time24h: string): string {
  if (!time24h) return '';
  const [hStr, m] = time24h.split(':');
  let h = parseInt(hStr);
  const ap = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m} ${ap}`;
}

/* ─── Routine Data Helpers ─── */
export function getDefaultSession(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  return month < 6 ? `Spring - ${year}` : `Autumn - ${year}`;
}

export function getCourse(code: string, courses: RoutineCourse[]) {
  return courses.find(c => c.code === code);
}

export function getSlot(day: string, period: number, slots: RoutineSlot[]) {
  return slots.find(s => s.day === day && s.period === period);
}

export function isOffDay(day: string, periods: RoutinePeriod[], slots: RoutineSlot[]) {
  const classPeriods = periods.filter(p => !p.isBreak);
  return classPeriods.every((_, idx) => !getSlot(day, idx, slots));
}

export function getTeacherAbbr(teacher: string): string {
  if (!teacher) return '';
  const parts = teacher.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return parts.map(p => p[0]).join('').toUpperCase().slice(0, 4);
}

/* ─── localStorage Helpers ─── */
const LS_MY_ROUTINES = 'qsis-routines';
const LS_PUBLISHED = 'qsis-published-routines';
const LS_DRAFT = 'qsis-routine-draft';
const LS_ALL_SEM_DRAFT = 'qsis-all-sem-draft';

export function loadMyRoutines(): RoutineItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LS_MY_ROUTINES);
    if (raw) return JSON.parse(raw);
    const single = localStorage.getItem('qsis-my-routine');
    if (single) {
      const r = JSON.parse(single);
      localStorage.setItem(LS_MY_ROUTINES, JSON.stringify([r]));
      return [r];
    }
    return [];
  } catch { return []; }
}

export function saveMyRoutines(routines: RoutineItem[]) {
  localStorage.setItem(LS_MY_ROUTINES, JSON.stringify(routines));
  // Also sync to DB so all users/devices see the same list
  fetch('/api/my-routines', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ routines }),
  }).catch(() => {});
}

export async function fetchMyRoutinesFromDB(): Promise<RoutineItem[]> {
  try {
    const res = await fetch('/api/my-routines');
    const data = await res.json();
    if (data.success && Array.isArray(data.routines)) {
      localStorage.setItem(LS_MY_ROUTINES, JSON.stringify(data.routines));
      return data.routines;
    }
  } catch {}
  return loadMyRoutines();
}

export function loadPublishedRoutines(): RoutineItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LS_PUBLISHED);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function savePublishedRoutines(routines: RoutineItem[]) {
  localStorage.setItem(LS_PUBLISHED, JSON.stringify(routines));
}

export async function fetchPublishedRoutinesFromDB(): Promise<RoutineItem[]> {
  try {
    const res = await fetch('/api/published-routines');
    const data = await res.json();
    if (data.success && Array.isArray(data.routines)) {
      localStorage.setItem(LS_PUBLISHED, JSON.stringify(data.routines));
      return data.routines;
    }
  } catch {}
  return loadPublishedRoutines();
}

export function loadDraft(): DraftData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_DRAFT);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveDraft(data: DraftData) {
  localStorage.setItem(LS_DRAFT, JSON.stringify(data));
}

export function clearDraft() {
  localStorage.removeItem(LS_DRAFT);
}

/* ─── All Semester Draft Helpers ─── */
export function loadAllSemDraft(): AllSemesterDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_ALL_SEM_DRAFT);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveAllSemDraft(draft: AllSemesterDraft) {
  localStorage.setItem(LS_ALL_SEM_DRAFT, JSON.stringify(draft));
}

export function clearAllSemDraft() {
  localStorage.removeItem(LS_ALL_SEM_DRAFT);
}

export function createEmptyDraft(): AllSemesterDraft {
  return {
    id: `all-sem-${Date.now()}`,
    session: getDefaultSession(),
    days: [...DEFAULT_DAYS],
    draftGender: 'both',
    malePeriods: [...DEFAULT_PERIODS],
    femalePeriods: [...DEFAULT_FEMALE_PERIODS],
    semesters: SEMESTERS.map(name => ({ name, courses: [], sections: [], maleRoom: '', femaleRoom: '' })),
  };
}

/* ─── Teacher Conflict Detection ─── */
export function findTeacherConflicts(
  draft: AllSemesterDraft,
  teacherName: string,
  day: string,
  periodIdx: number,
  excludeKey: string,
  tempGenderSlots?: Record<string, Record<string, Record<number, string>>>
): TeacherConflict[] {
  if (!teacherName) return [];
  const conflicts: TeacherConflict[] = [];

  // Check section-based slots
  for (const sem of draft.semesters) {
    for (const sec of sem.sections) {
      const key = `${sem.name}-${sec.gender}-${sec.branch || 'main'}`;
      if (key === excludeKey) continue;
      for (const slot of sec.slots) {
        if (slot.day !== day || slot.period !== periodIdx) continue;
        const course = sem.courses.find(c => c.code === slot.course);
        if (course && course.teacher === teacherName) {
          conflicts.push({
            semester: sem.name,
            gender: sec.gender,
            section: sec.branch || 'Main',
            courseCode: course.code,
            courseTitle: course.title,
            teacher: teacherName,
            day: slot.day,
            period: slot.period,
          });
        }
      }
    }
  }

  // Check tempGenderSlots (no-sections mode)
  if (tempGenderSlots) {
    for (const [semName, genders] of Object.entries(tempGenderSlots)) {
      for (const [gender, cells] of Object.entries(genders)) {
        const key = `${semName}-${gender}-all`;
        if (key === excludeKey) continue;
        const sem = draft.semesters.find(s => s.name === semName);
        if (!sem) continue;
        for (const [cellKey, courseCode] of Object.entries(cells)) {
          if (!courseCode) continue;
          const [cDay, periodStr] = cellKey.split(':');
          if (cDay !== day || parseInt(periodStr) !== periodIdx) continue;
          const course = sem.courses.find(c => c.code === courseCode);
          if (course && course.teacher === teacherName) {
            conflicts.push({
              semester: semName,
              gender: gender as 'male' | 'female',
              section: 'Main',
              courseCode: course.code,
              courseTitle: course.title,
              teacher: teacherName,
              day: cDay,
              period: periodIdx,
            });
          }
        }
      }
    }
  }

  return conflicts;
}
