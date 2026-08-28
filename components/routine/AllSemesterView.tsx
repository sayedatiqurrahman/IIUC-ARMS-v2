'use client';

import { useState, useEffect } from 'react';
import { useConfirm } from '@/components/ConfirmModal';
import CustomSelect from '@/components/CustomSelect';
import { resolveDepartment, getDepartmentSelectOptions, getDepartmentDisplayName } from '@/lib/departments';
import { getOnboardingData } from '@/lib/onboarding-storage';
import { useAppStore } from '@/lib/store';
import type { RoutineItem, RoutinePeriod, RoutineCourse, RoutineSlot, AllSemesterDraft, AllSemesterDraftSection, AllSemBuilderStep, TempGenderCell } from './types';
import { DEFAULT_PERIODS, DEFAULT_FEMALE_PERIODS } from './types';
import { loadAllSemDraft, saveAllSemDraft, createEmptyDraft, findTeacherConflicts } from './helpers';
import { showToast } from '@/lib/utils';
import PeriodEditor from './PeriodEditor';

export default function AllSemesterView({ publishedRoutines, onView, onPublish, onBack }: {
  publishedRoutines: RoutineItem[];
  onView: (id: string) => void;
  onPublish: (routines: RoutineItem[]) => void;
  onBack: () => void;
}) {
  const { confirm, confirmDialog } = useConfirm();
  const [draft, setDraft] = useState<AllSemesterDraft | null>(() => {
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
    return null;
  });
  const [step, setStep] = useState<AllSemBuilderStep>('info');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [addingSem, setAddingSem] = useState(false);
  const [newSemName, setNewSemName] = useState('');
  const [expandedSemCourses, setExpandedSemCourses] = useState<number | null>(null);
  const [periodTab, setPeriodTab] = useState<'male' | 'female'>('male');
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [conflictMap, setConflictMap] = useState<Record<string, string[]>>({});
  const [githubLoadingSem, setGithubLoadingSem] = useState<string | null>(null);

  // Department is driven by the user's personalization (profile, then onboarding).
  const profile = useAppStore(s => s.profile);
  const [department, setDepartment] = useState<string>('');
  useEffect(() => {
    if (department) return;
    const resolved = profile?.department ? resolveDepartment(profile.department) : '';
    if (resolved) { setDepartment(resolved); return; }
    const onboard = getOnboardingData();
    if (onboard?.department) {
      const r = resolveDepartment(onboard.department);
      if (r) setDepartment(r);
    }
  }, [profile?.department, department]);

  // Temporary slots for gender-level grid (no sections)
  const [tempGenderSlots, setTempGenderSlots] = useState<Record<string, Record<string, Record<string, TempGenderCell>>>>({});

  useEffect(() => {
    if (!draft) return;
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
        for (const [cellKey, cell] of Object.entries(cells)) {
          if (!cell?.course) continue;
          const [day, periodStr] = cellKey.split(':');
          const periodIdx = parseInt(periodStr);
          const sem = draft.semesters.find(s => s.name === semName);
          const course = sem?.courses.find(c => c.code === cell.course);
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
    } else {
      const existing = sec.slots.find(s => s.day === day && s.period === period);
      const course = updated.semesters[semIdx].courses.find(c => c.code === courseCode);
      const room = existing?.room || course?.room || sec.room || '';
      if (existing) {
        sec.slots = sec.slots.map(s => s.day === day && s.period === period ? { ...s, course: courseCode, room } : s);
      } else {
        sec.slots = [...sec.slots, { day, period, course: courseCode, room }];
      }
    }
    updated.semesters[semIdx].sections[sectionIdx] = sec;
    setDraft(updated);
  };

  const updateSlotRoomInSection = (semIdx: number, sectionIdx: number, day: string, period: number, room: string) => {
    const updated = { ...draft };
    updated.semesters = [...updated.semesters];
    updated.semesters[semIdx] = { ...updated.semesters[semIdx], sections: [...updated.semesters[semIdx].sections] };
    const sec = { ...updated.semesters[semIdx].sections[sectionIdx] };
    sec.slots = sec.slots.map(s => s.day === day && s.period === period ? { ...s, room } : s);
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

  // Load the course list + teacher mapping for the selected department + this semester from the cloud.
  const loadCoursesFromCloud = async (semIdx: number, silent = false) => {
    if (!department) { showToast('Please select a department first', 'error'); return; }
    const sem = draft.semesters[semIdx];
    setGithubLoadingSem(sem.name);
    try {
      const res = await fetch(`/api/cloud-courses?department=${encodeURIComponent(department)}&semester=${encodeURIComponent(sem.name)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.courses) && data.courses.length > 0) {
        const courses = data.courses.map((c: any) => ({ code: c.code, title: c.title, teacher: c.teacher || '', room: c.room || '' }));
        const updated = { ...draft };
        updated.semesters = [...updated.semesters];
        updated.semesters[semIdx] = { ...updated.semesters[semIdx], courses };
        setDraft(updated);
        if (!silent) showToast(`Loaded ${courses.length} courses for ${sem.name} from the cloud`, 'success');
        return;
      }
      if (!silent) showToast(data.error || `No courses found for this department & ${sem.name}`, 'error');
    } catch {
      if (!silent) showToast('Failed to load courses from the cloud', 'error');
    } finally {
      setGithubLoadingSem(null);
    }
  };

  // Auto-load cloud courses for any semester that has none yet
  useEffect(() => {
    if (!draft || !department) return;
    draft.semesters.forEach((sem, semIdx) => {
      if (sem.courses.length === 0) loadCoursesFromCloud(semIdx, true);
    });
  }, [department]);

  const updatePeriods = (gender: 'male' | 'female', periods: RoutinePeriod[]) => {
    updateDraft(gender === 'male' ? { malePeriods: periods } : { femalePeriods: periods });
  };

  const handlePublishAll = async () => {
    if (Object.keys(conflictMap).length > 0) {
      showToast('Cannot publish — teacher conflicts detected! Fix all conflicts first.', 'error');
      return;
    }
    const missingRooms: string[] = [];
    for (const sem of draft.semesters) {
      for (const gender of getGendersToShow()) {
        const genderSections = sem.sections.filter(s => s.gender === gender);
        if (genderSections.length > 0) {
          for (const section of genderSections) {
            for (const slot of section.slots) {
              const course = sem.courses.find(c => c.code === slot.course);
              if (course && !slot.room?.trim()) {
                missingRooms.push(`${sem.name} · Section ${section.branch || 'Main'} · ${slot.day} P${slot.period + 1} (${course.code})`);
              }
            }
          }
        } else {
          const cells = tempGenderSlots[sem.name]?.[gender] || {};
          for (const [key, cell] of Object.entries(cells)) {
            if (!cell?.course) continue;
            const course = sem.courses.find(c => c.code === cell.course);
            if (course && !cell.room?.trim()) {
              const [day, periodStr] = key.split(':');
              missingRooms.push(`${sem.name} · ${day} P${parseInt(periodStr) + 1} (${course.code})`);
            }
          }
        }
      }
    }
    if (missingRooms.length > 0) {
      showToast(`Add a room to ${missingRooms.length} class slot(s) first — e.g. ${missingRooms[0]}`, 'error');
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
              department: getDepartmentDisplayName(department),
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
          for (const [key, cell] of Object.entries(semGenderSlots)) {
            if (cell?.course) {
              const [day, periodStr] = key.split(':');
              genderSlots.push({ day, period: parseInt(periodStr), course: cell.course, room: cell.room });
            }
          }
          routines.push({
            id: `pub-${Date.now()}-${sem.name.replace(/\s/g, '')}-${gender}-all-${Math.random().toString(36).slice(2, 6)}`,
            semester: sem.name, branch: null, gender,
            session: draft.session, room: sem[genderRoomKey],
            academicYear: new Date().getFullYear().toString(),
            department: getDepartmentDisplayName(department),
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

  if (!draft) {
    return (
      <div className="routine-page-header no-print">
        <div>
          <h3 className="routine-page-title"><i className="fas fa-layer-group"></i> All Semester Routine</h3>
          <p className="routine-page-sub">4-step builder for all semesters, genders &amp; sections with separate rooms</p>
        </div>
        <div className="routine-page-actions">
          <button className="routine-btn routine-btn-accent" onClick={() => {
            const fresh = createEmptyDraft();
            saveAllSemDraft(fresh);
            setDraft(fresh);
          }}><i className="fas fa-plus"></i> Create New Draft</button>
          <button className="routine-btn routine-btn-ghost" onClick={onBack}><i className="fas fa-arrow-left"></i> Back</button>
        </div>
      </div>
    );
  }

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
              <label>Department</label>
              <CustomSelect
                value={department}
                onChange={(val) => setDepartment(val)}
                placeholder="Select department"
                searchable
                options={getDepartmentSelectOptions()}
              />
            </div>
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
                          <input placeholder="Teacher name" value={c.teacher} onChange={e => updateSemCourse(semIdx, cIdx, 'teacher', e.target.value)} />
                          <input className="routine-input-sm" placeholder="Room" value={c.room} onChange={e => updateSemCourse(semIdx, cIdx, 'room', e.target.value)} />
                        </div>
                      </div>
                      <button className="routine-remove-btn" onClick={() => removeSemCourse(semIdx, cIdx)}><i className="fas fa-trash-alt"></i></button>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                    <button className="routine-add-btn" onClick={() => loadCoursesFromCloud(semIdx)} disabled={githubLoadingSem === sem.name}>
                      <i className={`fas ${githubLoadingSem === sem.name ? 'fa-spinner fa-spin' : 'fa-cloud-download-alt'}`}></i> {githubLoadingSem === sem.name ? 'Loading...' : 'Load course list'}
                    </button>
                    <button className="routine-add-btn" onClick={() => addCourseToSem(semIdx)}><i className="fas fa-plus"></i> Add Course to {sem.name}</button>
                  </div>
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
                                          const cellKey = `${d}:${cpIdx}`;
                                          const currentCell = tempGenderSlots[sem.name]?.[gender]?.[cellKey] || null;
                                          return (
                                            <td key={`${d}-${cpIdx}`}>
                                              <CustomSelect
                                                value={currentCell?.course || ''}
                                                onChange={(val) => {
                                                  setTempGenderSlots(prev => {
                                                    const next = { ...prev };
                                                    if (!next[sem.name]) next[sem.name] = {};
                                                    if (!next[sem.name][gender]) next[sem.name][gender] = {};
                                                    const cells = { ...next[sem.name][gender] };
                                                    if (val === '') {
                                                      delete cells[cellKey];
                                                    } else {
                                                      const course = sem.courses.find(c => c.code === val);
                                                      cells[cellKey] = {
                                                        course: val,
                                                        room: cells[cellKey]?.room || course?.room || sem[genderRoomKey] || '',
                                                      };
                                                    }
                                                    next[sem.name][gender] = cells;
                                                    return next;
                                                  });
                                                }}
                                                placeholder="-- Select --"
                                                options={sem.courses.map(c => ({ value: c.code, label: `${c.code} - ${c.title}${c.teacher ? ` (${c.teacher})` : ''}` }))}
                                                showEmpty
                                              />
                                              {currentCell?.course && (
                                                <input
                                                  value={currentCell.room}
                                                  onChange={(e) => {
                                                    setTempGenderSlots(prev => {
                                                      const next = { ...prev };
                                                      if (!next[sem.name]) next[sem.name] = {};
                                                      if (!next[sem.name][gender]) next[sem.name][gender] = {};
                                                      const cells = { ...next[sem.name][gender] };
                                                      if (cells[cellKey]) cells[cellKey] = { ...cells[cellKey], room: e.target.value };
                                                      next[sem.name][gender] = cells;
                                                      return next;
                                                    });
                                                  }}
                                                  placeholder="Room #"
                                                  style={{ width: '90%', marginTop: 3, padding: '2px 6px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '0.68rem', outline: 'none' }}
                                                />
                                              )}
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
                                                  placeholder="-- Select --"
                                                  options={sem.courses.map(c => ({ value: c.code, label: `${c.code} - ${c.title}${c.teacher ? ` (${c.teacher})` : ''}` }))}
                                                  showEmpty
                                                  size="sm"
                                                />
                                                {currentSlot?.course && (
                                                  <input
                                                    value={currentSlot.room || ''}
                                                    onChange={(e) => updateSlotRoomInSection(semIdx, secIdx, d, cpIdx, e.target.value)}
                                                    placeholder={currentSlot.room ? 'Room #' : 'Room # (required)'}
                                                    style={{ width: '90%', marginTop: 3, padding: '2px 6px', borderRadius: 5, border: `${currentSlot.room?.trim() ? '1px solid var(--border)' : '1px solid #ef4444'}`, background: 'var(--bg)', color: 'var(--text)', fontSize: '0.68rem', outline: 'none' }}
                                                  />
                                                )}
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
