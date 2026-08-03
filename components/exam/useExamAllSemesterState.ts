'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ExamSlot, getEnabledSlots } from '@/lib/exam-routine-config';
import { config } from '@/lib/config';
import { showToast } from '@/lib/utils';
import { useConfirm } from '@/components/ConfirmModal';
import { ExamRoutineItem, ExamRow, ExamCourse, ExamAllStep, ExamAllSemesterSem, DAYS, getDefaultRow } from './types';

interface UseExamAllSemesterStateProps {
  examSlots: ExamSlot[];
  publishedRoutines: ExamRoutineItem[];
  examRoutines: ExamRoutineItem[];
  canPublish: boolean;
  profile: { name: string; title?: string };
  email: string;
  onPublish: (items: ExamRoutineItem[]) => Promise<void>;
  onSaveToCloud: (items: ExamRoutineItem[]) => Promise<void>;
  onSaveDraft: (items: ExamRoutineItem[]) => void;
  canSaveToGithub: boolean;
  onAutoSaveDraft: (draft: any) => void;
  editDraftId: string | null;
  editDraftData: any;
  onClearEditDraft: () => void;
}

export function useExamAllSemesterState(props: UseExamAllSemesterStateProps) {
  const {
    examSlots, publishedRoutines, examRoutines, canPublish, profile, email,
    onPublish, onSaveToCloud, onSaveDraft, canSaveToGithub, onAutoSaveDraft,
    editDraftId, editDraftData, onClearEditDraft,
  } = props;

  const { confirm, confirmDialog } = useConfirm();
  const [step, setStep] = useState<ExamAllStep>('setup');
  const [sessionVal, setSessionVal] = useState('');
  const [department, setDepartment] = useState('qsis');
  const [examType, setExamType] = useState('Midterm');
  const [draftGender, setDraftGender] = useState<'male' | 'female' | 'both'>('both');
  const [rows, setRows] = useState<ExamRow[]>([getDefaultRow(examSlots)]);
  const [semesters, setSemesters] = useState<ExamAllSemesterSem[]>(
    config.semesters.map(s => ({ name: s.id, enabled: true, courses: [] as ExamCourse[] }))
  );
  const [activeSemTab, setActiveSemTab] = useState(0);
  const [showPublishMenu, setShowPublishMenu] = useState(false);
  const [courseSuggestionsIdx, setCourseSuggestionsIdx] = useState<string | null>(null);
  const [courseSearch, setCourseSearch] = useState('');
  const courseInputRef = useRef<HTMLDivElement>(null);

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      const hasData = sessionVal || department !== 'qsis' || examType !== 'Midterm' || rows.some(r => r.date) || semesters.some(s => s.courses.length > 0);
      if (!hasData) return;
      const draft = {
        id: editDraftId || `exam-all-draft-${Date.now()}`,
        session: sessionVal, department, examType, draftGender,
        rows, semesters: semesters.map(s => ({ name: s.name, enabled: s.enabled, courses: s.courses })),
        step, createdAt: Date.now(), isDraft: true,
      };
      onAutoSaveDraft(draft);
    }, 3000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [sessionVal, department, examType, draftGender, rows, semesters, step, editDraftId, onAutoSaveDraft]);

  useEffect(() => {
    if (!editDraftData) return;
    if (editDraftData.session) setSessionVal(editDraftData.session);
    if (editDraftData.department) setDepartment(editDraftData.department);
    if (editDraftData.examType) setExamType(editDraftData.examType);
    if (editDraftData.draftGender) setDraftGender(editDraftData.draftGender);
    if (editDraftData.rows?.length) setRows(editDraftData.rows);
    if (editDraftData.semesters?.length) {
      setSemesters(prev => {
        const restored = editDraftData.semesters.map((s: any) => ({
          name: s.name, enabled: s.enabled,
          courses: (s.courses || []).map((c: any) => ({ code: c.code, title: c.title, teacher: c.teacher || '', fromGithub: c.fromGithub ?? true })),
        }));
        return prev.map(p => restored.find((r: any) => r.name === p.name) || p);
      });
    }
    if (editDraftData.step) setStep(editDraftData.step);
    onClearEditDraft();
  }, [editDraftData]);

  useEffect(() => {
    if (!showPublishMenu) return;
    const handler = () => setShowPublishMenu(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [showPublishMenu]);

  useEffect(() => {
    if (!courseSuggestionsIdx) return;
    const handler = (e: MouseEvent) => {
      if (courseInputRef.current && !courseInputRef.current.contains(e.target as Node)) {
        setCourseSuggestionsIdx(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [courseSuggestionsIdx]);

  const enabledSlots = getEnabledSlots(examSlots);
  const semLabels = useMemo(() => config.semesters.reduce((acc, s) => { acc[s.id] = s.label; return acc; }, {} as Record<string, string>), []);
  const enabledSemesters = useMemo(() => semesters.filter(s => s.enabled), [semesters]);

  const allCourses = useMemo(() => {
    const map = new Map<string, { code: string; title: string }>();
    for (const sem of semesters) {
      for (const c of sem.courses) {
        if (c.code && c.title && !map.has(c.code)) map.set(c.code, { code: c.code, title: c.title });
      }
    }
    return Array.from(map.values());
  }, [semesters]);

  const filteredCourseSuggestions = useMemo(() => {
    if (!courseSearch.trim()) return [];
    const q = courseSearch.trim().toUpperCase();
    return allCourses.filter(c => c.code.toUpperCase().includes(q) || c.title.toUpperCase().includes(q)).slice(0, 8);
  }, [courseSearch, allCourses]);

  const loadSemesterCourses = useCallback(async (semName: string) => {
    try {
      const res = await fetch(`/api/semester-courses?semester=${encodeURIComponent(semName)}`);
      const data = await res.json();
      if (!data.success || !data.courses?.length) return;
      const dbCourses: ExamCourse[] = data.courses.map((c: any) => ({ code: c.code, title: c.title, teacher: '', fromGithub: true }));
      setSemesters(prev => prev.map(s => {
        if (s.name !== semName) return s;
        const existingCodes = new Set(s.courses.map(c => c.code));
        const newCourses = dbCourses.filter(c => !existingCodes.has(c.code));
        if (newCourses.length > 0) return { ...s, courses: [...s.courses, ...newCourses] };
        return s;
      }));
    } catch {}
  }, []);

  const loadGithubCourses = useCallback(async (semName: string) => {
    try {
      const res = await fetch(`/api/github-courses?department=${department}&semester=${semName}`);
      const data = await res.json();
      if (!data.success || !data.courses?.length) return;
      const ghCourses: ExamCourse[] = data.courses.map((c: any) => ({ code: c.code, title: c.title, teacher: '', fromGithub: true }));
      setSemesters(prev => prev.map(s => {
        if (s.name !== semName) return s;
        const existingCodes = new Set(s.courses.map(c => c.code));
        const newCourses = ghCourses.filter(c => !existingCodes.has(c.code));
        if (newCourses.length > 0) return { ...s, courses: [...s.courses, ...newCourses] };
        return s;
      }));
    } catch {}
  }, [department]);

  useEffect(() => {
    for (const sem of enabledSemesters) {
      loadSemesterCourses(sem.name);
      loadGithubCourses(sem.name);
    }
  }, [department]);

  const updateRow = (idx: number, field: keyof ExamRow, value: string) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const updated = { ...r, [field]: value };
      if (field === 'date' && value) {
        const d = new Date(value + 'T00:00:00');
        updated.day = DAYS[(d.getDay() + 1) % 7];
      }
      return updated;
    }));
  };
  const addRow = () => setRows(prev => [...prev, getDefaultRow(examSlots)]);
  const removeRow = (idx: number) => setRows(prev => prev.filter((_, i) => i !== idx));

  const updateSemCourse = (semName: string, cIdx: number, field: keyof ExamCourse, value: string) => {
    setSemesters(prev => prev.map(s => {
      if (s.name !== semName) return s;
      const courses = [...s.courses];
      courses[cIdx] = { ...courses[cIdx], [field]: value };
      return { ...s, courses };
    }));
  };
  const addSemCourse = (semName: string) => {
    setSemesters(prev => prev.map(s => {
      if (s.name !== semName) return s;
      return { ...s, courses: [...s.courses, { code: '', title: '' }] };
    }));
  };
  const removeSemCourse = (semName: string, cIdx: number) => {
    setSemesters(prev => prev.map(s => {
      if (s.name !== semName) return s;
      return { ...s, courses: s.courses.filter((_, j) => j !== cIdx) };
    }));
  };
  const saveCourseToGitHub = useCallback(async (semName: string, code: string, title: string) => {
    if (!code || !title || !department) return;
    try {
      await fetch('/api/github-courses/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ department, semester: semName, code, title }),
      });
    } catch {}
  }, [department]);

  const toggleSemester = (semIdx: number) => {
    setSemesters(prev => prev.map((s, i) => i === semIdx ? { ...s, enabled: !s.enabled } : s));
  };

  const buildAllItems = (): ExamRoutineItem[] | null => {
    if (rows.every(r => !r.date)) { showToast('Add at least one exam date', 'error'); return null; }
    const items: ExamRoutineItem[] = [];
    for (const sem of enabledSemesters) {
      if (sem.courses.length === 0) continue;
      const genderLabel = draftGender === 'both' ? '' : draftGender === 'male' ? ' (Male)' : ' (Female)';
      const semRows = rows.map(row => {
        const courses: Record<string, ExamCourse> = {};
        for (const slot of enabledSlots) {
          const assignedSem = row.semesterSlots?.[slot.id] || '';
          if (assignedSem === sem.name) {
            const cellKey = `${row.date}:${slot.id}`;
            const cellCourse = row.courses[cellKey];
            if (cellCourse?.code) {
              courses[slot.id] = { code: cellCourse.code, title: cellCourse.title };
            }
          } else {
            courses[slot.id] = { code: '', title: '' };
          }
        }
        return { date: row.date, day: row.day, courses, semesterSlots: {} };
      });
      items.push({
        id: `exam-all-${Date.now()}-${sem.name}`,
        semester: `${semLabels[sem.name] || sem.name}${genderLabel}`, session: sessionVal, department, examType,
        rows: semRows, slots: examSlots, createdAt: Date.now(),
      });
    }
    if (items.length === 0) { showToast('Assign at least one semester to a slot', 'error'); return null; }
    return items;
  };

  const handleSaveDraftAll = async () => {
    const items = buildAllItems();
    if (!items) return;
    if (!await confirm({ message: `Save ${items.length} exam routines as draft?`, title: 'Save Draft' })) return;
    onSaveDraft(items);
    showToast(`${items.length} exam routines saved as draft!`, 'success');
    setShowPublishMenu(false);
  };
  const handleSaveToCloudAll = async () => {
    const items = buildAllItems();
    if (!items) return;
    if (!await confirm({ message: `Save ${items.length} exam routines to cloud? (Private)`, title: 'Save to Cloud' })) return;
    await onSaveToCloud(items);
    setShowPublishMenu(false);
  };
  const handlePublishAll = async () => {
    const items = buildAllItems();
    if (!items) return;
    if (!await confirm({ message: `Publish ${items.length} exam routines? (Visible to all students)`, title: 'Publish Exam Routines' })) return;
    await onPublish(items);
    setShowPublishMenu(false);
  };

  const totalSections = enabledSemesters.filter(s => s.courses.length > 0).length;

  return {
    step, setStep,
    sessionVal, setSessionVal,
    department, setDepartment,
    examType, setExamType,
    draftGender, setDraftGender,
    rows, setRows,
    semesters, setSemesters,
    activeSemTab, setActiveSemTab,
    showPublishMenu, setShowPublishMenu,
    courseSuggestionsIdx, setCourseSuggestionsIdx,
    courseSearch, setCourseSearch,
    courseInputRef,
    enabledSlots, semLabels, enabledSemesters, allCourses, filteredCourseSuggestions,
    updateRow, addRow, removeRow,
    updateSemCourse, addSemCourse, removeSemCourse, saveCourseToGitHub,
    toggleSemester,
    handleSaveDraftAll, handleSaveToCloudAll, handlePublishAll,
    totalSections, confirmDialog,
    canPublish, canSaveToGithub,
  };
}
