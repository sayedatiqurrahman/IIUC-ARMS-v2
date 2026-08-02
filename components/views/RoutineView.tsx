'use client';

import { useRef, useState, useCallback, useEffect, forwardRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useAppStore } from '@/lib/store';
import { config } from '@/lib/config';
import { showToast } from '@/lib/utils';
import TeacherAutocomplete from '@/components/TeacherAutocomplete';
import CustomSelect from '@/components/CustomSelect';
import { useConfirm } from '@/components/ConfirmModal';

interface RoutinePeriod {
  name: string;
  start: string;
  end: string;
  isBreak?: boolean;
}

interface RoutineCourse {
  code: string;
  title: string;
  teacher: string;
  room: string;
}

interface RoutineSlot {
  day: string;
  period: number;
  course: string;
}

interface RoutineItem {
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

const DEFAULT_PERIODS: RoutinePeriod[] = [
  { name: '1st Period', start: '10:40 AM', end: '11:30 AM' },
  { name: '2nd Period', start: '11:30 AM', end: '12:20 PM' },
  { name: '3rd Period', start: '12:20 PM', end: '01:10 PM' },
  { name: 'Lunch & Zuhr Prayer Break', start: '01:10 PM', end: '01:50 PM', isBreak: true },
  { name: '4th Period', start: '01:50 PM', end: '02:40 PM' },
  { name: '5th Period', start: '02:40 PM', end: '03:30 PM' },
  { name: '6th Period', start: '03:30 PM', end: '04:20 PM' },
];

const DEFAULT_DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday'];
const SEMESTERS = ['1st Semester', '2nd Semester', '3rd Semester', '4th Semester', '5th Semester', '6th Semester', '7th Semester', '8th Semester'];
const SESSIONS = (() => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const list: string[] = [];
  for (let y = currentYear - 3; y <= currentYear + 10; y++) {
    list.push(`Spring - ${y}`);
    list.push(`Autumn - ${y}`);
  }
  return list;
})();

function getDefaultSession(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  return month < 6 ? `Spring - ${year}` : `Autumn - ${year}`;
}

function getCourse(code: string, courses: RoutineCourse[]) {
  return courses.find(c => c.code === code);
}

function getSlot(day: string, period: number, slots: RoutineSlot[]) {
  return slots.find(s => s.day === day && s.period === period);
}

function isOffDay(day: string, periods: RoutinePeriod[], slots: RoutineSlot[]) {
  const classPeriods = periods.filter(p => !p.isBreak);
  return classPeriods.every((_, idx) => !getSlot(day, idx, slots));
}

function getTeacherAbbr(teacher: string): string {
  if (!teacher) return '';
  const parts = teacher.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return parts.map(p => p[0]).join('').toUpperCase().slice(0, 4);
}

/* ─── localStorage helpers ─── */
const LS_MY_ROUTINES = 'qsis-routines';
const LS_PUBLISHED = 'qsis-published-routines';
const LS_DRAFT = 'qsis-routine-draft';

function loadMyRoutines(): RoutineItem[] {
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

function saveMyRoutines(routines: RoutineItem[]) {
  localStorage.setItem(LS_MY_ROUTINES, JSON.stringify(routines));
}

function loadPublishedRoutines(): RoutineItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LS_PUBLISHED);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function savePublishedRoutines(routines: RoutineItem[]) {
  localStorage.setItem(LS_PUBLISHED, JSON.stringify(routines));
}

async function fetchPublishedRoutinesFromDB(): Promise<RoutineItem[]> {
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

interface DraftData {
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

function loadDraft(): DraftData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_DRAFT);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveDraft(data: DraftData) {
  localStorage.setItem(LS_DRAFT, JSON.stringify(data));
}

function clearDraft() {
  localStorage.removeItem(LS_DRAFT);
}

/* ─── All Semester Draft (unified) ─── */
const LS_ALL_SEM_DRAFT = 'qsis-all-sem-draft';

const DEFAULT_FEMALE_PERIODS: RoutinePeriod[] = [
  { name: '1st Period', start: '8:20 AM', end: '9:10 AM' },
  { name: '2nd Period', start: '9:10 AM', end: '10:00 AM' },
  { name: '3rd Period', start: '10:00 AM', end: '10:50 AM' },
  { name: '4th Period', start: '10:50 AM', end: '11:40 AM' },
  { name: '5th Period', start: '11:40 AM', end: '12:30 PM' },
  { name: '6th Period', start: '12:30 PM', end: '01:20 PM' },
];

interface AllSemesterDraftSection {
  branch: string | null;
  gender: 'male' | 'female';
  room: string;
  slots: RoutineSlot[];
}

interface AllSemesterDraftSemester {
  name: string;
  courses: RoutineCourse[];
  sections: AllSemesterDraftSection[];
  maleRoom: string;
  femaleRoom: string;
}

interface AllSemesterDraft {
  id: string;
  session: string;
  days: string[];
  draftGender: 'male' | 'female' | 'both';
  malePeriods: RoutinePeriod[];
  femalePeriods: RoutinePeriod[];
  semesters: AllSemesterDraftSemester[];
}

function loadAllSemDraft(): AllSemesterDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_ALL_SEM_DRAFT);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveAllSemDraft(draft: AllSemesterDraft) {
  localStorage.setItem(LS_ALL_SEM_DRAFT, JSON.stringify(draft));
}

function clearAllSemDraft() {
  localStorage.removeItem(LS_ALL_SEM_DRAFT);
}

