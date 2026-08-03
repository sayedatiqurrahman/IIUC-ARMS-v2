/* ─── Shared Types & Constants for Routine Components ─── */

export interface RoutinePeriod {
  name: string;
  start: string;
  end: string;
  isBreak?: boolean;
}

export interface RoutineCourse {
  code: string;
  title: string;
  teacher: string;
  room: string;
}

export interface RoutineSlot {
  day: string;
  period: number;
  course: string;
}

export interface RoutineItem {
  id: string;
  semester: string;
  session: string;
  branch: string | null;
  gender: 'male' | 'female' | 'both' | null;
  academicYear: string;
  department: string;
  university: string;
  room: string;
  periods: RoutinePeriod[];
  days: string[];
  courses: RoutineCourse[];
  slots: RoutineSlot[];
  malePeriods?: RoutinePeriod[];
  femalePeriods?: RoutinePeriod[];
  maleSlots?: RoutineSlot[];
  femaleSlots?: RoutineSlot[];
  maleRoom?: string;
  femaleRoom?: string;
  createdAt?: number;
  published?: boolean;
  isDraft?: boolean;
  publishedBy?: { name: string; title?: string; email?: string };
  publishedAt?: number;
}

export interface DraftData {
  semester?: string;
  branch?: string | null;
  gender?: 'male' | 'female' | 'both' | null;
  session?: string;
  room?: string;
  periods?: RoutinePeriod[];
  days?: string[];
  courses?: RoutineCourse[];
  slots?: RoutineSlot[];
  malePeriods?: RoutinePeriod[];
  femalePeriods?: RoutinePeriod[];
  maleSlots?: RoutineSlot[];
  femaleSlots?: RoutineSlot[];
  maleRoom?: string;
  femaleRoom?: string;
  step?: string;
}

export interface AllSemesterDraftSection {
  branch: string | null;
  gender: 'male' | 'female';
  room: string;
  slots: RoutineSlot[];
}

export interface AllSemesterDraftSemester {
  name: string;
  courses: RoutineCourse[];
  sections: AllSemesterDraftSection[];
  maleRoom: string;
  femaleRoom: string;
}

export interface AllSemesterDraft {
  id: string;
  session: string;
  days: string[];
  draftGender: 'male' | 'female' | 'both';
  malePeriods: RoutinePeriod[];
  femalePeriods: RoutinePeriod[];
  semesters: AllSemesterDraftSemester[];
}

export interface TeacherConflict {
  semester: string;
  gender: string;
  section: string;
  courseCode: string;
  courseTitle: string;
  teacher: string;
  day: string;
  period: number;
}

export type AllSemBuilderStep = 'info' | 'courses' | 'periods' | 'assign';

export type BuilderStep = 'info' | 'courses' | 'periods' | 'assign';

export type ViewMode = 'manager' | 'preview' | 'builder' | 'allBranch';

export const DEFAULT_PERIODS: RoutinePeriod[] = [
  { name: '1st Period', start: '10:40 AM', end: '11:30 AM' },
  { name: '2nd Period', start: '11:30 AM', end: '12:20 PM' },
  { name: '3rd Period', start: '12:20 PM', end: '01:10 PM' },
  { name: 'Lunch & Zuhr Prayer Break', start: '01:10 PM', end: '01:50 PM', isBreak: true },
  { name: '4th Period', start: '01:50 PM', end: '02:40 PM' },
  { name: '5th Period', start: '02:40 PM', end: '03:30 PM' },
  { name: '6th Period', start: '03:30 PM', end: '04:20 PM' },
];

export const DEFAULT_DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday'];

export const SEMESTERS = ['1st Semester', '2nd Semester', '3rd Semester', '4th Semester', '5th Semester', '6th Semester', '7th Semester', '8th Semester'];

export const SESSIONS = (() => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const list: string[] = [];
  for (let y = currentYear - 3; y <= currentYear + 10; y++) {
    list.push(`Spring - ${y}`);
    list.push(`Autumn - ${y}`);
  }
  return list;
})();

export const DEFAULT_FEMALE_PERIODS: RoutinePeriod[] = [
  { name: '1st Period', start: '8:20 AM', end: '9:10 AM' },
  { name: '2nd Period', start: '9:10 AM', end: '10:00 AM' },
  { name: '3rd Period', start: '10:00 AM', end: '10:50 AM' },
  { name: '4th Period', start: '10:50 AM', end: '11:40 AM' },
  { name: '5th Period', start: '11:40 AM', end: '12:30 PM' },
  { name: '6th Period', start: '12:30 PM', end: '01:20 PM' },
];
