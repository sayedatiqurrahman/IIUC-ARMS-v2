/* ─── Barrel Exports for Routine Components ─── */

// Types & Constants
export type {
  RoutinePeriod,
  RoutineCourse,
  RoutineSlot,
  RoutineItem,
  DraftData,
  AllSemesterDraftSection,
  AllSemesterDraftSemester,
  AllSemesterDraft,
  TeacherConflict,
  AllSemBuilderStep,
  BuilderStep,
  ViewMode,
} from './types';

export {
  DEFAULT_PERIODS,
  DEFAULT_DAYS,
  SEMESTERS,
  SESSIONS,
  DEFAULT_FEMALE_PERIODS,
} from './types';

// Helper Functions
export {
  to24h,
  to12h,
  getDefaultSession,
  getCourse,
  getSlot,
  isOffDay,
  getTeacherAbbr,
  loadMyRoutines,
  saveMyRoutines,
  loadPublishedRoutines,
  savePublishedRoutines,
  fetchPublishedRoutinesFromDB,
  loadDraft,
  saveDraft,
  clearDraft,
  loadAllSemDraft,
  saveAllSemDraft,
  clearAllSemDraft,
  createEmptyDraft,
  findTeacherConflicts,
} from './helpers';

// Components
export { default as TeacherContacts } from './TeacherContacts';
export { default as PeriodEditor } from './PeriodEditor';
export { default as RoutineCard } from './RoutineCard';
export { default as RoutineTable } from './RoutineTable';
export { default as RoutinePlainTable } from './RoutinePlainTable';
export { default as RoutinePrintView } from './RoutinePrintView';
export { default as AllSemesterView } from './AllSemesterView';
export { default as RoutineBuilder } from './RoutineBuilder';