function createEmptyDraft(): AllSemesterDraft {
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

interface TeacherConflict {
  semester: string;
  gender: string;
  section: string;
  courseCode: string;
  courseTitle: string;
  teacher: string;
  day: string;
  period: number;
}

function findTeacherConflicts(
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

type AllSemBuilderStep = 'info' | 'courses' | 'periods' | 'assign';

type ViewMode = 'manager' | 'preview' | 'builder' | 'allBranch';

export default function RoutineView() {
  const router = useRouter();
  const { data: session } = useSession();
  const { confirm, confirmDialog } = useConfirm();
  const routineData = useAppStore(s => s.routineData);
  const routineLoading = useAppStore(s => s.routineLoading);
  const loadRoutine = useAppStore(s => s.loadRoutine);
  const profile = useAppStore(s => s.profile);
  const onboardData = useAppStore(s => s.onboardingData);
  const clearOnboarding = useAppStore(s => s.clearOnboarding);
  const printRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [hasAllSemDraft, setHasAllSemDraft] = useState(false);
  const [allSemDraftData, setAllSemDraftData] = useState<AllSemesterDraft | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('manager');
  const [myRoutines, setMyRoutines] = useState<RoutineItem[]>([]);
  const [publishedRoutines, setPublishedRoutines] = useState<RoutineItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [exportMode, setExportMode] = useState<'themed' | 'plain'>('themed');

  const email = session?.user?.email || profile.email || '';
  const isOwner = config.ownerEmails.includes(email);
  const [permissions, setPermissions] = useState<Record<string, string[]>>({});
  const [canPublish, setCanPublish] = useState(false);

  useEffect(() => {
    fetch('/api/settings/permissions')
      .then(r => r.json())
      .then(data => {
        if (!data.success) return;
        const perms = data.permissions || {};
        setPermissions(perms);
        const role = config.getEffectiveRole(email, profile.role);
        const roleKey = profile.isCR ? 'cr' : role;
        const customPerms = (profile as any).customPermissions || {};
        const allowed = perms.publishRoutine || ['admin', 'manager', 'teacher', 'cr'];
        setCanPublish(isOwner || customPerms.publishRoutine === true || allowed.includes(roleKey));
      })
      .catch(() => {});
  }, [email, profile.role, profile.isCR, isOwner]);

  const sharedRoutines: RoutineItem[] = Array.isArray(routineData) ? routineData : [];
  const routines = sharedRoutines;

  // Onboarding-based personalization for routines
  const userSemesterLabel = onboardData?.semester || null;
  const userGender = onboardData?.gender || null;
  const isMySemesterOnly = onboardData?.fileView === 'my-semester-only' && userSemesterLabel;

  // Filter routine by user's gender
  const filterByGender = (r: RoutineItem): boolean => {
    if (!userGender) return true;
    if (r.gender === 'both' || r.gender === null) return true;
    return r.gender === userGender;
  };

  const allVisibleRoutines = (() => {
    const all = [...publishedRoutines, ...sharedRoutines].filter(filterByGender);
    if (!userSemesterLabel) return all;
    if (isMySemesterOnly) {
      return all.filter(r => r.semester === userSemesterLabel);
    }
    // all-prioritized: user's semester routines first
    const userRoutines = all.filter(r => r.semester === userSemesterLabel);
    const otherRoutines = all.filter(r => r.semester !== userSemesterLabel);
    return [...userRoutines, ...otherRoutines];
  })();

  const currentPreview = myRoutines.find(r => r.id === selectedId) || allVisibleRoutines.find(r => r.id === selectedId) || null;

  useEffect(() => {
    setMyRoutines(loadMyRoutines());
    setPublishedRoutines(loadPublishedRoutines());
    const allSemDraft = loadAllSemDraft();
    setHasAllSemDraft(!!allSemDraft);
    setAllSemDraftData(allSemDraft);
    // Load published routines from DB (with auto-cleanup)
    fetchPublishedRoutinesFromDB().then(r => {
      setPublishedRoutines(r);
    });
  }, []);

  useEffect(() => {
    if (routines.length === 0 && !routineLoading) loadRoutine();
  }, [routines.length, routineLoading, loadRoutine]);

  const persistMyRoutines = useCallback((updated: RoutineItem[]) => {
    setMyRoutines(updated);
    saveMyRoutines(updated);
  }, []);

  const handleView = useCallback((id: string) => {
    setSelectedId(id);
    setViewMode('preview');
  }, []);

  const handleEdit = useCallback((id: string) => {
    setEditingId(id);
    setViewMode('builder');
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (!await confirm({ message: 'Delete this routine?', danger: true, title: 'Delete Routine' })) return;
    const updated = myRoutines.filter(r => r.id !== id);
    persistMyRoutines(updated);
    showToast('Routine deleted', 'success');
  }, [myRoutines, persistMyRoutines]);

  const handleDuplicate = useCallback((routine: RoutineItem) => {
    const dup: RoutineItem = {
      ...routine,
      id: `my-${Date.now()}`,
      semester: routine.semester + ' (Copy)',
      createdAt: Date.now(),
      published: false,
    };
    persistMyRoutines([...myRoutines, dup]);
    showToast('Routine duplicated', 'success');
  }, [myRoutines, persistMyRoutines]);

  const handlePublish = useCallback(async (routine: RoutineItem) => {
    if (!canPublish) {
      showToast('Permission denied: Only Admin, Manager, or Teacher can publish routines.', 'error');
      return;
    }
    if (!await confirm({ message: `Publish "${routine.semester}" for all users?`, title: 'Publish Routine' })) return;
    const publisherName = session?.user?.name || profile.name || 'Unknown';
    const published = {
      ...routine,
      published: true,
      isDraft: false,
      id: `pub-${Date.now()}`,
      publishedBy: { name: publisherName, email },
      publishedAt: Date.now(),
    };
    const updated = publishedRoutines.filter(r => !(r.semester === routine.semester && r.branch === routine.branch));
    updated.push(published);
    setPublishedRoutines(updated);
    savePublishedRoutines(updated);
    const myUpdated = myRoutines.map(r => r.id === routine.id ? { ...r, isDraft: false } : r);
    persistMyRoutines(myUpdated);

    // Save to DB
    fetch('/api/published-routines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routines: [published] }),
    }).catch(() => {});

    showToast('Routine published! All users can now see it.', 'success');
  }, [publishedRoutines, myRoutines, persistMyRoutines, session, profile, canPublish]);

  const handleUnpublish = useCallback((id: string) => {
    const updated = publishedRoutines.filter(r => r.id !== id);
    setPublishedRoutines(updated);
    savePublishedRoutines(updated);
    showToast('Routine unpublished', 'success');
  }, [publishedRoutines]);

  const canEditPublished = useCallback((routine: RoutineItem) => {
    if (isOwner) return true;
    if (routine.publishedBy?.email && routine.publishedBy.email === email) return true;
    return false;
  }, [isOwner, email]);

  const handleEditPublished = useCallback((id: string) => {
    setEditingId(id);
    setViewMode('builder');
  }, []);

  const handleExport = useCallback(async (format: 'pdf' | 'png' | 'jpeg') => {
    if (!printRef.current) return;
    setExporting(true);
    try {
      const el = printRef.current;
      const domtoimage = (await import('dom-to-image-more')).default;

      const exportContainer = document.createElement('div');
      exportContainer.style.cssText = 'position:fixed;left:-9999px;top:0;width:920px;z-index:-1;opacity:0;pointer-events:none;background:#fff;padding:0;margin:0';
      document.body.appendChild(exportContainer);

      const clone = el.cloneNode(true) as HTMLElement;
      clone.style.width = '920px';
      clone.style.minWidth = '920px';
      clone.style.maxWidth = '920px';
      clone.style.margin = '0';
      clone.style.border = '2px solid #166534';
      clone.style.borderRadius = '12px';
      clone.style.overflow = 'hidden';
      exportContainer.appendChild(clone);

      clone.querySelectorAll<HTMLElement>('.routine-course-code').forEach(n => { n.style.whiteSpace = 'nowrap'; });
      clone.querySelectorAll<HTMLElement>('.routine-course-title').forEach(n => { n.style.whiteSpace = 'normal'; n.style.overflowWrap = 'break-word'; });
      clone.querySelectorAll<HTMLElement>('.routine-course-teacher').forEach(n => { n.style.whiteSpace = 'nowrap'; });
      clone.querySelectorAll<HTMLElement>('.routine-th').forEach(n => { n.style.whiteSpace = 'nowrap'; });
      clone.querySelectorAll<HTMLElement>('.routine-time-text').forEach(n => { n.style.whiteSpace = 'nowrap'; });
      clone.querySelectorAll<HTMLElement>('.routine-time-sub').forEach(n => { n.style.whiteSpace = 'nowrap'; });
      clone.querySelectorAll<HTMLElement>('.routine-period-name').forEach(n => { n.style.whiteSpace = 'nowrap'; });

      const badges = clone.querySelector('.routine-badges') as HTMLElement | null;
      if (badges) { badges.style.flexWrap = 'nowrap'; badges.style.justifyContent = 'center'; }

      const table = clone.querySelector('.routine-table') as HTMLElement | null;
      if (table) {
        table.style.tableLayout = 'fixed';
        table.style.width = '100%';
        const ths = Array.from(table.querySelectorAll<HTMLElement>('.routine-th'));
        const dayCount = ths.length - 1;
        if (dayCount > 0) {
          ths[0].style.width = '110px';
          const dayWidth = `calc((100% - 110px) / ${dayCount})`;
          for (let i = 1; i < ths.length; i++) ths[i].style.width = dayWidth;
        }
      }

      await new Promise(r => setTimeout(r, 200));

      const dataUrl = await domtoimage.toPng(clone, {
        quality: 0.95,
        pixelRatio: 3,
        bgcolor: '#ffffff',
        cacheBust: true,
        width: 920,
        style: { borderRadius: '12px', overflow: 'hidden' },
        filter: (node: HTMLElement) => !node.classList?.contains('no-print'),
      });

      document.body.removeChild(exportContainer);

      if (format === 'pdf') {
        const { jsPDF } = await import('jspdf');
        const img = new Image();
        img.src = dataUrl;
        await new Promise<void>((resolve) => { img.onload = () => resolve(); });

        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfW = pdf.internal.pageSize.getWidth();
        const pdfH = pdf.internal.pageSize.getHeight();
        const margin = 10;
        const contentW = pdfW - margin * 2;
        const contentH = pdfH - margin * 2;
        const imgRatio = img.width / img.height;
        const contentRatio = contentW / contentH;

        let drawW: number, drawH: number;
        if (imgRatio > contentRatio) {
          drawW = contentW;
          drawH = contentW / imgRatio;
        } else {
          drawH = contentH;
          drawW = contentH * imgRatio;
        }

        const xOffset = margin + (contentW - drawW) / 2;
        const yOffset = margin + (contentH - drawH) / 2;

        pdf.addImage(dataUrl, 'PNG', xOffset, yOffset, drawW, drawH);
        pdf.save(`QSIS-Routine-${currentPreview?.semester || 'Routine'}.pdf`);
      } else {
        const link = document.createElement('a');
        link.download = `QSIS-Routine-${currentPreview?.semester || 'Routine'}.${format}`;
        link.href = format === 'png' ? dataUrl : dataUrl.replace('image/png', 'image/jpeg');
        link.click();
      }
    } catch (err) { console.error('Export failed:', err); }
    finally { setExporting(false); }
  }, [currentPreview]);

  const handleSaveBuilder = useCallback((routine: RoutineItem) => {
    const isPublishedEdit = editingId && publishedRoutines.some(r => r.id === editingId);
    if (isPublishedEdit) {
      const updated = publishedRoutines.map(r => r.id === editingId ? { ...routine, published: true, isDraft: false, publishedBy: r.publishedBy, publishedAt: r.publishedAt } : r);
      setPublishedRoutines(updated);
      savePublishedRoutines(updated);
      fetch('/api/published-routines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routines: updated.filter(r => r.id === editingId) }),
      }).catch(() => {});
    } else {
      let updated: RoutineItem[];
      if (editingId) {
        updated = myRoutines.map(r => r.id === editingId ? routine : r);
      } else {
        updated = [...myRoutines, routine];
      }
      persistMyRoutines(updated);
    }
    setEditingId(null);
    setViewMode('manager');
    showToast(editingId ? 'Routine updated!' : 'Routine created!', 'success');
  }, [myRoutines, editingId, persistMyRoutines, publishedRoutines]);

  const handleCancelBuilder = useCallback(() => {
    setEditingId(null);
    setViewMode('manager');
  }, []);

  if (routineLoading && myRoutines.length === 0) {
    return (
      <section className="mb-5">
        <div className="routine-page-header no-print">
          <div><h3 className="routine-page-title"><i className="fas fa-calendar-alt"></i> Class Routine</h3><p className="routine-page-sub">Manage and view your class schedules</p></div>
        </div>
        <div className="loading-container">
          <div className="book-loader"><div className="book-base"></div><div className="book-spine-loader"></div><div className="book-cover"></div><div className="book-page-stack"><div className="book-page"></div><div className="book-page"></div><div className="book-page"></div></div><div className="page-shadow"></div><div className="page-shadow"></div><div className="page-shadow"></div></div>
          <div className="loading-text">Loading routine<span className="loading-dots"></span></div>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-5">
      {/* ─── MANAGER VIEW ─── */}
      {viewMode === 'manager' && (
        <>
          <div className="routine-page-header no-print">
            <div>
              <h3 className="routine-page-title"><i className="fas fa-calendar-alt"></i> Class Routine</h3>
              {profile?.department && (
                <p className="routine-page-sub" style={{ color: '#22c55e' }}>
                  <i className="fas fa-building mr-1"></i>{profile.department}
                  {profile.semester && <><span className="mx-1">&bull;</span><i className="fas fa-graduation-cap mr-1"></i>{config.semesters.find(s => s.id === profile.semester)?.label || profile.semester}</>}
                </p>
              )}
              {!profile?.department && (
                <p className="routine-page-sub">Manage and view your class schedules</p>
              )}
            </div>
            <div className="routine-page-actions">
              <button className="routine-btn routine-btn-primary" onClick={() => {
                const draftId = `draft-${Date.now()}`;
                const draft: RoutineItem = {
                  id: draftId,
                  semester: SEMESTERS[0],
                  branch: null,
                  gender: null,
                  session: getDefaultSession(),
                  room: '',
                  academicYear: new Date().getFullYear().toString(),
                  department: 'Department of Qur\'anic Sciences & Islamic Studies',
                  university: 'International Islamic University Chittagong',
                  periods: [...DEFAULT_PERIODS],
                  days: [...DEFAULT_DAYS],
                  courses: [],
                  slots: [],
                  createdAt: Date.now(),
                  isDraft: true,
                };
                persistMyRoutines([...myRoutines, draft]);
                setEditingId(draftId);
                setViewMode('builder');
              }}>
                <i className="fas fa-plus"></i> Create New
              </button>
              {canPublish && (
                <button className="routine-btn routine-btn-accent" onClick={() => setViewMode('allBranch')}>
                  <i className="fas fa-layer-group"></i> All Semester Routine
                </button>
              )}
              <button className="routine-btn routine-btn-ghost" onClick={() => router.push('/')}><i className="fas fa-arrow-left"></i> Back</button>
            </div>
          </div>

          {/* Edit preference banner for my-semester-only */}
          {isMySemesterOnly && onboardData && (
            <div className="mb-4 no-print flex items-center gap-3 px-4 py-3 rounded-xl border border-qsis/30 bg-qsis/5 text-[0.8rem]">
              <i className="fas fa-filter text-qsis flex-shrink-0"></i>
              <span className="text-dark-text2">
                Showing only <strong className="text-dark-text">{onboardData.semester}</strong> routines for <strong className="text-dark-text">{userGender === 'male' ? 'Male' : 'Female'}</strong>.
              </span>
              <button
                onClick={() => { clearOnboarding(); window.location.reload(); }}
                className="ml-auto px-3 py-1.5 rounded-lg bg-qsis/10 border border-qsis/30 text-qsis text-[0.75rem] font-semibold cursor-pointer hover:bg-qsis/20 transition-colors flex-shrink-0"
              >
                <i className="fas fa-edit mr-1"></i> Change Preference
              </button>
            </div>
          )}

          {myRoutines.length === 0 && allVisibleRoutines.length === 0 && !hasAllSemDraft ? (
            <div className="routine-empty-state">
              <div className="routine-empty-icon"><i className="fas fa-calendar-plus"></i></div>
              <h4>No Routines Yet</h4>
              <p>Create your first class routine to get started.</p>
              <button className="routine-btn routine-btn-primary" onClick={() => { setEditingId(null); setViewMode('builder'); }}>
                <i className="fas fa-plus"></i> Create Your First Routine
              </button>
            </div>
          ) : (
            <>
              {hasAllSemDraft && (
                <div className="routine-manager-section">
                  <h4 className="routine-manager-section-title"><i className="fas fa-layer-group"></i> All Semester Routine Draft</h4>
                  <div className="routine-manager-grid">
                    <div className="routine-card routine-card-draft" style={{ borderStyle: 'dashed' }}>
                      <div className="routine-card-header">
                        <div>
                          <h4 className="routine-card-title">All Semester Routine</h4>
                          <p className="routine-card-meta">{allSemDraftData?.session || 'Untitled'}</p>
                        </div>
                        <span className="routine-card-draft-badge"><i className="fas fa-pen"></i> Draft</span>
                      </div>
                      <div className="routine-card-body">
                        <p className="routine-card-info">
                          <i className="fas fa-layer-group"></i> {allSemDraftData?.semesters?.length || 0} semesters · {allSemDraftData?.draftGender === 'both' ? 'Male & Female' : allSemDraftData?.draftGender === 'male' ? 'Male Only' : 'Female Only'}
                        </p>
                      </div>
                      <div className="routine-card-actions">
                        <button className="routine-card-btn routine-card-btn-view" onClick={() => setViewMode('allBranch')}>
                          <i className="fas fa-edit"></i> Continue Editing
                        </button>
                        <button className="routine-card-btn routine-card-btn-delete" onClick={async () => {
                          if (await confirm({ message: 'Delete all-semester draft?', danger: true, title: 'Delete Draft' })) {
                            clearAllSemDraft();
                            setHasAllSemDraft(false);
                            setAllSemDraftData(null);
                            showToast('Draft deleted', 'success');
                          }
                        }}>
                          <i className="fas fa-trash"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {myRoutines.length > 0 && (
                <div className="routine-manager-section">
                  <h4 className="routine-manager-section-title"><i className="fas fa-user-edit"></i> My Routines</h4>
                  <div className="routine-manager-grid">
                    {myRoutines.map(r => (
                      <RoutineCard key={r.id} routine={r} onView={handleView} onEdit={handleEdit} onDelete={handleDelete} onDuplicate={handleDuplicate} onPublish={canPublish ? handlePublish : undefined} currentUserEmail={email} isAdmin={isOwner} />
                    ))}
                  </div>
                </div>
              )}

              {allVisibleRoutines.length > 0 && (
                <div className="routine-manager-section">
                  <h4 className="routine-manager-section-title"><i className="fas fa-globe"></i> Published Routines</h4>
                  <div className="routine-manager-grid">
                    {allVisibleRoutines.map(r => (
                      <RoutineCard key={r.id} routine={r} isPublished onView={handleView} onEdit={canEditPublished(r) ? handleEditPublished : undefined} onUnpublish={canPublish ? handleUnpublish : undefined} onDelete={canPublish ? handleUnpublish : undefined} currentUserEmail={email} isAdmin={isOwner} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ─── BUILDER VIEW ─── */}
      {viewMode === 'builder' && (
        <>
          <div className="routine-page-header no-print">
            <div>
              <h3 className="routine-page-title"><i className={`fas fa-${editingId ? 'edit' : 'plus-circle'}`}></i> {editingId ? 'Edit Routine' : 'Create New Routine'}</h3>
              <p className="routine-page-sub">Build your custom class schedule step by step</p>
            </div>
          </div>
          <RoutineBuilder
            existing={editingId ? (myRoutines.find(r => r.id === editingId) || publishedRoutines.find(r => r.id === editingId) || null) : null}
            onSave={handleSaveBuilder}
            onCancel={handleCancelBuilder}
          />
        </>
      )}

      {/* ─── PREVIEW VIEW ─── */}
      {viewMode === 'preview' && currentPreview && (
        <>
          <div className="routine-page-header no-print">
            <div>
              <h3 className="routine-page-title"><i className="fas fa-eye"></i> {currentPreview.semester}{currentPreview.gender ? ` — ${currentPreview.gender === 'male' ? 'Male' : 'Female'} Branch` : ''}{currentPreview.branch ? ` - Branch ${currentPreview.branch}` : ''}</h3>
              <p className="routine-page-sub">Session: {currentPreview.session}</p>
            </div>
            <div className="routine-page-actions">
              {exporting && <span className="routine-exporting"><i className="fas fa-spinner fa-spin"></i> Exporting...</span>}
              <button disabled={exporting} className="routine-btn routine-btn-outline" onClick={() => handleExport('pdf')}><i className="fas fa-file-pdf"></i> PDF</button>
              <button disabled={exporting} className="routine-btn routine-btn-outline" onClick={() => handleExport('png')}><i className="fas fa-image"></i> PNG</button>
              <button onClick={() => setExportMode(exportMode === 'themed' ? 'plain' : 'themed')} className="routine-btn routine-btn-outline"><i className="fas fa-file-alt"></i> {exportMode === 'themed' ? 'Plain Table' : 'Themed View'}</button>
              <button className="routine-btn routine-btn-ghost" onClick={() => setViewMode('manager')}><i className="fas fa-arrow-left"></i> Back</button>
            </div>
          </div>
          <div className="routine-preview-scroll">
            {exportMode === 'themed' ? (
              <RoutinePrintView ref={printRef} routine={currentPreview} />
            ) : (
              <RoutinePlainTable routine={currentPreview} />
            )}
          </div>
        </>
      )}

      {/* ─── ALL SEMESTER ROUTINE VIEW ─── */}
      {viewMode === 'allBranch' && (
        <AllSemesterView
          publishedRoutines={publishedRoutines}
          onView={handleView}
          onPublish={(routines) => {
            const publisherName = session?.user?.name || profile.name || 'Unknown';
            let updated: RoutineItem[];
            if (routines.length === 0) {
              updated = [];
            } else {
              updated = publishedRoutines.filter(r => !routines.some(nr => nr.semester === r.semester && nr.gender === r.gender && nr.branch === r.branch));
              routines.forEach(r => {
                updated.push({ ...r, publishedBy: { name: publisherName, email }, publishedAt: Date.now() });
              });
            }
            setPublishedRoutines(updated);
            savePublishedRoutines(updated);
            // Save to DB
            fetch('/api/published-routines', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ routines: updated.filter(r => routines.some(nr => nr.id === r.id)) }),
            }).catch(() => {});
          }}
          onBack={() => setViewMode('manager')}
        />
      )}
      {confirmDialog}
    </section>
  );
}

/* ═══════════════════════════════════════════════════════
   ALL SEMESTER ROUTINE VIEW — 4-Step Builder
   Unified draft with room per section, teacher conflicts
   ═══════════════════════════════════════════════════════ */

function AllSemesterView({ publishedRoutines, onView, onPublish, onBack }: {
  publishedRoutines: RoutineItem[];
  onView: (id: string) => void;
  onPublish: (routines: RoutineItem[]) => void;
  onBack: () => void;
}) {
  const { confirm, confirmDialog } = useConfirm();
  const [draft, setDraft] = useState<AllSemesterDraft>(() => {
    const existing = loadAllSemDraft();
    if (existing) {
      if (!existing.malePeriods) existing.malePeriods = [...DEFAULT_PERIODS];
      if (!existing.femalePeriods) existing.femalePeriods = [...DEFAULT_FEMALE_PERIODS];
      if (!existing.draftGender) existing.draftGender = 'both';
      for (const sem of existing.semesters) {
        if (!('maleRoom' in sem)) (sem as any).maleRoom = '';
        if (!('femaleRoom' in sem)) (sem as any).femaleRoom = '';
      }
      return existing;
    }
    const fresh = createEmptyDraft();
    saveAllSemDraft(fresh);
    return fresh;
  });
  const [step, setStep] = useState<AllSemBuilderStep>('info');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [addingSem, setAddingSem] = useState(false);
  const [newSemName, setNewSemName] = useState('');
  const [expandedSemCourses, setExpandedSemCourses] = useState<number | null>(null);
  const [periodTab, setPeriodTab] = useState<'male' | 'female'>('male');
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [conflictMap, setConflictMap] = useState<Record<string, string[]>>({});

  // Temporary slots for gender-level grid (no sections)
  const [tempGenderSlots, setTempGenderSlots] = useState<Record<string, Record<string, Record<number, string>>>>({});

  useEffect(() => {
    const timer = setTimeout(() => saveAllSemDraft(draft), 600);
    return () => clearTimeout(timer);
  }, [draft]);

  useEffect(() => {
    const newConflicts: Record<string, string[]> = {};
    // Check section-based slots
    for (const sem of draft.semesters) {
      for (const sec of sem.sections) {
        const refPeriods = sec.gender === 'male' ? draft.malePeriods : draft.femalePeriods;
        const classPeriods = refPeriods.filter(p => !p.isBreak);
        const key = `${sem.name}-${sec.gender}-${sec.branch || 'main'}`;
        for (const slot of sec.slots) {
          const course = sem.courses.find(c => c.code === slot.course);
          if (!course?.teacher) continue;
          const cpIdx = classPeriods.reduce((acc, p, i) => i <= slot.period && !p.isBreak ? acc + 1 : acc, 0) - 1;
          const conflicts = findTeacherConflicts(draft, course.teacher, slot.day, cpIdx, key, tempGenderSlots);
          if (conflicts.length > 0) {
            const cellKey = `${key}:${slot.day}:${cpIdx}`;
            newConflicts[cellKey] = conflicts.map(c => `${c.semester} / ${c.gender} / ${c.section} — ${c.courseCode} (${c.teacher})`);
          }
        }
      }
    }
    // Check tempGenderSlots (no-sections mode)
    for (const [semName, genders] of Object.entries(tempGenderSlots)) {
      for (const [gender, cells] of Object.entries(genders)) {
        const refPeriods = gender === 'male' ? draft.malePeriods : draft.femalePeriods;
        const classPeriods = refPeriods.filter(p => !p.isBreak);
        const key = `${semName}-${gender}-all`;
        for (const [cellKey, courseCode] of Object.entries(cells)) {
          if (!courseCode) continue;
          const [day, periodStr] = cellKey.split(':');
          const periodIdx = parseInt(periodStr);
          const sem = draft.semesters.find(s => s.name === semName);
          const course = sem?.courses.find(c => c.code === courseCode);
          if (!course?.teacher) continue;
          const cpIdx = classPeriods.reduce((acc, p, i) => i <= periodIdx && !p.isBreak ? acc + 1 : acc, 0) - 1;
          const conflicts = findTeacherConflicts(draft, course.teacher, day, cpIdx, key, tempGenderSlots);
          if (conflicts.length > 0) {
            const ck = `${key}:${day}:${cpIdx}`;
            newConflicts[ck] = conflicts.map(c => `${c.semester} / ${c.gender} / ${c.section} — ${c.courseCode} (${c.teacher})`);
          }
        }
      }
    }
    setConflictMap(newConflicts);
  }, [draft, tempGenderSlots]);

  // Load saved courses from DB on mount and populate semesters
  useEffect(() => {
    fetch('/api/semester-courses')
      .then(r => r.json())
      .then(data => {
        if (!data.success || !data.courses?.length) return;
        // Group courses by semester
        const courseMap: Record<string, { code: string; title: string; teacher: string; room: string }[]> = {};
        for (const c of data.courses) {
          if (!courseMap[c.semester]) courseMap[c.semester] = [];
          courseMap[c.semester].push({ code: c.code, title: c.title, teacher: c.teacher || '', room: c.room || '' });
        }
        // Populate semesters that have saved courses
        setDraft(prev => {
          const updated = { ...prev };
          updated.semesters = prev.semesters.map(sem => {
            const saved = courseMap[sem.name];
            if (saved && sem.courses.length === 0) {
              return { ...sem, courses: saved };
            }
            return sem;
          });
          saveAllSemDraft(updated);
          return updated;
        });
      })
      .catch(() => {});
  }, []);

  // Save courses to DB when they change (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      for (const sem of draft.semesters) {
        if (sem.courses.length === 0) continue;
        fetch('/api/semester-courses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ semester: sem.name, courses: sem.courses }),
        }).catch(() => {});
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [draft.semesters]);

  const updateDraft = (patch: Partial<AllSemesterDraft>) => setDraft(prev => ({ ...prev, ...patch }));
  const toggle = (key: string) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const steps: { key: AllSemBuilderStep; label: string; icon: string; num: number }[] = [
    { key: 'info', label: 'Basic Info', icon: 'info-circle', num: 1 },
    { key: 'courses', label: 'Add Courses', icon: 'book', num: 2 },
    { key: 'periods', label: 'Time Periods', icon: 'clock', num: 3 },
    { key: 'assign', label: 'Assign Grid', icon: 'table', num: 4 },
  ];
  const currentStepIdx = steps.findIndex(s => s.key === step);

  const addSemester = () => {
    const name = newSemName.trim();
    if (!name) return;
    if (draft.semesters.some(s => s.name === name)) { showToast('Semester already exists', 'error'); return; }
    updateDraft({ semesters: [...draft.semesters, { name, courses: [], sections: [], maleRoom: '', femaleRoom: '' }] });
    setNewSemName(''); setAddingSem(false);
  };

  const removeSemester = async (idx: number) => {
    if (!await confirm({ message: `Delete "${draft.semesters[idx].name}"?`, danger: true, title: 'Delete Semester' })) return;
    updateDraft({ semesters: draft.semesters.filter((_, i) => i !== idx) });
  };

  const addSectionToSem = (semIdx: number, gender: 'male' | 'female') => {
    const sem = draft.semesters[semIdx];
    const genderSections = sem.sections.filter(s => s.gender === gender);
    const existingBranches = genderSections.map(s => s.branch).filter(Boolean) as string[];
    const nextLetter = String.fromCharCode(65 + existingBranches.length);
    const newSection: AllSemesterDraftSection = { branch: nextLetter, gender, room: '', slots: [] };
    const updated = { ...draft };
    updated.semesters = [...updated.semesters];
    updated.semesters[semIdx] = { ...updated.semesters[semIdx], sections: [...updated.semesters[semIdx].sections, newSection] };
    setDraft(updated);
  };

  const removeSectionFromSem = async (semIdx: number, sectionIdx: number) => {
    if (!await confirm({ message: 'Delete this section?', danger: true, title: 'Delete Section' })) return;
    const updated = { ...draft };
    updated.semesters = [...updated.semesters];
    updated.semesters[semIdx] = { ...updated.semesters[semIdx], sections: updated.semesters[semIdx].sections.filter((_, i) => i !== sectionIdx) };
    setDraft(updated);
  };

  const updateSectionRoom = (semIdx: number, sectionIdx: number, room: string) => {
    const updated = { ...draft };
    updated.semesters = [...updated.semesters];
    updated.semesters[semIdx] = { ...updated.semesters[semIdx], sections: [...updated.semesters[semIdx].sections] };
    updated.semesters[semIdx].sections[sectionIdx] = { ...updated.semesters[semIdx].sections[sectionIdx], room };
    setDraft(updated);
  };

  const setSlotInSection = (semIdx: number, sectionIdx: number, day: string, period: number, courseCode: string) => {
    const updated = { ...draft };
    updated.semesters = [...updated.semesters];
    updated.semesters[semIdx] = { ...updated.semesters[semIdx], sections: [...updated.semesters[semIdx].sections] };
    const sec = { ...updated.semesters[semIdx].sections[sectionIdx] };
    if (courseCode === '') {
      sec.slots = sec.slots.filter(s => !(s.day === day && s.period === period));
    } else if (sec.slots.find(s => s.day === day && s.period === period)) {
      sec.slots = sec.slots.map(s => s.day === day && s.period === period ? { ...s, course: courseCode } : s);
    } else {
      sec.slots = [...sec.slots, { day, period, course: courseCode }];
    }
    updated.semesters[semIdx].sections[sectionIdx] = sec;
    setDraft(updated);
  };

  const addCourseToSem = (semIdx: number) => {
    const updated = { ...draft };
    updated.semesters = [...updated.semesters];
    updated.semesters[semIdx] = { ...updated.semesters[semIdx], courses: [...updated.semesters[semIdx].courses, { code: '', title: '', teacher: '', room: '' }] };
    setDraft(updated);
  };

  const updateSemCourse = (semIdx: number, cIdx: number, field: keyof RoutineCourse, value: string) => {
    const updated = { ...draft };
    updated.semesters = [...updated.semesters];
    const courses = [...updated.semesters[semIdx].courses];
    courses[cIdx] = { ...courses[cIdx], [field]: value };
    updated.semesters[semIdx] = { ...updated.semesters[semIdx], courses };
    setDraft(updated);
  };

  const removeSemCourse = (semIdx: number, cIdx: number) => {
    const updated = { ...draft };
    updated.semesters = [...updated.semesters];
    updated.semesters[semIdx] = { ...updated.semesters[semIdx], courses: updated.semesters[semIdx].courses.filter((_, i) => i !== cIdx) };
    setDraft(updated);
  };

  const updatePeriods = (gender: 'male' | 'female', periods: RoutinePeriod[]) => {
    updateDraft(gender === 'male' ? { malePeriods: periods } : { femalePeriods: periods });
  };

  const handlePublishAll = async () => {
    if (Object.keys(conflictMap).length > 0) {
      showToast('Cannot publish — teacher conflicts detected! Fix all conflicts first.', 'error');
      return;
    }
    const routines: RoutineItem[] = [];
    for (const sem of draft.semesters) {
      for (const gender of getGendersToShow()) {
        const genderSections = sem.sections.filter(s => s.gender === gender);
        const genderRoomKey = gender === 'male' ? 'maleRoom' : 'femaleRoom';
        if (genderSections.length > 0) {
          for (const section of genderSections) {
            const isMale = section.gender === 'male';
            const refPeriods = isMale ? draft.malePeriods : draft.femalePeriods;
            routines.push({
              id: `pub-${Date.now()}-${sem.name.replace(/\s/g, '')}-${section.gender}-${section.branch || 'main'}-${Math.random().toString(36).slice(2, 6)}`,
              semester: sem.name, branch: section.branch, gender: section.gender,
              session: draft.session, room: section.room,
              academicYear: new Date().getFullYear().toString(),
              department: 'Department of Qur\'anic Sciences & Islamic Studies',
              university: 'International Islamic University Chittagong',
              periods: refPeriods, days: draft.days,
              courses: sem.courses, slots: section.slots,
              createdAt: Date.now(), published: true, isDraft: false,
            });
          }
        } else {
          const refPeriods = gender === 'male' ? draft.malePeriods : draft.femalePeriods;
          // Convert tempGenderSlots to RoutineSlot[]
          const genderSlots: RoutineSlot[] = [];
          const semGenderSlots = tempGenderSlots[sem.name]?.[gender] || {};
          for (const [key, course] of Object.entries(semGenderSlots)) {
            if (course) {
              const [day, periodStr] = key.split(':');
              genderSlots.push({ day, period: parseInt(periodStr), course });
            }
          }
          routines.push({
            id: `pub-${Date.now()}-${sem.name.replace(/\s/g, '')}-${gender}-all-${Math.random().toString(36).slice(2, 6)}`,
            semester: sem.name, branch: null, gender,
            session: draft.session, room: sem[genderRoomKey],
            academicYear: new Date().getFullYear().toString(),
            department: 'Department of Qur\'anic Sciences & Islamic Studies',
            university: 'International Islamic University Chittagong',
            periods: refPeriods, days: draft.days,
            courses: sem.courses, slots: genderSlots,
            createdAt: Date.now(), published: true, isDraft: false,
          });
        }
      }
    }
    if (routines.length === 0) { showToast('No sections to publish', 'error'); return; }
    if (!await confirm({ message: `Publish ${routines.length} routine(s)?`, title: 'Publish Routines' })) return;
    onPublish(routines);
    showToast(`${routines.length} routines published!`, 'success');
  };

  const getGendersToShow = (): ('male' | 'female')[] => {
    if (draft.draftGender === 'both') return ['male', 'female'];
    return [draft.draftGender];
  };

  return (
    <>
      <div className="routine-page-header no-print">
        <div>
          <h3 className="routine-page-title"><i className="fas fa-layer-group"></i> All Semester Routine</h3>
          <p className="routine-page-sub">4-step builder for all semesters, genders &amp; sections with separate rooms</p>
        </div>
        <div className="routine-page-actions">
          <button className="routine-btn routine-btn-save" onClick={handlePublishAll}><i className="fas fa-share-alt"></i> Publish All</button>
          <button className="routine-btn routine-btn-ghost" onClick={onBack}><i className="fas fa-arrow-left"></i> Back</button>
        </div>
      </div>

      <div className="routine-builder-steps">
        {steps.map((s, idx) => (
          <div key={s.key} className={`routine-step ${step === s.key ? 'active' : ''} ${idx < currentStepIdx ? 'completed' : ''}`}>
            <div className="routine-step-num">{idx < currentStepIdx ? <i className="fas fa-check"></i> : s.num}</div>
            <span className="routine-step-label">{s.label}</span>
            {idx < steps.length - 1 && <div className="routine-step-line"></div>}
          </div>
        ))}
      </div>

      {/* ═══════════════ STEP 1: BASIC INFO ═══════════════ */}
      {step === 'info' && (
        <div className="routine-builder-section">
          <h4><i className="fas fa-info-circle"></i> Basic Information</h4>
          <div className="routine-form-grid">
            <div className="routine-form-group">
              <label>Session</label>
              <input value={draft.session} onChange={e => updateDraft({ session: e.target.value })} placeholder="e.g. Autumn - 2026" />
            </div>
            <div className="routine-form-group">
              <label>Gender</label>
              <CustomSelect
                value={draft.draftGender}
                onChange={(val) => updateDraft({ draftGender: val as 'male' | 'female' | 'both' })}
                placeholder="Select gender"
                options={[
                  { value: 'male', label: 'Male Only', icon: 'fas fa-mars' },
                  { value: 'female', label: 'Female Only', icon: 'fas fa-venus' },
                  { value: 'both', label: 'Both (Male & Female)', icon: 'fas fa-venus-mars' },
                ]}
              />
            </div>
            {draft.draftGender === 'both' ? (
              <>
                <div className="routine-form-group">
                  <label><i className="fas fa-mars text-blue-400 mr-1"></i>Male Room</label>
                  <input value={draft.semesters[0]?.maleRoom || ''} onChange={e => {
                    const updated = { ...draft };
                    updated.semesters = updated.semesters.map(s => ({ ...s, maleRoom: e.target.value }));
                    setDraft(updated);
                  }} placeholder="e.g. Room 301" />
                </div>
                <div className="routine-form-group">
                  <label><i className="fas fa-venus text-pink-400 mr-1"></i>Female Room</label>
                  <input value={draft.semesters[0]?.femaleRoom || ''} onChange={e => {
                    const updated = { ...draft };
                    updated.semesters = updated.semesters.map(s => ({ ...s, femaleRoom: e.target.value }));
                    setDraft(updated);
                  }} placeholder="e.g. Room 202" />
                </div>
              </>
            ) : null}
            <div className="routine-form-group routine-form-full">
              <label>Class Days</label>
              <div className="routine-day-selector">
                {['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(d => (
                  <button key={d} type="button" className={`routine-day-btn ${draft.days.includes(d) ? 'active' : ''}`}
                    onClick={() => updateDraft({ days: draft.days.includes(d) ? draft.days.filter(dd => dd !== d) : [...draft.days, d].sort() })}>
                    <span className="routine-day-short">{d.slice(0, 3)}</span>
                    <span className="routine-day-full">{d}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="routine-form-group routine-form-full" style={{ marginTop: 12 }}>
            <label>Semesters</label>
            {draft.semesters.map((sem, semIdx) => {
              const semExpanded = expanded[`sem-${semIdx}`];
              const gendersToShow = getGendersToShow();
              return (
                <div key={sem.name} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
                  <div onClick={() => toggle(`sem-${semIdx}`)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', cursor: 'pointer', background: semExpanded ? 'var(--bg3)' : 'transparent' }}>
                    <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text2)', border: '1px solid var(--border)' }}>{semIdx + 1}</span>
                    <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 600 }}>{sem.name}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text3, #94a3b8)' }}>{sem.courses.length} courses, {sem.sections.length} sections</span>
                    <button onClick={e => { e.stopPropagation(); removeSemester(semIdx); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3, #94a3b8)', fontSize: '0.7rem', padding: 4 }}><i className="fas fa-trash-alt"></i></button>
                    <i className={`fas fa-chevron-${semExpanded ? 'up' : 'down'}`} style={{ fontSize: '0.7rem', color: 'var(--text2)' }}></i>
                  </div>
                  {semExpanded && (
                    <div style={{ padding: '0 12px 12px', borderTop: '1px solid var(--border)' }}>
                      {gendersToShow.map(gender => {
                        const genderSections = sem.sections.filter(s => s.gender === gender);
                        const gColor = gender === 'male' ? '#3b82f6' : '#ec4899';
                        const genderRoomKey = gender === 'male' ? 'maleRoom' : 'femaleRoom';
                        return (
                          <div key={gender} style={{ marginTop: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: gColor }}>
                                <i className={`fas fa-${gender === 'male' ? 'mars' : 'venus'}`} style={{ marginRight: 4 }}></i>
                                {gender === 'male' ? 'Male' : 'Female'}
                              </span>
                              <span style={{ fontSize: '0.68rem', color: 'var(--text3, #94a3b8)' }}>({genderSections.length} sections)</span>
                              {genderSections.length === 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
                                  <label style={{ fontSize: '0.7rem', color: 'var(--text2)' }}>Room:</label>
                                  <input value={sem[genderRoomKey]} onChange={e => {
                                    const updated = { ...draft };
                                    updated.semesters = [...updated.semesters];
                                    updated.semesters[semIdx] = { ...updated.semesters[semIdx], [genderRoomKey]: e.target.value };
                                    setDraft(updated);
                                  }} placeholder="e.g. Room 301"
                                    style={{ width: 130, padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '0.75rem', outline: 'none' }} />
                                </div>
                              )}
                              <button onClick={() => addSectionToSem(semIdx, gender)} style={{ marginLeft: 'auto', fontSize: '0.68rem', padding: '2px 8px', borderRadius: 6, border: `1px solid ${gColor}40`, background: `${gColor}10`, color: gColor, cursor: 'pointer' }}>
                                <i className="fas fa-plus" style={{ marginRight: 2 }}></i> Section
                              </button>
                            </div>
                            {genderSections.length === 0 && (
                              <p style={{ fontSize: '0.72rem', color: 'var(--text3, #94a3b8)', paddingLeft: 20, marginBottom: 4 }}>No sections — using gender room above</p>
                            )}
                            {genderSections.map((sec) => {
                              const secIdx = sem.sections.indexOf(sec);
                              return (
                                <div key={secIdx} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px 4px 20px', fontSize: '0.78rem' }}>
                                  <span style={{ fontWeight: 600, minWidth: 70 }}>Section {sec.branch || 'Main'}</span>
                                  <input value={sec.room} onChange={e => updateSectionRoom(semIdx, secIdx, e.target.value)} placeholder="Room (optional)"
                                    style={{ width: 140, padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '0.75rem', outline: 'none' }} />
                                  <button onClick={() => removeSectionFromSem(semIdx, secIdx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '0.68rem', padding: 2 }}><i className="fas fa-trash-alt"></i></button>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {addingSem ? (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input autoFocus value={newSemName} onChange={e => setNewSemName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSemester()}
                  placeholder="e.g. 9th Semester" style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '0.82rem', outline: 'none' }} />
                <button className="routine-btn routine-btn-primary" onClick={addSemester} style={{ fontSize: '0.75rem' }}><i className="fas fa-check"></i> Add</button>
                <button className="routine-btn routine-btn-ghost" onClick={() => { setAddingSem(false); setNewSemName(''); }} style={{ fontSize: '0.75rem' }}><i className="fas fa-times"></i></button>
              </div>
            ) : (
              <button className="routine-add-btn" onClick={() => setAddingSem(true)} style={{ marginTop: 8 }}><i className="fas fa-plus"></i> Add Semester</button>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════ STEP 2: COURSES PER SEMESTER ═══════════════ */}
      {step === 'courses' && (
        <div className="routine-builder-section">
          <h4><i className="fas fa-book"></i> Courses per Semester</h4>
          <p style={{ fontSize: '0.78rem', color: 'var(--text2)', marginBottom: 12 }}>Courses are shared across all sections and genders within a semester.</p>
          {draft.semesters.map((sem, semIdx) => (
            <div key={sem.name} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 12, overflow: 'hidden' }}>
              <div onClick={() => setExpandedSemCourses(expandedSemCourses === semIdx ? null : semIdx)}
                style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', gap: 8, background: expandedSemCourses === semIdx ? 'var(--bg3)' : 'transparent' }}>
                <span style={{ fontWeight: 600, fontSize: '0.88rem', flex: 1 }}>{sem.name}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text3, #94a3b8)' }}>{sem.courses.length} courses</span>
                <i className={`fas fa-chevron-${expandedSemCourses === semIdx ? 'up' : 'down'}`} style={{ fontSize: '0.7rem', color: 'var(--text2)' }}></i>
              </div>
              {expandedSemCourses === semIdx && (
                <div style={{ padding: '0 16px 12px' }}>
                  {sem.courses.map((c, cIdx) => (
                    <div key={cIdx} className="routine-course-item">
                      <div className="routine-course-num">{cIdx + 1}</div>
                      <div className="routine-course-fields">
                        <input className="routine-input-sm" placeholder="Code (e.g. QSM-3601)" value={c.code} onChange={e => updateSemCourse(semIdx, cIdx, 'code', e.target.value)} />
                        <input placeholder="Course Title" value={c.title} onChange={e => updateSemCourse(semIdx, cIdx, 'title', e.target.value)} />
                        <div className="routine-course-row-2">
                          <TeacherAutocomplete value={c.teacher} onChange={val => updateSemCourse(semIdx, cIdx, 'teacher', val)} placeholder="Teacher name" />
                          <input className="routine-input-sm" placeholder="Room" value={c.room} onChange={e => updateSemCourse(semIdx, cIdx, 'room', e.target.value)} />
                        </div>
                      </div>
                      <button className="routine-remove-btn" onClick={() => removeSemCourse(semIdx, cIdx)}><i className="fas fa-trash-alt"></i></button>
                    </div>
                  ))}
                  <button className="routine-add-btn" onClick={() => addCourseToSem(semIdx)} style={{ marginTop: 8 }}><i className="fas fa-plus"></i> Add Course to {sem.name}</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ═══════════════ STEP 3: TIME PERIODS ═══════════════ */}
      {step === 'periods' && (
        <div className="routine-builder-section">
          <h4><i className="fas fa-clock"></i> Time Periods</h4>
          {draft.draftGender === 'both' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button type="button" className={`routine-btn ${periodTab === 'male' ? 'routine-btn-primary' : 'routine-btn-outline'}`}
                onClick={() => setPeriodTab('male')} style={{ background: periodTab === 'male' ? '#3b82f6' : undefined, color: periodTab === 'male' ? '#fff' : undefined }}>
                <i className="fas fa-mars" style={{ marginRight: 4 }}></i> Male Periods
              </button>
              <button type="button" className={`routine-btn ${periodTab === 'female' ? 'routine-btn-primary' : 'routine-btn-outline'}`}
                onClick={() => setPeriodTab('female')} style={{ background: periodTab === 'female' ? '#ec4899' : undefined, color: periodTab === 'female' ? '#fff' : undefined }}>
                <i className="fas fa-venus" style={{ marginRight: 4 }}></i> Female Periods
              </button>
            </div>
          )}
          {draft.draftGender !== 'both' && (
            <p style={{ fontSize: '0.78rem', color: 'var(--text2)', marginBottom: 12 }}>
              <i className="fas fa-info-circle" style={{ marginRight: 4 }}></i>
              {draft.draftGender === 'male' ? 'Male' : 'Female'} time periods only.
            </p>
          )}
          <PeriodEditor
            periods={draft.draftGender === 'male' || (draft.draftGender === 'both' && periodTab === 'male') ? draft.malePeriods : draft.femalePeriods}
            onChange={(periods) => updatePeriods(draft.draftGender === 'male' || (draft.draftGender === 'both' && periodTab === 'male') ? 'male' : 'female', periods)}
          />
        </div>
      )}

      {/* ═══════════════ STEP 4: ASSIGN GRID ═══════════════ */}
      {step === 'assign' && (
        <div className="routine-builder-section">
          <h4><i className="fas fa-table"></i> Assign Courses to Schedule</h4>
          <p style={{ fontSize: '0.78rem', color: 'var(--text2)', marginBottom: 12 }}>
            <i className="fas fa-info-circle" style={{ marginRight: 4 }}></i>
            Red cells = teacher assigned elsewhere at same time. Hover for details.
          </p>
          {draft.semesters.map((sem, semIdx) => (
            <div key={sem.name} style={{ marginBottom: 16 }}>
              {getGendersToShow().map(gender => {
                const genderSections = sem.sections.filter(s => s.gender === gender);
                const gColor = gender === 'male' ? '#3b82f6' : '#ec4899';
                const genderRoomKey = gender === 'male' ? 'maleRoom' : 'femaleRoom';
                const refPeriods = gender === 'male' ? draft.malePeriods : draft.femalePeriods;
                return (
                  <div key={gender} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: gColor }}>
                        <i className={`fas fa-${gender === 'male' ? 'mars' : 'venus'}`} style={{ marginRight: 4 }}></i>
                        {sem.name} — {gender === 'male' ? 'Male' : 'Female'}
                      </span>
                      {genderSections.length === 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <label style={{ fontSize: '0.72rem', color: 'var(--text2)' }}>Room:</label>
                          <input value={sem[genderRoomKey]} onChange={e => {
                            const updated = { ...draft };
                            updated.semesters = [...updated.semesters];
                            updated.semesters[semIdx] = { ...updated.semesters[semIdx], [genderRoomKey]: e.target.value };
                            setDraft(updated);
                          }} placeholder="e.g. Room 301"
                            style={{ width: 120, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '0.78rem', outline: 'none' }} />
                        </div>
                      )}
                      <button onClick={() => addSectionToSem(semIdx, gender)} className="routine-add-btn" style={{ fontSize: '0.68rem', padding: '3px 8px' }}>
                        <i className="fas fa-plus"></i> Add Section
                      </button>
                    </div>
                    {genderSections.length === 0 && (
                      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
                        {sem.courses.length === 0 ? (
                          <p style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--text3, #94a3b8)' }}>Add courses in Step 2 first.</p>
                        ) : (
                          <div style={{ overflowX: 'auto' }}>
                            <table className="routine-grid-table">
                              <thead>
                                <tr>
                                  <th>Period</th>
                                  {draft.days.map(d => <th key={d}>{d.slice(0, 3)}</th>)}
                                </tr>
                              </thead>
                              <tbody>
                                {(() => {
                                  let cpCounter = -1;
                                  return refPeriods.map((p, pIdx) => {
                                    if (p.isBreak) {
                                      return (
                                        <tr key={`break-${pIdx}`} className="routine-grid-break">
                                          <td className="routine-grid-time">{p.start} - {p.end}</td>
                                          {draft.days.map(d => <td key={d}>Break</td>)}
                                        </tr>
                                      );
                                    }
                                    cpCounter++;
                                    const cpIdx = cpCounter;
                                    return (
                                      <tr key={`period-${semIdx}-all-${cpIdx}`}>
                                        <td className="routine-grid-time">
                                          <div>{p.name}</div>
                                          <small>{p.start} - {p.end}</small>
                                        </td>
                                        {draft.days.map(d => {
                                          const currentVal = tempGenderSlots[sem.name]?.[gender]?.[`${d}:${cpIdx}`] || '';
                                          return (
                                            <td key={`${d}-${cpIdx}`}>
                                              <CustomSelect
                                                value={currentVal}
                                                onChange={(val) => {
                                                  setTempGenderSlots(prev => {
                                                    const next = { ...prev };
                                                    if (!next[sem.name]) next[sem.name] = {};
                                                    if (!next[sem.name][gender]) next[sem.name][gender] = {};
                                                    next[sem.name][gender] = { ...next[sem.name][gender], [`${d}:${cpIdx}`]: val };
                                                    return next;
                                                  });
                                                }}
                                                placeholder="-- Off Day --"
                                                options={sem.courses.map(c => ({ value: c.code, label: `${c.code} - ${c.title}${c.teacher ? ` (${c.teacher})` : ''}` }))}
                                              />
                                            </td>
                                          );
                                        })}
                                      </tr>
                                    );
                                  });
                                })()}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                    {genderSections.map((sec) => {
                      const secIdx = sem.sections.indexOf(sec);
                      const semKey = `${sem.name}-${gender}-${sec.branch || 'main'}`;
                      return (
                        <div key={secIdx} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg3)' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.8rem' }}>Section {sec.branch || 'Main'}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <label style={{ fontSize: '0.72rem', color: 'var(--text2)' }}>Room:</label>
                              <input value={sec.room} onChange={e => updateSectionRoom(semIdx, secIdx, e.target.value)}
                                placeholder="e.g. Room 301" style={{ width: 120, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '0.78rem', outline: 'none' }} />
                            </div>
                            <button onClick={() => removeSectionFromSem(semIdx, secIdx)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '0.68rem' }}><i className="fas fa-trash-alt"></i></button>
                          </div>
                          {sem.courses.length === 0 ? (
                            <p style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--text3, #94a3b8)' }}>Add courses in Step 2 first.</p>
                          ) : (
                            <div style={{ overflowX: 'auto' }}>
                              <table className="routine-grid-table">
                                <thead>
                                  <tr>
                                    <th>Period</th>
                                    {draft.days.map(d => <th key={d}>{d.slice(0, 3)}</th>)}
                                  </tr>
                                </thead>
                                <tbody>
                                  {(() => {
                                    let cpCounter = -1;
                                    return refPeriods.map((p, pIdx) => {
                                      if (p.isBreak) {
                                        return (
                                          <tr key={`break-${pIdx}`} className="routine-grid-break">
                                            <td className="routine-grid-time">{p.start} - {p.end}</td>
                                            {draft.days.map(d => <td key={d}>Break</td>)}
                                          </tr>
                                        );
                                      }
                                      cpCounter++;
                                      const cpIdx = cpCounter;
                                      return (
                                        <tr key={`period-${semIdx}-${secIdx}-${cpIdx}`}>
                                          <td className="routine-grid-time">
                                            <div>{p.name}</div>
                                            <small>{p.start} - {p.end}</small>
                                          </td>
                                          {draft.days.map(d => {
                                            const currentSlot = sec.slots.find(s => s.day === d && s.period === cpIdx);
                                            const cellKey = `${semKey}:${d}:${cpIdx}`;
                                            const conflicts = conflictMap[cellKey] || [];
                                            const hasConflict = conflicts.length > 0;
                                            return (
                                              <td key={`${d}-${cpIdx}`} style={hasConflict ? { background: '#ef444420', position: 'relative' } : undefined}
                                                onMouseEnter={hasConflict ? (e) => setTooltip({ x: e.clientX, y: e.clientY - 40, text: conflicts.join('\n') }) : undefined}
                                                onMouseLeave={hasConflict ? () => setTooltip(null) : undefined}>
                                                <CustomSelect
                                                  value={currentSlot?.course || ''}
                                                  onChange={(val) => setSlotInSection(semIdx, secIdx, d, cpIdx, val)}
                                                  placeholder="-- Off Day --"
                                                  options={sem.courses.map(c => ({ value: c.code, label: `${c.code} - ${c.title}${c.teacher ? ` (${c.teacher})` : ''}` }))}
                                                  size="sm"
                                                />
                                              </td>
                                            );
                                          })}
                                        </tr>
                                      );
                                    });
                                  })()}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div style={{ position: 'fixed', left: tooltip.x, top: tooltip.y, zIndex: 9999, background: '#1e293b', color: '#fff', padding: '8px 12px', borderRadius: 8, fontSize: '0.72rem', maxWidth: 320, whiteSpace: 'pre-line', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', pointerEvents: 'none' }}>
          <strong style={{ color: '#ef4444' }}>⚠ Teacher Conflict:</strong>{'\n'}{tooltip.text}
        </div>
      )}

      {/* Nav */}
      <div className="routine-builder-nav">
        <button className="routine-btn routine-btn-ghost" onClick={onBack}><i className="fas fa-times"></i> Back</button>
        <div className="routine-builder-nav-right">
          {currentStepIdx > 0 && (
            <button className="routine-btn routine-btn-outline" onClick={() => setStep(steps[currentStepIdx - 1].key)}>
              <i className="fas fa-arrow-left"></i> Previous
            </button>
          )}
          {currentStepIdx < steps.length - 1 ? (
            <button className="routine-btn routine-btn-primary" onClick={() => setStep(steps[currentStepIdx + 1].key)}>
              Next <i className="fas fa-arrow-right"></i>
            </button>
          ) : (
            <button className="routine-btn routine-btn-save" onClick={handlePublishAll}>
              <i className="fas fa-share-alt"></i> Publish All
            </button>
          )}
        </div>
      </div>
      {confirmDialog}
    </>
  );
}

/* ═══════════════════════════════════════════════════════
   PERIOD EDITOR — reusable for male/female periods
   ═══════════════════════════════════════════════════════ */
function PeriodEditor({ periods, onChange }: { periods: RoutinePeriod[]; onChange: (p: RoutinePeriod[]) => void }) {
  const classPeriods = periods.filter(p => !p.isBreak);
  const addPeriod = () => onChange([...periods, { name: `Period ${classPeriods.length + 1}`, start: '10:40 AM', end: '11:30 AM' }]);
  const updatePeriod = (idx: number, field: keyof RoutinePeriod, value: string | boolean) => {
    const p = [...periods]; p[idx] = { ...p[idx], [field]: value }; onChange(p);
  };
  const removePeriod = (idx: number) => onChange(periods.filter((_, i) => i !== idx));
  const movePeriod = (idx: number, dir: -1 | 1) => {
    const p = [...periods]; const ni = idx + dir;
    if (ni < 0 || ni >= p.length) return;
    [p[idx], p[ni]] = [p[ni], p[idx]]; onChange(p);
  };
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button className="routine-add-btn" onClick={addPeriod}><i className="fas fa-plus"></i> Add Period</button>
      </div>
      <div className="routine-period-list">
        {periods.map((p, idx) => (
          <div key={idx} className={`routine-period-item ${p.isBreak ? 'break' : ''}`}>
            <div className="routine-period-drag">
              <button disabled={idx === 0} onClick={() => movePeriod(idx, -1)}><i className="fas fa-chevron-up"></i></button>
              <button disabled={idx === periods.length - 1} onClick={() => movePeriod(idx, 1)}><i className="fas fa-chevron-down"></i></button>
            </div>
            <div className="routine-period-fields">
              <input className="routine-period-name" placeholder="Period name" value={p.name} onChange={e => updatePeriod(idx, 'name', e.target.value)} />
              <div className="routine-period-times">
                <input type="time" value={to24h(p.start)} onChange={e => updatePeriod(idx, 'start', to12h(e.target.value))} />
                <span className="routine-period-sep">to</span>
                <input type="time" value={to24h(p.end)} onChange={e => updatePeriod(idx, 'end', to12h(e.target.value))} />
              </div>
            </div>
            <label className="routine-break-toggle">
              <input type="checkbox" checked={!!p.isBreak} onChange={e => updatePeriod(idx, 'isBreak', e.target.checked)} />
              <span>Break</span>
            </label>
            <button className="routine-remove-btn-sm" onClick={() => removePeriod(idx)}><i className="fas fa-times"></i></button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ROUTINE CARD — Manager Grid Card
   ═══════════════════════════════════════════════════════ */
function RoutineCard({ routine, isPublished, onView, onEdit, onDelete, onDuplicate, onPublish, onUnpublish, currentUserEmail, isAdmin }: {
  routine: RoutineItem;
  isPublished?: boolean;
  onView: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (r: RoutineItem) => void;
  onPublish?: (r: RoutineItem) => void;
  onUnpublish?: (id: string) => void;
  currentUserEmail?: string;
  isAdmin?: boolean;
}) {
  const slotCount = routine.slots.length;
  const daysCount = routine.days.length;
  const courseCount = routine.courses.length;
  const dateStr = routine.createdAt ? new Date(routine.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const isCreator = !!currentUserEmail && !!routine.publishedBy?.email && routine.publishedBy.email === currentUserEmail;
  const canDelete = !isPublished || isCreator || isAdmin;

  return (
    <div className={`routine-card ${isPublished ? 'routine-card-published' : ''}`}>
        <div className="routine-card-header">
        <div className="routine-card-semester">{routine.semester}</div>
        {routine.gender && routine.gender !== 'both' && <span className="routine-card-badge" style={{ background: routine.gender === 'male' ? '#3b82f6' : '#ec4899', color: '#fff' }}>
          <i className={`fas fa-${routine.gender === 'male' ? 'mars' : 'venus'}`} style={{ marginRight: 4 }}></i>
          {routine.gender === 'male' ? 'Male' : 'Female'}
        </span>}
        {routine.gender === 'both' && <span className="routine-card-badge" style={{ background: 'linear-gradient(90deg, #3b82f6 50%, #ec4899 50%)', color: '#fff' }}>
          Male &amp; Female
        </span>}
        {routine.branch && <span className="routine-card-badge">Branch {routine.branch}</span>}
        {isPublished && <span className="routine-card-published-badge"><i className="fas fa-globe"></i> Published</span>}
        {!isPublished && routine.isDraft && <span className="routine-card-draft-badge"><i className="fas fa-pen"></i> Draft</span>}
      </div>
      <div className="routine-card-meta">
        <span><i className="fas fa-book"></i> {courseCount} courses</span>
        <span><i className="fas fa-calendar-day"></i> {daysCount} days</span>
        <span><i className="fas fa-clock"></i> {slotCount} classes</span>
      </div>
      <div className="routine-card-info">
        <span>Session: {routine.session}</span>
        {dateStr && <span>Created: {dateStr}</span>}
        {isPublished && routine.publishedBy && (
          <span><i className="fas fa-user-check"></i> Published by {routine.publishedBy.name}</span>
        )}
      </div>
      <div className="routine-card-actions">
        <button className="routine-card-btn routine-card-btn-view" onClick={() => onView(routine.id)}><i className="fas fa-eye"></i> View</button>
        {onEdit && <button className="routine-card-btn routine-card-btn-edit" onClick={() => onEdit(routine.id)}><i className="fas fa-edit"></i> Edit</button>}
        {onDuplicate && <button className="routine-card-btn routine-card-btn-dup" onClick={() => onDuplicate(routine)}><i className="fas fa-copy"></i> Duplicate</button>}
        {onPublish && !isPublished && <button className="routine-card-btn routine-card-btn-publish" onClick={() => onPublish(routine)}><i className="fas fa-share-alt"></i> Publish</button>}
        {onUnpublish && isPublished && <button className="routine-card-btn routine-card-btn-unpublish" onClick={() => onUnpublish(routine.id)}><i className="fas fa-eye-slash"></i> Unpublish</button>}
        {canDelete && onDelete && <button className="routine-card-btn routine-card-btn-delete" onClick={() => onDelete(routine.id)}><i className="fas fa-trash"></i></button>}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ROUTINE PRINT VIEW — Beautiful University Layout
   ═══════════════════════════════════════════════════════ */

function RoutineTable({ periods, slots, days, courses, label }: { periods: RoutinePeriod[]; slots: RoutineSlot[]; days: string[]; courses: RoutineCourse[]; label?: string }) {
  const classPeriods = periods.filter(p => !p.isBreak);
  const isOffDayLocal = (day: string) => {
    return classPeriods.every((_, i) => !slots.find(s => s.day === day && s.period === i));
  };

  return (
    <div>
      {label && (
        <div style={{ background: label === 'Male' ? '#3b82f6' : '#ec4899', color: '#fff', textAlign: 'center', padding: '8px 16px', fontWeight: 700, fontSize: '0.85rem', letterSpacing: '0.5px' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline-block',verticalAlign:'-0.15em',marginRight:'6px'}}>{label === 'Male' ? <g><circle cx="10" cy="14" r="5"/><path d="M19 5l-5.4 5.4"/><path d="M15 5h4V1"/></g> : <g><circle cx="12" cy="12" r="5"/><path d="M12 7v0M12 17v0"/></g>}</svg>
          {label} Section
        </div>
      )}
      <div className="routine-table-wrapper">
        <table className="routine-table">
          <thead>
            <tr>
              <th className="routine-th routine-th-time">Time</th>
              {days.map(day => (
                <th key={day} className="routine-th">{day}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((period, pIdx) => {
              if (period.isBreak) {
                const nonOffDays = days.filter(day => !isOffDayLocal(day));
                const midIdx = Math.floor(nonOffDays.length / 2);
                return (
                  <tr key={pIdx} className="routine-break-row">
                    <td className="routine-td routine-td-time routine-break-time">
                      <div className="routine-time-text">{period.start}</div>
                      <div className="routine-time-sub">{period.end}</div>
                    </td>
                    {days.map((day) => {
                      const offDay = isOffDayLocal(day);
                      if (offDay) return null;
                      const showLabel = nonOffDays.indexOf(day) === midIdx;
                      return (
                        <td key={day} className="routine-td routine-break-cell">
                          {showLabel ? <span className="routine-break-label">{period.name}</span> : null}
                        </td>
                      );
                    })}
                  </tr>
                );
              }
              const classPeriodIdx = classPeriods.findIndex((_, i) => {
                let count = 0;
                for (let j = 0; j <= pIdx; j++) { if (!periods[j].isBreak) count++; }
                return count - 1 === i;
              }) ?? pIdx;
              return (
                <tr key={pIdx}>
                  <td className="routine-td routine-td-time">
                    <div className="routine-period-name">{period.name}</div>
                    <div className="routine-time-text">{period.start}</div>
                    <div className="routine-time-sub">{period.end}</div>
                  </td>
                  {days.map(day => {
                    const offDay = isOffDayLocal(day);
                    if (offDay) {
                      if (pIdx === 0) {
                        return (
                          <td key={day} className="routine-td routine-offday-cell" rowSpan={periods.length}>
                            <div className="routine-offday-vertical">OFF DAY</div>
                          </td>
                        );
                      }
                      return null;
                    }
                    const slot = slots.find(s => s.day === day && s.period === classPeriodIdx) || null;
                    const course = slot ? courses.find(c => c.code === slot.course) || null : null;
                    return (
                      <td key={day} className="routine-td">
                        {slot && course ? (
                          <div className="routine-course">
                            <span className="routine-course-code">{course.code}</span>
                            <span className="routine-course-title">{course.title}</span>
                            <span className="routine-course-teacher">{course.teacher}</span>
                          </div>
                        ) : (
                          <span className="routine-empty">&mdash;</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════ PLAIN ACADEMIC TABLE — Black & White for printing ═══════ */
function RoutinePlainTable({ routine }: { routine: RoutineItem }) {
  const classPeriods = routine.periods.filter(p => !p.isBreak);
  const isOffDay = (day: string) => classPeriods.every((_, i) => !routine.slots.find(s => s.day === day && s.period === i));
  const isBoth = routine.gender === 'both';
  const hasMaleData = isBoth && routine.malePeriods && routine.malePeriods.length > 0;

  function renderTable(periods: RoutinePeriod[], slots: RoutineSlot[], label?: string) {
    const classPds = periods.filter(p => !p.isBreak);
    const isOff = (day: string) => classPds.every((_, i) => !slots.find(s => s.day === day && s.period === i));
    return (
      <div style={{ marginBottom: label ? '12px' : '0' }}>
        {label && <div style={{ textAlign: 'center', padding: '6px', fontWeight: 700, fontSize: '0.8rem', border: '1px solid #000', borderBottom: 'none', textTransform: 'uppercase' }}>{label} Section</div>}
        <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #000', fontFamily: 'Times New Roman, serif', fontSize: '0.72rem' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'left', fontWeight: 700, width: '110px' }}>Time</th>
              {routine.days.map(day => <th key={day} style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center', fontWeight: 700 }}>{day}</th>)}
            </tr>
          </thead>
          <tbody>
            {periods.map((period, pIdx) => {
              if (period.isBreak) {
                const nonOff = routine.days.filter(d => !isOff(d));
                const mid = Math.floor(nonOff.length / 2);
                return (
                  <tr key={pIdx}>
                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 700, verticalAlign: 'middle' }}>
                      <div>{period.start}</div><div style={{ fontSize: '0.65rem' }}>{period.end}</div>
                    </td>
                    {routine.days.map(day => {
                      if (isOff(day)) return null;
                      const show = nonOff.indexOf(day) === mid;
                      return <td key={day} style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', fontStyle: 'italic' }}>{show ? period.name : ''}</td>;
                    })}
                  </tr>
                );
              }
              const cpIdx = classPds.findIndex((_, i) => {
                let c = 0;
                for (let j = 0; j <= pIdx; j++) { if (!periods[j].isBreak) c++; }
                return c - 1 === i;
              });
              return (
                <tr key={pIdx}>
                  <td style={{ border: '1px solid #000', padding: '4px 8px', verticalAlign: 'middle' }}>
                    <div style={{ fontWeight: 700 }}>{period.name}</div>
                    <div>{period.start}</div>
                    <div style={{ fontSize: '0.65rem' }}>{period.end}</div>
                  </td>
                  {routine.days.map(day => {
                    if (isOff(day)) {
                      if (pIdx === 0) return <td key={day} style={{ border: '1px solid #000', padding: '8px', textAlign: 'center', verticalAlign: 'middle', fontWeight: 700, fontStyle: 'italic' }} rowSpan={periods.length}>OFF DAY</td>;
                      return null;
                    }
                    const slot = slots.find(s => s.day === day && s.period === cpIdx) || null;
                    const course = slot ? routine.courses.find(c => c.code === slot.course) || null : null;
                    return (
                      <td key={day} style={{ border: '1px solid #000', padding: '6px', verticalAlign: 'top' }}>
                        {course ? (
                          <div>
                            <div style={{ fontWeight: 700 }}>{course.code}</div>
                            <div style={{ fontSize: '0.68rem' }}>{course.title}</div>
                            <div style={{ fontSize: '0.65rem' }}>{course.teacher}</div>
                          </div>
                        ) : <span style={{ color: '#999' }}>—</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div style={{ background: '#fff', padding: '24px', fontFamily: 'Times New Roman, serif', color: '#000' }}>
      <div style={{ textAlign: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, textTransform: 'uppercase', margin: '0 0 4px' }}>{routine.university || 'International Islamic University Chittagong'}</h2>
        <h3 style={{ fontSize: '0.85rem', fontWeight: 600, margin: '0 0 4px' }}>{routine.department}</h3>
        <h4 style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', margin: '0 0 4px' }}>Class Routine</h4>
        <p style={{ fontSize: '0.72rem', margin: 0 }}>Session: {routine.session} | Semester: {routine.semester}</p>
      </div>
      {isBoth && hasMaleData ? (
        <>
          {renderTable(routine.malePeriods!, routine.maleSlots || [], 'Male')}
          {renderTable(routine.femalePeriods!, routine.femaleSlots || [], 'Female')}
        </>
      ) : (
        renderTable(routine.periods, routine.slots)
      )}
      {routine.courses.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <h4 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px' }}>Course Information</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', fontSize: '0.72rem' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'left' }}>Code</th>
                <th style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'left' }}>Course Title</th>
                <th style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'left' }}>Instructor</th>
              </tr>
            </thead>
            <tbody>
              {routine.courses.map(c => (
                <tr key={c.code}>
                  <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 700 }}>{c.code}</td>
                  <td style={{ border: '1px solid #000', padding: '4px 8px' }}>{c.title}</td>
                  <td style={{ border: '1px solid #000', padding: '4px 8px' }}>{c.teacher}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ fontSize: '0.65rem', marginTop: '12px', textAlign: 'center', color: '#666' }}>
        Last Updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
    </div>
  );
}

const RoutinePrintView = forwardRef<HTMLDivElement, { routine: RoutineItem }>(({ routine }, ref) => {
  const isBoth = routine.gender === 'both';
  const hasMaleData = isBoth && routine.malePeriods && routine.malePeriods.length > 0;
  const hasFemaleData = isBoth && routine.femalePeriods && routine.femalePeriods.length > 0;
  return (
    <div ref={ref} className="routine-export">
      <div className="routine-header">
        <div className="routine-header-inner">
          <div className="routine-header-top">
            <div className="routine-logo-wrapper">
              <img src="/iiuc-logo.png" alt="IIUC" width={80} height={80} className="routine-logo" style={{ display: 'block' }} />
            </div>
            <div className="routine-header-text">
              <h1 className="routine-university-name">{routine.university}</h1>
              <p className="routine-arabic-name">&#x262F;&#x2015;&#x627;&#x644;&#x62C;&#x627;&#x645;&#x639;&#x629; &#x627;&#x644;&#x625;&#x633;&#x644;&#x627;&#x645;&#x64A;&#x629; &#x627;&#x644;&#x639;&#x644;&#x627;&#x645;&#x64A;&#x629; &#x634;&#x64A;&#x62A;&#x627;&#x63A;&#x648;&#x646;&#x63A;</p>
              <p className="routine-dept-name">{routine.department}</p>
            </div>
          </div>
          <div className="routine-title-bar">
            <div className="routine-title-accent"></div>
            <h2 className="routine-title"> CLASS ROUTINE</h2>
            <div className="routine-title-accent"></div>
          </div>
          <div className="routine-badges">
            <span className="routine-badge routine-badge-semester">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline-block',verticalAlign:'-0.15em',marginRight:'6px'}}><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>
              {routine.semester}
            </span>
            {routine.branch && <span className="routine-badge routine-badge-branch">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline-block',verticalAlign:'-0.15em',marginRight:'6px'}}><path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3"/><path d="m15 9 6-6"/></svg>
              Section {routine.branch}
            </span>}
            {routine.gender && routine.gender !== 'both' && <span className="routine-badge" style={{ background: routine.gender === 'male' ? '#3b82f6' : '#ec4899', color: '#fff' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline-block',verticalAlign:'-0.15em',marginRight:'6px'}}>{routine.gender === 'male' ? <g><circle cx="10" cy="14" r="5"/><path d="M19 5l-5.4 5.4"/><path d="M15 5h4V1"/></g> : <g><circle cx="12" cy="12" r="5"/><path d="M12 7v0M12 17v0"/></g>}</svg>
              {routine.gender === 'male' ? 'Male' : 'Female'}
            </span>}
            {routine.gender === 'both' && <span className="routine-badge" style={{ background: 'linear-gradient(90deg, #3b82f6 50%, #ec4899 50%)', color: '#fff' }}>
              Male &amp; Female
            </span>}
            <span className="routine-badge routine-badge-session">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline-block',verticalAlign:'-0.15em',marginRight:'6px'}}><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M3 10h18"/><path d="M8 2v4"/><path d="M17 14h-6"/><path d="M13 18H7"/><path d="M7 14h.01"/><path d="M17 18h.01"/></svg>
              Session {routine.session}
            </span>
            {routine.gender === 'both' && (routine.maleRoom || routine.femaleRoom) ? (
              <>
                {routine.maleRoom && <span className="routine-badge routine-badge-room">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline-block',verticalAlign:'-0.15em',marginRight:'4px'}}><path d="M11 20H2"/><path d="M11 4.562v16.157a1 1 0 0 0 1.242.97L19 20V5.562a2 2 0 0 0-1.515-1.94l-4-1A2 2 0 0 0 11 4.561z"/><path d="M11 4H8a2 2 0 0 0-2 2v14"/><path d="M14 12h.01"/><path d="M22 20h-3"/></svg>
                  <i className="fas fa-mars" style={{marginRight:4,fontSize:'0.65rem'}}></i>
                  {/^\d+$/.test(routine.maleRoom) ? `Room ${routine.maleRoom}` : routine.maleRoom}
                </span>}
                {routine.femaleRoom && <span className="routine-badge routine-badge-room">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline-block',verticalAlign:'-0.15em',marginRight:'4px'}}><path d="M11 20H2"/><path d="M11 4.562v16.157a1 1 0 0 0 1.242.97L19 20V5.562a2 2 0 0 0-1.515-1.94l-4-1A2 2 0 0 0 11 4.561z"/><path d="M11 4H8a2 2 0 0 0-2 2v14"/><path d="M14 12h.01"/><path d="M22 20h-3"/></svg>
                  <i className="fas fa-venus" style={{marginRight:4,fontSize:'0.65rem'}}></i>
                  {/^\d+$/.test(routine.femaleRoom) ? `Room ${routine.femaleRoom}` : routine.femaleRoom}
                </span>}
              </>
            ) : routine.room && <span className="routine-badge routine-badge-room">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline-block',verticalAlign:'-0.15em',marginRight:'6px'}}><path d="M11 20H2"/><path d="M11 4.562v16.157a1 1 0 0 0 1.242.97L19 20V5.562a2 2 0 0 0-1.515-1.94l-4-1A2 2 0 0 0 11 4.561z"/><path d="M11 4H8a2 2 0 0 0-2 2v14"/><path d="M14 12h.01"/><path d="M22 20h-3"/></svg>
              {/^\d+$/.test(routine.room) ? `Room ${routine.room}` : routine.room}
            </span>}
          </div>
        </div>
      </div>

      {isBoth && hasMaleData ? (
        <>
          <RoutineTable periods={routine.malePeriods!} slots={routine.maleSlots || []} days={routine.days} courses={routine.courses} label="Male" />
          <RoutineTable periods={routine.femalePeriods!} slots={routine.femaleSlots || []} days={routine.days} courses={routine.courses} label="Female" />
        </>
      ) : (
        <RoutineTable periods={routine.periods} slots={routine.slots} days={routine.days} courses={routine.courses} />
      )}

      {routine.courses.length > 0 && (
        <div className="routine-legend">
          <h4 className="routine-legend-title"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 32 32" fill="#166534" style={{display:'inline-block',verticalAlign:'-0.2em',marginRight:'8px'}}><path d="M15 25.875v-19.625c0 0-2.688-2.25-6.5-2.25s-6.5 2-6.5 2v19.875c0 0 2.688-1.938 6.5-1.938s6.5 1.938 6.5 1.938zM29 25.875v-19.625c0 0-2.688-2.25-6.5-2.25s-6.5 2-6.5 2v19.875c0 0 2.688-1.938 6.5-1.938s6.5 1.938 6.5 1.938zM31 8h-1v19h-12v1h-5v-1h-12v-19h-1v20h12v1h7.062l-0.062-1h12v-20z"/></svg> Course Information</h4>
          <div className="routine-legend-table-wrapper">
            <table className="routine-legend-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Course Title</th>
                  <th>Instructor</th>
                </tr>
              </thead>
              <tbody>
                {routine.courses.map(c => (
                  <tr key={c.code}>
                    <td className="routine-legend-code-cell">{c.code}</td>
                    <td>{c.title}</td>
                    <td>{c.teacher}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="routine-footer">
        <div className="routine-footer-grid">
          <div className="routine-footer-notes">
            <h4>Important Notes</h4>
            <ul>
              <li>Students must arrive 5 minutes before class.</li>
              <li>Any schedule change will be notified via department notice board.</li>
              <li>Midterm and final exam schedules are separate.</li>
            </ul>
          </div>
          <div className="routine-footer-timing">
            <h4>Timing Information</h4>
            <p><strong>Office Hours:</strong> 9:00 AM - 4:00 PM</p>
          </div>
        </div>
        <div className="routine-footer-center">
          <p className="routine-generated">Presented by <strong><a href="https://programming-light.eu.cc" target="_blank" rel="noopener noreferrer" style={{color:'inherit',textDecoration:'underline'}}>Programming Light</a></strong> &amp; Developed by <strong><a href="https://atiq.is-a.dev" target="_blank" rel="noopener noreferrer" style={{color:'inherit',textDecoration:'underline'}}>Sayed Atiqur Rahman</a></strong></p>
          <p className="routine-updated">Last Updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div className="routine-footer-strip">
          <p>&copy; {new Date().getFullYear()} IIUC-ARMS &mdash; Qur&apos;anic Sciences &amp; Islamic Studies, IIUC</p>
        </div>
      </div>
    </div>
  );
});
RoutinePrintView.displayName = 'RoutinePrintView';

/* ═══════════════════════════════════════════════════════
   ROUTINE BUILDER — Simplified Step-by-Step Editor
   ═══════════════════════════════════════════════════════ */
type BuilderStep = 'info' | 'courses' | 'periods' | 'assign';

function RoutineBuilder({ existing, onSave, onCancel }: { existing: RoutineItem | null; onSave: (r: RoutineItem) => void; onCancel: () => void }) {
  const [step, setStep] = useState<BuilderStep>('info');
  const [semester, setSemester] = useState(existing?.semester || SEMESTERS[0]);
  const [branch, setBranch] = useState(existing?.branch || '');
  const [gender, setGender] = useState<'male' | 'female' | 'both' | null>(existing?.gender || null);
  const [session, setSession] = useState(existing?.session || getDefaultSession());
  const [room, setRoom] = useState(existing?.room || '');
  const [maleRoom, setMaleRoom] = useState(existing?.maleRoom || '');
  const [femaleRoom, setFemaleRoom] = useState(existing?.femaleRoom || '');
  const [periods, setPeriods] = useState<RoutinePeriod[]>(existing?.periods || [...DEFAULT_PERIODS]);
  const [days, setDays] = useState<string[]>(existing?.days || [...DEFAULT_DAYS]);
  const [courses, setCourses] = useState<RoutineCourse[]>(existing?.courses || []);
  const [slots, setSlots] = useState<RoutineSlot[]>(existing?.slots || []);
  const [malePeriods, setMalePeriods] = useState<RoutinePeriod[]>(existing?.malePeriods || [...DEFAULT_PERIODS]);
  const [femalePeriods, setFemalePeriods] = useState<RoutinePeriod[]>(existing?.femalePeriods || [...DEFAULT_FEMALE_PERIODS]);
  const [maleSlots, setMaleSlots] = useState<RoutineSlot[]>(existing?.maleSlots || []);
  const [femaleSlots, setFemaleSlots] = useState<RoutineSlot[]>(existing?.femaleSlots || []);
  const [periodTab, setPeriodTab] = useState<'male' | 'female'>('male');
  const [draftSaved, setDraftSaved] = useState(false);
  const [semesterCourses, setSemesterCourses] = useState<{ code: string; title: string; teacher: string; room: string }[]>([]);
  const [codeSuggestions, setCodeSuggestions] = useState<{ idx: number; matches: { code: string; title: string; teacher: string; room: string }[] } | null>(null);

  useEffect(() => {
    if (!semester) { setSemesterCourses([]); return; }
    fetch(`/api/semester-courses?semester=${encodeURIComponent(semester)}`)
      .then(r => r.json())
      .then(data => {
        if (data.success && Array.isArray(data.courses)) {
          setSemesterCourses(data.courses.map((c: any) => ({ code: c.code, title: c.title, teacher: c.teacher || '', room: c.room || '' })));
        }
      })
      .catch(() => {});
  }, [semester]);

  useEffect(() => {
    if (existing) return;
    const draft = loadDraft();
    if (draft) {
      if (draft.semester) setSemester(draft.semester);
      if (draft.branch !== undefined) setBranch(draft.branch || '');
      if (draft.gender !== undefined) setGender(draft.gender || null);
      if (draft.session) setSession(draft.session);
      if (draft.room !== undefined) setRoom(draft.room || '');
      if (draft.maleRoom !== undefined) setMaleRoom(draft.maleRoom || '');
      if (draft.femaleRoom !== undefined) setFemaleRoom(draft.femaleRoom || '');
      if (draft.periods) setPeriods(draft.periods);
      if (draft.days) setDays(draft.days);
      if (draft.courses) setCourses(draft.courses);
      if (draft.slots) setSlots(draft.slots);
      if (draft.malePeriods) setMalePeriods(draft.malePeriods);
      if (draft.femalePeriods) setFemalePeriods(draft.femalePeriods);
      if (draft.maleSlots) setMaleSlots(draft.maleSlots);
      if (draft.femaleSlots) setFemaleSlots(draft.femaleSlots);
      if (draft.step) setStep(draft.step as BuilderStep);
      showToast('Draft restored from previous session', 'success');
    }
  }, []);

  useEffect(() => {
    if (!semester || semesterCourses.length === 0 || existing || courses.length > 0) return;
    setCourses(semesterCourses.map(c => ({ code: c.code, title: c.title, teacher: c.teacher, room: c.room })));
  }, [semesterCourses, existing, courses.length]);

  useEffect(() => {
    if (existing) return;
    const timer = setTimeout(() => {
      saveDraft({ semester, branch, gender, session, room, periods, days, courses, slots, malePeriods, femalePeriods, maleSlots, femaleSlots, step, maleRoom, femaleRoom });
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 2000);
    }, 1000);
    return () => clearTimeout(timer);
  }, [semester, branch, gender, session, room, periods, days, courses, slots, malePeriods, femalePeriods, maleSlots, femaleSlots, step, existing, maleRoom, femaleRoom]);

  const classPeriods = periods.filter(p => !p.isBreak);
  const nonBreakIdx = (pIdx: number, refPeriods: RoutinePeriod[]) => {
    let count = 0;
    for (let i = 0; i <= pIdx; i++) { if (!refPeriods[i].isBreak) count++; }
    return count - 1;
  };

  const isBoth = gender === 'both';
  const isFemale = gender === 'female';
  const activePeriods = isBoth ? (periodTab === 'male' ? malePeriods : femalePeriods) : isFemale ? femalePeriods : periods;
  const activeSlots = isBoth ? (periodTab === 'male' ? maleSlots : femaleSlots) : isFemale ? femaleSlots : slots;
  const setActivePeriods = isBoth ? (periodTab === 'male' ? setMalePeriods : setFemalePeriods) : isFemale ? setFemalePeriods : setPeriods;
  const setActiveSlots = isBoth ? (periodTab === 'male' ? setMaleSlots : setFemaleSlots) : isFemale ? setFemaleSlots : setSlots;

  const activeClassPeriods = activePeriods.filter(p => !p.isBreak);

  const addPeriodForActive = () => setActivePeriods([...activePeriods, { name: `Period ${activeClassPeriods.length + 1}`, start: '10:40 AM', end: '11:30 AM' }]);
  const updatePeriodForActive = (idx: number, field: keyof RoutinePeriod, value: string | boolean) => {
    const p = [...activePeriods]; p[idx] = { ...p[idx], [field]: value }; setActivePeriods(p);
  };
  const removePeriodForActive = (idx: number) => setActivePeriods(activePeriods.filter((_, i) => i !== idx));
  const movePeriodForActive = (idx: number, dir: -1 | 1) => {
    const p = [...activePeriods]; const ni = idx + dir;
    if (ni < 0 || ni >= p.length) return;
    [p[idx], p[ni]] = [p[ni], p[idx]]; setActivePeriods(p);
  };

  const setSlotForActive = (day: string, period: number, courseCode: string) => {
    if (courseCode === '') {
      setActiveSlots(activeSlots.filter(s => !(s.day === day && s.period === period)));
    } else if (activeSlots.find(s => s.day === day && s.period === period)) {
      setActiveSlots(activeSlots.map(s => s.day === day && s.period === period ? { ...s, course: courseCode } : s));
    } else {
      setActiveSlots([...activeSlots, { day, period, course: courseCode }]);
    }
  };

  const steps: { key: BuilderStep; label: string; icon: string; num: number }[] = [
    { key: 'info', label: 'Basic Info', icon: 'info-circle', num: 1 },
    { key: 'courses', label: 'Add Courses', icon: 'book', num: 2 },
    { key: 'periods', label: 'Time Periods', icon: 'clock', num: 3 },
    { key: 'assign', label: 'Assign Grid', icon: 'table', num: 4 },
  ];
  const currentStepIdx = steps.findIndex(s => s.key === step);

  const addPeriod = () => setPeriods([...periods, { name: `Period ${classPeriods.length + 1}`, start: '10:40 AM', end: '11:30 AM' }]);
  const updatePeriod = (idx: number, field: keyof RoutinePeriod, value: string | boolean) => {
    const p = [...periods]; p[idx] = { ...p[idx], [field]: value }; setPeriods(p);
  };
  const removePeriod = (idx: number) => setPeriods(periods.filter((_, i) => i !== idx));
  const movePeriod = (idx: number, dir: -1 | 1) => {
    const p = [...periods]; const ni = idx + dir;
    if (ni < 0 || ni >= p.length) return;
    [p[idx], p[ni]] = [p[ni], p[idx]]; setPeriods(p);
  };

  const addCourse = () => setCourses([...courses, { code: '', title: '', teacher: '', room: '' }]);
  const toInitials = (name: string): string => {
    if (!name) return '';
    const skip = new Set(['dr.', 'prof.', 'mr.', 'mrs.', 'ms.', 'md.', 'sheikh', 'ustaz', 'moulana', 'alhaj']);
    const parts = name.trim().split(/\s+/).filter(p => !skip.has(p.toLowerCase().replace(/[.:]$/, '')));
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
    return parts.map(p => p[0]).join('').toUpperCase().slice(0, 4);
  };

  const updateCourse = (idx: number, field: keyof RoutineCourse, value: string, shortForm?: string) => {
    const c = [...courses];
    const old = c[idx];
    c[idx] = { ...old, [field]: value };
    if (field === 'teacher') {
      const oldInitials = toInitials(old.teacher);
      if (!old.room || old.room === oldInitials) {
        c[idx].room = shortForm || toInitials(value);
      }
    }
    if (field === 'code' && value.trim()) {
      const matches = semesterCourses.filter(sc => sc.code.toLowerCase().includes(value.toLowerCase()));
      if (matches.length > 0 && !(matches.length === 1 && matches[0].code.toLowerCase() === value.toLowerCase())) {
        setCodeSuggestions({ idx, matches: matches.slice(0, 5) });
      } else {
        setCodeSuggestions(null);
        if (matches.length === 1 && matches[0].code.toLowerCase() === value.toLowerCase()) {
          c[idx].title = matches[0].title;
          if (!c[idx].teacher && matches[0].teacher) c[idx].teacher = matches[0].teacher;
        }
      }
    } else if (field === 'code') {
      setCodeSuggestions(null);
    }
    setCourses(c);
  };
  const removeCourse = (idx: number) => { setCourses(courses.filter((_, i) => i !== idx)); setSlots(slots.filter(s => s.course !== courses[idx].code)); };

  const toggleDay = (day: string) => setDays(days.includes(day) ? days.filter(d => d !== day) : [...days, day].sort());

  const setSlot = (day: string, period: number, courseCode: string) => {
    if (courseCode === '') {
      setSlots(slots.filter(s => !(s.day === day && s.period === period)));
    } else if (slots.find(s => s.day === day && s.period === period)) {
      setSlots(slots.map(s => s.day === day && s.period === period ? { ...s, course: courseCode } : s));
    } else {
      setSlots([...slots, { day, period, course: courseCode }]);
    }
  };

  const handleSave = () => {
    if (!semester) { showToast('Please select semester', 'error'); return; }
    const routine: RoutineItem = {
      id: existing?.id || `my-${Date.now()}`,
      semester, branch: branch || null, gender, session, room: room || '',
      academicYear: existing?.academicYear || new Date().getFullYear().toString(),
      department: existing?.department || 'Department of Qur\'anic Sciences & Islamic Studies',
      university: existing?.university || 'International Islamic University Chittagong',
      periods, days, courses, slots,
      ...(isBoth ? { malePeriods, femalePeriods, maleSlots, femaleSlots, maleRoom, femaleRoom } : {}),
      createdAt: existing?.createdAt || Date.now(),
      isDraft: true,
    };
    clearDraft();
    onSave(routine);
  };

  return (
    <div className="routine-builder">
      {draftSaved && (
        <div style={{textAlign:'center',padding:'6px',background:'#dcfce7',borderRadius:'8px',marginBottom:'12px',fontSize:'0.8rem',color:'#166534'}}>
          <i className="fas fa-check-circle"></i> Draft auto-saved
        </div>
      )}
      <div className="routine-builder-steps">
        {steps.map((s, idx) => (
          <div key={s.key} className={`routine-step ${step === s.key ? 'active' : ''} ${idx < currentStepIdx ? 'completed' : ''}`}>
            <div className="routine-step-num">{idx < currentStepIdx ? <i className="fas fa-check"></i> : s.num}</div>
            <span className="routine-step-label">{s.label}</span>
            {idx < steps.length - 1 && <div className="routine-step-line"></div>}
          </div>
        ))}
      </div>

      {step === 'info' && (
        <div className="routine-builder-section">
          <h4><i className="fas fa-info-circle"></i> Basic Information</h4>
          <div className="routine-form-grid">
            <div className="routine-form-group">
              <label>Semester</label>
              <CustomSelect
                value={semester}
                onChange={(val) => setSemester(val)}
                placeholder="Select semester"
                options={SEMESTERS.map(s => ({ value: s, label: s }))}
              />
            </div>
            <div className="routine-form-group">
              <label>Section <span className="routine-label-optional">(optional)</span></label>
              <input placeholder="e.g. A, B" value={branch} onChange={e => setBranch(e.target.value)} />
            </div>
            <div className="routine-form-group">
              <label>Branch</label>
              <CustomSelect
                value={gender || ''}
                onChange={(val) => setGender((val || null) as 'male' | 'female' | 'both' | null)}
                placeholder="Select branch"
                options={[
                  { value: 'male', label: 'Male', icon: 'fas fa-mars' },
                  { value: 'female', label: 'Female', icon: 'fas fa-venus' },
                  { value: 'both', label: 'Both (Male & Female)', icon: 'fas fa-venus-mars' },
                ]}
              />
            </div>
            <div className="routine-form-group">
              <label>Session</label>
              <input placeholder="e.g. Spring - 2026" value={session} onChange={e => setSession(e.target.value)} />
            </div>
            {gender === 'both' ? (
              <>
                <div className="routine-form-group">
                  <label><i className="fas fa-mars text-blue-400 mr-1"></i>Male Room</label>
                  <input placeholder="e.g. Room 301" value={maleRoom} onChange={e => setMaleRoom(e.target.value)} />
                </div>
                <div className="routine-form-group">
                  <label><i className="fas fa-venus text-pink-400 mr-1"></i>Female Room</label>
                  <input placeholder="e.g. Room 202" value={femaleRoom} onChange={e => setFemaleRoom(e.target.value)} />
                </div>
              </>
            ) : (
              <div className="routine-form-group">
                <label>Room / Venue</label>
                <input placeholder="e.g. Room 301, Building B" value={room} onChange={e => setRoom(e.target.value)} />
              </div>
            )}
            <div className="routine-form-group routine-form-full">
              <label>Class Days</label>
              <div className="routine-day-selector">
                {['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(d => (
                  <button key={d} type="button" className={`routine-day-btn ${days.includes(d) ? 'active' : ''}`} onClick={() => toggleDay(d)}>
                    <span className="routine-day-short">{d.slice(0, 3)}</span>
                    <span className="routine-day-full">{d}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 'courses' && (
        <div className="routine-builder-section">
          <div className="routine-builder-section-header">
            <h4><i className="fas fa-book"></i> Course List</h4>
            <button className="routine-add-btn" onClick={addCourse}><i className="fas fa-plus"></i> Add Course</button>
          </div>
          {courses.length > 0 && (
            <div className="routine-course-list">
              {courses.map((c, idx) => (
                <div key={idx} className="routine-course-item">
                  <div className="routine-course-num">{idx + 1}</div>
                  <div className="routine-course-fields" style={{ position: 'relative' }}>
                    <div style={{ position: 'relative' }}>
                      <input className="routine-input-sm" placeholder="Code (e.g. QSM-3601)" value={c.code} onChange={e => updateCourse(idx, 'code', e.target.value)} onBlur={() => setTimeout(() => setCodeSuggestions(null), 200)} />
                      {codeSuggestions?.idx === idx && codeSuggestions.matches.length > 0 && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 160, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
                          {codeSuggestions.matches.map((m, mi) => (
                            <div key={mi} onClick={() => {
                              const c2 = [...courses];
                              c2[idx] = { ...c2[idx], code: m.code, title: m.title, teacher: m.teacher || c2[idx].teacher, room: m.room || c2[idx].room };
                              setCourses(c2);
                              setCodeSuggestions(null);
                            }} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: '0.78rem', borderBottom: mi < codeSuggestions.matches.length - 1 ? '1px solid var(--border)' : 'none' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg3)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{m.code}</span>
                              <span style={{ marginLeft: 6, color: 'var(--text3, #94a3b8)', fontSize: '0.7rem' }}>{m.title}</span>
                              {m.teacher && <span style={{ marginLeft: 6, color: 'var(--text3, #94a3b8)', fontSize: '0.65rem' }}>({m.teacher})</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <input placeholder="Course Title (e.g. Tafsir Bir Rayi)" value={c.title} onChange={e => updateCourse(idx, 'title', e.target.value)} />
                    <div className="routine-course-row-2">
                      <TeacherAutocomplete value={c.teacher} onChange={(val, sf) => updateCourse(idx, 'teacher', val, sf)} placeholder="Type name or short form (e.g. MER)" />
                      <input className="routine-input-sm" placeholder={c.teacher ? `Room (auto: ${toInitials(c.teacher)})` : 'Room (auto from name)'} value={c.room} onChange={e => updateCourse(idx, 'room', e.target.value)} />
                    </div>
                  </div>
                  <button className="routine-remove-btn" onClick={() => removeCourse(idx)}><i className="fas fa-trash-alt"></i></button>
                </div>
              ))}
            </div>
          )}
          {courses.length === 0 && (
            <div className="routine-empty-courses">
              <i className="fas fa-book-open"></i>
              <p>No courses added yet. Click &quot;Add Course&quot; to start building your schedule.</p>
            </div>
          )}
        </div>
      )}

      {step === 'periods' && (
        <div className="routine-builder-section">
          <div className="routine-builder-section-header">
            <h4><i className="fas fa-clock"></i> Time Periods{isBoth ? ` — ${periodTab === 'male' ? 'Male' : 'Female'}` : isFemale ? ' — Female' : ''}</h4>
            <button className="routine-add-btn" onClick={addPeriodForActive}><i className="fas fa-plus"></i> Add Period</button>
          </div>
          {isBoth && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <button type="button" className={`routine-btn ${periodTab === 'male' ? 'routine-btn-primary' : 'routine-btn-outline'}`} onClick={() => setPeriodTab('male')} style={{ background: periodTab === 'male' ? '#3b82f6' : undefined, color: periodTab === 'male' ? '#fff' : undefined }}>
                <i className="fas fa-mars" style={{ marginRight: 4 }}></i> Male Periods
              </button>
              <button type="button" className={`routine-btn ${periodTab === 'female' ? 'routine-btn-primary' : 'routine-btn-outline'}`} onClick={() => setPeriodTab('female')} style={{ background: periodTab === 'female' ? '#ec4899' : undefined, color: periodTab === 'female' ? '#fff' : undefined }}>
                <i className="fas fa-venus" style={{ marginRight: 4 }}></i> Female Periods
              </button>
            </div>
          )}
          <div className="routine-period-list">
            {activePeriods.map((p, idx) => (
              <div key={idx} className={`routine-period-item ${p.isBreak ? 'break' : ''}`}>
                <div className="routine-period-drag">
                  <button disabled={idx === 0} onClick={() => movePeriodForActive(idx, -1)}><i className="fas fa-chevron-up"></i></button>
                  <button disabled={idx === activePeriods.length - 1} onClick={() => movePeriodForActive(idx, 1)}><i className="fas fa-chevron-down"></i></button>
                </div>
                <div className="routine-period-fields">
                  <input className="routine-period-name" placeholder="Period name" value={p.name} onChange={e => updatePeriodForActive(idx, 'name', e.target.value)} />
                  <div className="routine-period-times">
                    <input type="time" value={to24h(p.start)} onChange={e => updatePeriodForActive(idx, 'start', to12h(e.target.value))} />
                    <span className="routine-period-sep">to</span>
                    <input type="time" value={to24h(p.end)} onChange={e => updatePeriodForActive(idx, 'end', to12h(e.target.value))} />
                  </div>
                </div>
                <label className="routine-break-toggle">
                  <input type="checkbox" checked={!!p.isBreak} onChange={e => updatePeriodForActive(idx, 'isBreak', e.target.checked)} />
                  <span>Break</span>
                </label>
                <button className="routine-remove-btn-sm" onClick={() => removePeriodForActive(idx)}><i className="fas fa-times"></i></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 'assign' && (
        <div className="routine-builder-section">
          <h4><i className="fas fa-table"></i> Assign Courses to Schedule{isBoth ? ` — ${periodTab === 'male' ? 'Male' : 'Female'}` : isFemale ? ' — Female' : ''}</h4>
          {isBoth && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <button type="button" className={`routine-btn ${periodTab === 'male' ? 'routine-btn-primary' : 'routine-btn-outline'}`} onClick={() => setPeriodTab('male')} style={{ background: periodTab === 'male' ? '#3b82f6' : undefined, color: periodTab === 'male' ? '#fff' : undefined }}>
                <i className="fas fa-mars" style={{ marginRight: 4 }}></i> Male Schedule
              </button>
              <button type="button" className={`routine-btn ${periodTab === 'female' ? 'routine-btn-primary' : 'routine-btn-outline'}`} onClick={() => setPeriodTab('female')} style={{ background: periodTab === 'female' ? '#ec4899' : undefined, color: periodTab === 'female' ? '#fff' : undefined }}>
                <i className="fas fa-venus" style={{ marginRight: 4 }}></i> Female Schedule
              </button>
            </div>
          )}
          <p className="routine-builder-hint">Select a course for each day/period. Leave empty for Off Day.</p>
          {courses.length === 0 ? (
            <div className="routine-empty-courses">
              <i className="fas fa-exclamation-triangle"></i>
              <p>Please add courses first (Step 2) before assigning them to the schedule.</p>
            </div>
          ) : (
            <div className="routine-grid-wrapper">
              <table className="routine-grid-table">
                <thead>
                  <tr>
                    <th>Period</th>
                    {days.map(d => <th key={d}>{d.slice(0, 3)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {activePeriods.map((p, pIdx) => {
                    if (p.isBreak) {
                      return (
                        <tr key={pIdx} className="routine-grid-break">
                          <td className="routine-grid-time">{p.start} - {p.end}</td>
                          {days.map(d => <td key={d}>Break</td>)}
                        </tr>
                      );
                    }
                    const cpIdx = nonBreakIdx(pIdx, activePeriods);
                    return (
                      <tr key={pIdx}>
                        <td className="routine-grid-time">
                          <div>{p.name}</div>
                          <small>{p.start} - {p.end}</small>
                        </td>
                        {days.map(d => {
                          const currentSlot = getSlot(d, cpIdx, activeSlots);
                          return (
                            <td key={d}>
                              <CustomSelect
                                value={currentSlot?.course || ''}
                                onChange={(val) => setSlotForActive(d, cpIdx, val)}
                                placeholder="-- Off Day --"
                                options={courses.map(c => ({ value: c.code, label: `${c.code} - ${c.title}` }))}
                                size="sm"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="routine-builder-nav">
        <button className="routine-btn routine-btn-ghost" onClick={onCancel}><i className="fas fa-times"></i> Cancel</button>
        <div className="routine-builder-nav-right">
          {currentStepIdx > 0 && (
            <button className="routine-btn routine-btn-outline" onClick={() => setStep(steps[currentStepIdx - 1].key)}>
              <i className="fas fa-arrow-left"></i> Previous
            </button>
          )}
          {currentStepIdx < steps.length - 1 ? (
            <button className="routine-btn routine-btn-primary" onClick={() => setStep(steps[currentStepIdx + 1].key)}>
              Next <i className="fas fa-arrow-right"></i>
            </button>
          ) : (
            <button className="routine-btn routine-btn-save" onClick={handleSave}>
              <i className="fas fa-save"></i> Save Routine
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Time Helpers ─── */
function to24h(time12h: string): string {
  if (!time12h) return '';
  const match = time12h.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return '';
  let h = parseInt(match[1]); const m = match[2]; const ap = match[3].toUpperCase();
  if (ap === 'AM' && h === 12) h = 0;
  else if (ap === 'PM' && h !== 12) h += 12;
  return `${String(h).padStart(2, '0')}:${m}`;
}

function to12h(time24h: string): string {
  if (!time24h) return '';
  const [hStr, m] = time24h.split(':');
  let h = parseInt(hStr);
  const ap = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m} ${ap}`;
}
