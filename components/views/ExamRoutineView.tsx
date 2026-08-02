'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useAppStore } from '@/lib/store';
import { config } from '@/lib/config';
import { showToast } from '@/lib/utils';
import { ExamSlot, DEFAULT_EXAM_SLOTS, loadExamSlots, saveExamSlots, getEnabledSlots } from '@/lib/exam-routine-config';
import TeacherAutocomplete from '@/components/TeacherAutocomplete';
import CustomSelect from '@/components/CustomSelect';
import { FACULTIES, findDepartment } from '@/lib/departments';
import { useConfirm } from '@/components/ConfirmModal';

function getDefaultSession(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  return month < 6 ? `Spring - ${year}` : `Autumn - ${year}`;
}

interface ExamCourse {
  code: string;
  title: string;
  teacher?: string;
  room?: string;
  rollRange?: string;
  fromGithub?: boolean;
}

interface ExamRow {
  date: string;
  day: string;
  courses: Record<string, ExamCourse>;
  semesterSlots: Record<string, string>;
}

interface ExamRoutineItem {
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

const LS_EXAM_DRAFTS = 'qsis-exam-draft-routines';
const LS_EXAM_PUBLISHED = 'qsis-exam-published-routines';
const DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const EXAM_TYPES = ['Midterm', 'Final', 'Quiz', 'Makeup', 'Practical'];

function expandRollRange(range: string): string[] {
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

function formatRollCount(rollStr: string): string {
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

function getDefaultRow(slots: ExamSlot[]): ExamRow {
  const courses: Record<string, ExamCourse> = {};
  const semesterSlots: Record<string, string> = {};
  slots.filter(s => s.enabled).forEach(s => { courses[s.id] = { code: '', title: '' }; semesterSlots[s.id] = ''; });
  return { date: '', day: '', courses, semesterSlots };
}

export default function ExamRoutineView() {
  const { data: session } = useSession();
  const profile = useAppStore(s => s.profile);

  const [viewMode, setViewMode] = useState<'manager' | 'builder' | 'preview' | 'slots' | 'allBranch'>('manager');
  const [examSlots, setExamSlots] = useState<ExamSlot[]>([]);
  const [examRoutines, setExamRoutines] = useState<ExamRoutineItem[]>([]);
  const [publishedRoutines, setPublishedRoutines] = useState<ExamRoutineItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [semester, setSemester] = useState('');
  const [sessionVal, setSessionVal] = useState('');
  const [department, setDepartment] = useState('qsis');
  const [examType, setExamType] = useState('Midterm');
  const [rows, setRows] = useState<ExamRow[]>([]);

  const email = session?.user?.email || profile.email || '';
  const isOwner = config.ownerEmails.includes(email);
  const [canPublish, setCanPublish] = useState(false);
  const [canAllSemester, setCanAllSemester] = useState(false);
  const [canSaveToGithub, setCanSaveToGithub] = useState(false);

  useEffect(() => {
    fetch('/api/settings/permissions')
      .then(r => r.json())
      .then(data => {
        if (!data.success) return;
        const perms = data.permissions || {};
        const role = config.getEffectiveRole(email, profile.role);
        const roleKey = profile.isCR ? 'cr' : role;
        const customPerms = (profile as any).customPermissions || {};
        const allowed = perms.publishRoutine || ['admin', 'manager', 'teacher', 'cr'];
        setCanPublish(isOwner || customPerms.publishRoutine === true || allowed.includes(roleKey));
        setCanAllSemester(isOwner || ['admin', 'manager', 'teacher'].includes(role));
        const ghAllowed = perms.saveCourseToGitHub || ['admin', 'manager', 'teacher', 'cr'];
        setCanSaveToGithub(isOwner || customPerms.saveCourseToGitHub === true || ghAllowed.includes(roleKey));
      })
      .catch(() => {});
  }, [email, profile.role, profile.isCR, isOwner]);

  const loadDrafts = useCallback(() => {
    try {
      const drafts = JSON.parse(localStorage.getItem(LS_EXAM_DRAFTS) || '[]');
      setExamRoutines(drafts);
    } catch {}
  }, []);

  const loadPublishedFromDB = useCallback(async () => {
    try {
      const res = await fetch('/api/published-exam-routines');
      const data = await res.json();
      if (data.success && Array.isArray(data.routines)) {
        setPublishedRoutines(data.routines);
      }
    } catch {}
  }, []);

  useEffect(() => {
    setExamSlots(loadExamSlots());
    loadDrafts();
    loadPublishedFromDB();
  }, [loadDrafts, loadPublishedFromDB]);

  const persistDrafts = useCallback((r: ExamRoutineItem[]) => {
    setExamRoutines(r);
    localStorage.setItem(LS_EXAM_DRAFTS, JSON.stringify(r));
  }, []);

  // Auto-save single routine draft every 3 seconds of inactivity
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (viewMode !== 'builder') return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      if (!semester && !sessionVal && rows.every(r => !r.date)) return;
      const draft: ExamRoutineItem = {
        id: editingId || `draft-${Date.now()}`,
        semester, session: sessionVal, department, examType,
        rows, slots: examSlots,
        createdAt: Date.now(), isDraft: true, published: false,
      };
      const updated = examRoutines.filter(d => d.id !== draft.id);
      updated.push(draft);
      persistDrafts(updated);
    }, 3000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [rows, semester, sessionVal, department, examType, examSlots, viewMode, editingId]);

  const enabledSlots = getEnabledSlots(examSlots);

  function startNew() {
    setEditingId(null);
    setSemester('');
    setSessionVal('');
    setDepartment('qsis');
    setExamType('Midterm');
    setRows([getDefaultRow(examSlots)]);
    setViewMode('builder');
  }

  function editRoutine(r: ExamRoutineItem) {
    setEditingId(r.id);
    setSemester(r.semester);
    setSessionVal(r.session);
    setDepartment(r.department);
    setExamType(r.examType);
    setRows(r.rows.length > 0 ? r.rows : [getDefaultRow(examSlots)]);
    setViewMode('builder');
  }

  async function saveDraft() {
    const id = editingId || `exam-${Date.now()}`;
    const routine: ExamRoutineItem = {
      id, semester, session: sessionVal, department, examType, rows, slots: examSlots,
      createdAt: Date.now(), published: false, isDraft: true,
    };
    const isPublishedEdit = editingId && publishedRoutines.some(r => r.id === editingId);
    if (isPublishedEdit) {
      const existing = publishedRoutines.find(r => r.id === editingId);
      const updatedPub: ExamRoutineItem = { ...routine, published: true, isDraft: false, publishedBy: existing?.publishedBy, publishedAt: existing?.publishedAt };
      try {
        const res = await fetch('/api/published-exam-routines', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ routines: [updatedPub] }),
        });
        const data = await res.json();
        if (data.success) {
          await loadPublishedFromDB();
          showToast('Published routine updated!', 'success');
        }
      } catch {
        showToast('Failed to update', 'error');
      }
    } else {
      const updated = examRoutines.filter(r => r.id !== id);
      updated.push(routine);
      persistDrafts(updated);
      showToast('Exam routine saved as draft', 'success');
    }
    setViewMode('manager');
  }

  async function publishRoutine(r: ExamRoutineItem) {
    const publisherName = profile.name || email.split('@')[0];
    const published: ExamRoutineItem = {
      ...r, published: true, isDraft: false,
      publishedBy: { name: publisherName, title: profile.title || undefined, email },
      publishedAt: Date.now(),
    };
    try {
      const res = await fetch('/api/published-exam-routines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routines: [published] }),
      });
      const data = await res.json();
      if (data.success) {
        persistDrafts(examRoutines.filter(d => d.id !== r.id));
        await loadPublishedFromDB();
        showToast('Exam routine published!', 'success');
      } else {
        showToast(data.error || 'Failed to publish', 'error');
      }
    } catch {
      showToast('Failed to publish', 'error');
    }
  }

  async function unpublishRoutine(id: string) {
    try {
      const res = await fetch(`/api/published-exam-routines?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await loadPublishedFromDB();
        showToast('Exam routine unpublished', 'success');
      }
    } catch {
      showToast('Failed to unpublish', 'error');
    }
  }

  function deleteRoutine(id: string) {
    persistDrafts(examRoutines.filter(r => r.id !== id));
    showToast('Deleted', 'success');
  }

  function updateRow(idx: number, field: string, value: string) {
    const r = [...rows];
    if (field === 'date') {
      const d = new Date(value);
      r[idx] = { ...r[idx], date: value, day: DAYS[(d.getDay() + 1) % 7] || '' };
    } else {
      r[idx] = { ...r[idx], [field]: value };
    }
    setRows(r);
  }

  function updateRowCourse(rowIdx: number, slotId: string, field: keyof ExamCourse, value: string) {
    const r = [...rows];
    const courses = { ...r[rowIdx].courses };
    courses[slotId] = { ...courses[slotId], [field]: value };
    r[rowIdx] = { ...r[rowIdx], courses };
    setRows(r);
  }

  function addRow() {
    setRows([...rows, getDefaultRow(examSlots)]);
  }

  function removeRow(idx: number) {
    if (rows.length <= 1) return;
    setRows(rows.filter((_, i) => i !== idx));
  }

  function addSlot() {
    const newSlot: ExamSlot = {
      id: `slot-${Date.now()}`,
      name: `${examSlots.length + 1}th Slot`,
      startTime: '05:00 PM',
      endTime: '07:00 PM',
      enabled: true,
      order: examSlots.length + 1,
    };
    const updated = [...examSlots, newSlot];
    setExamSlots(updated);
    saveExamSlots(updated);
  }

  function updateSlot(idx: number, field: keyof ExamSlot, value: any) {
    const updated = [...examSlots];
    updated[idx] = { ...updated[idx], [field]: value };
    setExamSlots(updated);
    saveExamSlots(updated);
  }

  function removeSlot(idx: number) {
    if (examSlots.length <= 1) return;
    const updated = examSlots.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 }));
    setExamSlots(updated);
    saveExamSlots(updated);
  }

  function moveSlot(idx: number, dir: -1 | 1) {
    const updated = [...examSlots];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= updated.length) return;
    [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
    updated.forEach((s, i) => s.order = i + 1);
    setExamSlots(updated);
    saveExamSlots(updated);
  }

  const deptInfo = findDepartment(department);

  return (
    <section className="mb-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-[1.3rem] font-bold text-dark-text">
            <i className="fas fa-file-alt text-qsis mr-2"></i>Exam Routine
          </h2>
          {profile?.department && (
            <p className="text-[0.72rem] text-qsis mt-0.5">
              <i className="fas fa-building mr-1"></i>{findDepartment(profile.department)?.department.shortName || profile.department}
              {profile.semester && <><span className="mx-1">&bull;</span><i className="fas fa-graduation-cap mr-1"></i>{config.semesters.find(s => s.id === profile.semester)?.label || profile.semester}</>}
            </p>
          )}
          {!profile?.department && (
            <p className="text-[0.78rem] text-dark-text2 mt-0.5">
              {deptInfo ? `${deptInfo.department.shortName} — ${deptInfo.faculty.shortName}` : 'Create and manage exam routines'}
            </p>
          )}
        </div>
        {viewMode === 'manager' && (
          <div className="flex flex-wrap gap-2">
            {canPublish && (
              <button onClick={() => setViewMode('slots')} className="routine-btn">
                <i className="fas fa-cog mr-1"></i>Exam Slots
              </button>
            )}
            {canAllSemester && (
              <button onClick={() => setViewMode('allBranch')} className="routine-btn routine-btn-accent">
                <i className="fas fa-layer-group mr-1"></i>All Semester
              </button>
            )}
            <button onClick={startNew} className="routine-btn routine-btn-primary">
              <i className="fas fa-plus mr-1"></i>New Exam Routine
            </button>
          </div>
        )}
        {viewMode !== 'manager' && (
          <button onClick={() => setViewMode('manager')} className="routine-btn">
            <i className="fas fa-arrow-left mr-1"></i>Back
          </button>
        )}
      </div>

      {/* ═══════ SLOT MANAGER ═══════ */}
      {viewMode === 'slots' && (
        <div className="bg-dark-bg2 border border-dark-border rounded-xl p-5">
          <h3 className="text-[0.95rem] font-bold text-dark-text mb-1"><i className="fas fa-clock text-qsis mr-2"></i>Exam Slot Configuration</h3>
          <p className="text-[0.75rem] text-dark-text2 mb-4">Manage exam time slots. Disabled slots won&apos;t appear in the routine builder.</p>
          <div className="space-y-3 mb-4">
            {examSlots.map((slot, idx) => (
              <div key={slot.id} className="flex items-center gap-3 p-3 rounded-lg bg-dark-bg border border-dark-border">
                <div className="flex flex-col gap-1">
                  <button onClick={() => moveSlot(idx, -1)} disabled={idx === 0} className="text-dark-text3 hover:text-qsis disabled:opacity-30 text-[0.6rem]"><i className="fas fa-chevron-up"></i></button>
                  <button onClick={() => moveSlot(idx, 1)} disabled={idx === examSlots.length - 1} className="text-dark-text3 hover:text-qsis disabled:opacity-30 text-[0.6rem]"><i className="fas fa-chevron-down"></i></button>
                </div>
                <input type="text" value={slot.name} onChange={e => updateSlot(idx, 'name', e.target.value)} className="px-2 py-1.5 rounded border border-dark-border bg-dark-bg2 text-dark-text text-[0.82rem] w-32 outline-none focus:border-qsis" placeholder="Slot name" />
                <input type="text" value={slot.startTime} onChange={e => updateSlot(idx, 'startTime', e.target.value)} className="px-2 py-1.5 rounded border border-dark-border bg-dark-bg2 text-dark-text text-[0.82rem] w-28 outline-none focus:border-qsis" placeholder="Start" />
                <span className="text-dark-text3 text-[0.72rem]">to</span>
                <input type="text" value={slot.endTime} onChange={e => updateSlot(idx, 'endTime', e.target.value)} className="px-2 py-1.5 rounded border border-dark-border bg-dark-bg2 text-dark-text text-[0.82rem] w-28 outline-none focus:border-qsis" placeholder="End" />
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={slot.enabled} onChange={e => updateSlot(idx, 'enabled', e.target.checked)} className="accent-qsis" />
                  <span className="text-[0.72rem] text-dark-text2">Active</span>
                </label>
                <button onClick={() => removeSlot(idx)} disabled={examSlots.length <= 1} className="ml-auto text-red-400 hover:text-red-300 disabled:opacity-30 bg-transparent border-none cursor-pointer text-[0.75rem]">
                  <i className="fas fa-trash"></i>
                </button>
              </div>
            ))}
          </div>
          <button onClick={addSlot} className="routine-btn">
            <i className="fas fa-plus mr-1"></i>Add Slot
          </button>
        </div>
      )}

      {/* ═══════ MANAGER ═══════ */}
      {viewMode === 'manager' && (
        <div className="space-y-3">
          {publishedRoutines.length === 0 && examRoutines.length === 0 && (
            <div className="text-center py-10">
              <i className="fas fa-file-alt text-3xl text-dark-text3 mb-3 block"></i>
              <p className="text-[0.9rem] text-dark-text2">No exam routines yet</p>
              <p className="text-[0.75rem] text-dark-text3 mt-1">Click &quot;New Exam Routine&quot; to create one</p>
            </div>
          )}
          {publishedRoutines.map(r => {
            const canEditPub = isOwner || (r.publishedBy?.email && r.publishedBy.email === email);
            return (
              <ExamRoutineCard key={r.id} routine={r} slots={r.slots || examSlots} onView={() => { setEditingId(r.id); setRows(r.rows); setExamSlots(r.slots || examSlots); setSemester(r.semester); setSessionVal(r.session); setDepartment(r.department); setExamType(r.examType); setViewMode('preview'); }} onEdit={canEditPub ? () => editRoutine(r) : undefined} onUnpublish={() => unpublishRoutine(r.id)} canManage={canPublish} isPublished currentUserEmail={email} isAdmin={isOwner} />
            );
          })}
          {examRoutines.map(r => (
            <ExamRoutineCard key={r.id} routine={r} slots={r.slots || examSlots} onView={() => editRoutine(r)} onPublish={() => publishRoutine(r)} onDelete={() => deleteRoutine(r.id)} canManage={canPublish} currentUserEmail={email} isAdmin={isOwner} />
          ))}
        </div>
      )}

      {/* ═══════ BUILDER ═══════ */}
      {viewMode === 'builder' && (
        <div className="bg-dark-bg2 border border-dark-border rounded-xl p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div>
              <label className="text-[0.7rem] text-dark-text2 block mb-1">Semester</label>
              <CustomSelect
                value={semester}
                onChange={setSemester}
                placeholder="Select..."
                options={config.semesters.map(s => ({ value: s.id, label: s.label, icon: 'fa-graduation-cap' }))}
                size="md"
              />
            </div>
            <div>
              <label className="text-[0.7rem] text-dark-text2 block mb-1">Session</label>
              <input type="text" value={sessionVal} onChange={e => setSessionVal(e.target.value)} placeholder="e.g. Spring - 2026" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" />
            </div>
            <div>
              <label className="text-[0.7rem] text-dark-text2 block mb-1">Department</label>
              <CustomSelect
                value={department}
                onChange={setDepartment}
                placeholder="Select department..."
                options={FACULTIES.flatMap(f => f.departments.map(d => ({
                  value: d.id,
                  label: `${d.shortName} — ${d.name}`,
                  icon: d.icon || 'fa-building',
                  group: f.shortName,
                })))}
                searchable
                size="md"
              />
            </div>
            <div>
              <label className="text-[0.7rem] text-dark-text2 block mb-1">Exam Type</label>
              <CustomSelect
                value={examType}
                onChange={setExamType}
                placeholder="Select type..."
                options={EXAM_TYPES.map(t => ({ value: t, label: t, icon: t === 'Midterm' ? 'fa-file-alt' : t === 'Final' ? 'fa-graduation-cap' : t === 'Quiz' ? 'fa-question-circle' : t === 'Makeup' ? 'fa-redo' : 'fa-flask' }))}
                size="md"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left text-[0.72rem] font-semibold text-dark-text2 border-b border-dark-border w-16">#</th>
                  <th className="px-3 py-2 text-left text-[0.72rem] font-semibold text-dark-text2 border-b border-dark-border w-32">Date</th>
                  <th className="px-3 py-2 text-left text-[0.72rem] font-semibold text-dark-text2 border-b border-dark-border w-28">Day</th>
                  {enabledSlots.map(slot => (
                    <th key={slot.id} className="px-3 py-2 text-left text-[0.72rem] font-semibold text-dark-text2 border-b border-dark-border">
                      {slot.name}<br /><span className="text-[0.6rem] text-dark-text3 font-normal">{slot.startTime} – {slot.endTime}</span>
                    </th>
                  ))}
                  <th className="px-3 py-2 border-b border-dark-border w-10"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx} className="border-b border-dark-border">
                    <td className="px-3 py-2 text-[0.72rem] text-dark-text3">{idx + 1}</td>
                    <td className="px-3 py-2">
                      <input type="date" value={row.date} onChange={e => updateRow(idx, 'date', e.target.value)} className="w-full px-2 py-1.5 rounded border border-dark-border bg-dark-bg text-dark-text text-[0.78rem] outline-none focus:border-qsis" />
                    </td>
                    <td className="px-3 py-2">
                      <CustomSelect
                        value={row.day}
                        onChange={val => updateRow(idx, 'day', val)}
                        placeholder="Day"
                        options={DAYS.map(d => ({ value: d, label: d, icon: 'fa-calendar-day' }))}
                      />
                    </td>
                    {enabledSlots.map(slot => (
                      <td key={slot.id} className="px-2 py-1">
                        <div className="flex flex-col gap-1">
                          <input placeholder="Code" value={row.courses[slot.id]?.code || ''} onChange={e => updateRowCourse(idx, slot.id, 'code', e.target.value)} className="w-full px-2 py-1 rounded border border-dark-border bg-dark-bg text-dark-text text-[0.72rem] outline-none focus:border-qsis" />
                          <input placeholder="Title" value={row.courses[slot.id]?.title || ''} onChange={e => updateRowCourse(idx, slot.id, 'title', e.target.value)} className="w-full px-2 py-1 rounded border border-dark-border bg-dark-bg text-dark-text text-[0.72rem] outline-none focus:border-qsis" />
                          <input placeholder="Room (e.g. 301-A)" value={row.courses[slot.id]?.room || ''} onChange={e => updateRowCourse(idx, slot.id, 'room', e.target.value)} className="w-full px-2 py-1 rounded border border-dark-border bg-dark-bg text-dark-text text-[0.72rem] outline-none focus:border-qsis" />
                          <input placeholder="Teachers (comma separated)" value={row.courses[slot.id]?.teacher || ''} onChange={e => updateRowCourse(idx, slot.id, 'teacher', e.target.value)} className="w-full px-2 py-1 rounded border border-dark-border bg-dark-bg text-dark-text text-[0.72rem] outline-none focus:border-qsis" />
                          <input placeholder="Roll: Q233099-Q233115" value={row.courses[slot.id]?.rollRange || ''} onChange={e => updateRowCourse(idx, slot.id, 'rollRange' as any, e.target.value)} className="w-full px-2 py-1 rounded border border-dark-border bg-dark-bg text-dark-text text-[0.72rem] outline-none focus:border-qsis" />
                        </div>
                      </td>
                    ))}
                    <td className="px-2 py-2">
                      <button onClick={() => removeRow(idx)} disabled={rows.length <= 1} className="text-red-400 hover:text-red-300 disabled:opacity-30 bg-transparent border-none cursor-pointer text-[0.7rem]">
                        <i className="fas fa-trash"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-between mt-4">
            <button onClick={addRow} className="routine-btn"><i className="fas fa-plus mr-1"></i>Add Date</button>
            <div className="flex flex-wrap gap-2">
              <button onClick={saveDraft} className="routine-btn"><i className="fas fa-save mr-1"></i>Save Draft</button>
              {canPublish && (
                <button onClick={async () => {
                  const id = editingId || `exam-${Date.now()}`;
                  const routine: ExamRoutineItem = {
                    id, semester, session: sessionVal, department, examType, rows, slots: examSlots,
                    createdAt: Date.now(), published: true, isDraft: false,
                    publishedBy: { name: profile.name || email.split('@')[0], title: profile.title || undefined, email },
                    publishedAt: Date.now(),
                  };
                  try {
                    const res = await fetch('/api/published-exam-routines', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ routines: [routine] }),
                    });
                    const data = await res.json();
                    if (data.success) {
                      persistDrafts(examRoutines.filter(d => d.id !== id));
                      await loadPublishedFromDB();
                      showToast('Published!', 'success');
                      setViewMode('manager');
                    }
                  } catch {
                    showToast('Failed to publish', 'error');
                  }
                }} className="routine-btn routine-btn-primary"><i className="fas fa-globe mr-1"></i>Publish</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════ PREVIEW ═══════ */}
      {viewMode === 'preview' && (
        <ExamRoutinePrintView
          semester={semester} session={sessionVal} department={department} examType={examType}
          rows={rows} slots={enabledSlots}
          publishedBy={publishedRoutines.find(r => r.id === editingId)?.publishedBy}
        />
      )}

      {/* ═══════ ALL BRANCH EXAM ROUTINE ═══════ */}
      {viewMode === 'allBranch' && (
        <ExamAllSemesterView
          examSlots={examSlots}
          publishedRoutines={publishedRoutines}
          examRoutines={examRoutines}
          canPublish={canPublish}
          profile={profile}
          email={email}
          onPublish={async (items) => {
            const publisherName = profile.name || email.split('@')[0];
            const published = items.map(r => ({
              ...r, published: true, isDraft: false,
      publishedBy: { name: publisherName, title: profile.title || undefined, email },
              publishedAt: Date.now(),
            }));
            try {
              const res = await fetch('/api/published-exam-routines', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ routines: published, status: 'published' }),
              });
              const data = await res.json();
              if (data.success) {
                await loadPublishedFromDB();
                showToast(`${published.length} exam routines published!`, 'success');
              }
            } catch {
              showToast('Failed to publish', 'error');
            }
          }}
          onSaveToCloud={async (items) => {
            const publisherName = profile.name || email.split('@')[0];
            const saved = items.map(r => ({
              ...r, published: false, isDraft: false,
      publishedBy: { name: publisherName, title: profile.title || undefined, email },
              publishedAt: Date.now(),
            }));
            try {
              const res = await fetch('/api/published-exam-routines', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ routines: saved, status: 'saved' }),
              });
              const data = await res.json();
              if (data.success) {
                await loadPublishedFromDB();
                showToast(`${saved.length} exam routines saved to cloud!`, 'success');
              }
            } catch {
              showToast('Failed to save to cloud', 'error');
            }
          }}
          onSaveDraft={(items) => {
            const drafts = items.map(r => ({ ...r, isDraft: true, published: false, createdAt: Date.now() }));
            persistDrafts([...examRoutines, ...drafts]);
          }}
          canSaveToGithub={canSaveToGithub}
          onBack={() => setViewMode('manager')}
        />
      )}
    </section>
  );
}

function ExamRoutineCard({ routine, slots, onView, onEdit, onPublish, onUnpublish, onDelete, canManage, isPublished, currentUserEmail, isAdmin }: {
  routine: ExamRoutineItem;
  slots: ExamSlot[];
  onView: () => void;
  onEdit?: () => void;
  onPublish?: () => void;
  onUnpublish?: () => void;
  onDelete?: () => void;
  canManage: boolean;
  isPublished?: boolean;
  currentUserEmail?: string;
  isAdmin?: boolean;
}) {
  const deptInfo = findDepartment(routine.department);
  const isCreator = !!currentUserEmail && !!routine.publishedBy?.email && routine.publishedBy.email === currentUserEmail;
  const canDelete = isCreator || isAdmin || canManage;

  return (
    <div className={`bg-dark-bg2 border rounded-xl p-4 ${isPublished ? 'border-green-500/30' : 'border-dark-border'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-[0.9rem] font-bold text-dark-text">{routine.examType} Exam</h4>
              {isPublished && <span className="px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 text-[0.65rem] font-semibold"><i className="fas fa-globe mr-0.5"></i>Published</span>}
              {!isPublished && routine.status === 'saved' && <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 text-[0.65rem] font-semibold"><i className="fas fa-cloud mr-0.5"></i>Saved to Cloud</span>}
              {routine.isDraft && <span className="px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 text-[0.65rem] font-semibold">Draft</span>}
            </div>
            <p className="text-[0.75rem] text-dark-text2 mt-0.5">
              {routine.semester} &bull; {routine.session} &bull; {deptInfo?.department.shortName || routine.department}
            </p>
            {routine.publishedBy && (
              <p className="text-[0.68rem] text-dark-text3 mt-0.5">
                <i className="fas fa-user-check mr-1"></i>{isPublished ? 'Published by' : 'Saved by'} {routine.publishedBy.name}{routine.publishedBy.title ? ` (${routine.publishedBy.title})` : ''}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
          <button onClick={onView} className="routine-btn"><i className="fas fa-eye mr-1"></i>View</button>
          {onEdit && <button onClick={onEdit} className="routine-btn routine-btn-edit"><i className="fas fa-edit mr-1"></i>Edit</button>}
          {canManage && !isPublished && onPublish && <button onClick={onPublish} className="routine-btn routine-btn-primary"><i className="fas fa-globe mr-1"></i>Publish</button>}
          {canManage && isPublished && onUnpublish && <button onClick={onUnpublish} className="routine-btn text-yellow-400"><i className="fas fa-eye-slash mr-1"></i>Unpublish</button>}
          {canDelete && !isPublished && onDelete && <button onClick={onDelete} className="routine-btn text-red-400"><i className="fas fa-trash"></i></button>}
        </div>
      </div>
    </div>
  );
}

function ExamRoutinePrintView({ semester, session, department, examType, rows, slots, publishedBy }: {
  semester: string; session: string; department: string; examType: string;
  rows: ExamRow[]; slots: ExamSlot[];
  publishedBy?: { name: string; title?: string };
}) {
  const deptInfo = findDepartment(department);
  const semesterLabel = config.semesters.find(s => s.id === semester)?.label || semester;
  const [exportMode, setExportMode] = useState<'themed' | 'plain'>('themed');

  function handleExport() {
    import('dom-to-image-more').then(({ toPng }) => {
      const el = document.getElementById('exam-routine-export');
      if (!el) return;
      const origWidth = el.style.width;
      el.style.width = '920px';
      el.style.minWidth = '920px';
      toPng(el, { quality: 1, pixelRatio: 2 }).then(dataUrl => {
        el.style.width = origWidth;
        el.style.minWidth = '';
        const link = document.createElement('a');
        link.download = `exam-routine-${department}-${examType}${exportMode === 'plain' ? '-plain' : ''}.png`;
        link.href = dataUrl;
        link.click();
      });
    });
  }

  if (exportMode === 'plain') {
    return (
      <div>
        <div className="flex justify-end gap-2 mb-3">
          <button onClick={handleExport} className="routine-btn routine-btn-primary"><i className="fas fa-download mr-1"></i>Export Plain</button>
          <button onClick={() => setExportMode('themed')} className="routine-btn"><i className="fas fa-palette mr-1"></i>Switch to Themed</button>
        </div>
        <div id="exam-routine-export" className="bg-white rounded p-6 text-black" style={{ width: '100%', fontFamily: 'Times New Roman, serif' }}>
          <div className="text-center mb-4">
            <h2 className="text-[1rem] font-bold uppercase tracking-wide">International Islamic University Chittagong</h2>
            <h3 className="text-[0.85rem] font-semibold">{deptInfo?.department.name || department}</h3>
            <h4 className="text-[0.8rem] font-bold mt-2 uppercase">{examType} Examination Routine</h4>
            <p className="text-[0.72rem]">{semesterLabel} | {session}</p>
          </div>
          <div className="mb-3 flex flex-wrap gap-2 justify-center">
            {slots.map(slot => (
              <div key={slot.id} className="px-3 py-1 border border-black text-center">
                <div className="text-[0.72rem] font-bold">{slot.name}</div>
                <div className="text-[0.65rem]">Time: {slot.startTime} – {slot.endTime}</div>
              </div>
            ))}
          </div>
          <table className="w-full border-collapse border border-black text-[0.72rem]">
            <thead>
              <tr>
                <th className="border border-black px-2 py-1.5 text-left font-bold">Date</th>
                <th className="border border-black px-2 py-1.5 text-left font-bold">Day</th>
                {slots.map(slot => (
                  <th key={slot.id} className="border border-black px-2 py-1.5 text-left font-bold">
                    {slot.name}
                    <div className="text-[0.58rem] font-normal">{slot.startTime} – {slot.endTime}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx}>
                  <td className="border border-black px-2 py-1.5 font-medium">{row.date ? new Date(row.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
                  <td className="border border-black px-2 py-1.5 font-medium">{row.day || '—'}</td>
                  {slots.map(slot => {
                    const course = row.courses[slot.id];
                    return (
                      <td key={slot.id} className="border border-black px-2 py-1.5">
                        {course?.code && <div className="font-bold">{course.code}</div>}
                        {course?.title && <div className="text-[0.65rem]">{course.title}</div>}
                        {course?.teacher && <div className="text-[0.6rem]">Teacher: {course.teacher}</div>}
                        {course?.room && <div className="text-[0.62rem]">Room: {course.room}</div>}
                        {course?.rollRange && <div className="text-[0.6rem]">Roll: {course.rollRange}</div>}
                        {!course?.code && !course?.title && !course?.room && !course?.teacher && <span className="text-gray-400">—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {publishedBy && (
            <p className="text-[0.65rem] mt-3 text-right">Published by: {publishedBy.name}{publishedBy.title ? `, ${publishedBy.title}` : ''}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end gap-2 mb-3">
        <button onClick={handleExport} className="routine-btn routine-btn-primary"><i className="fas fa-download mr-1"></i>Export PNG</button>
        <button onClick={() => setExportMode('plain')} className="routine-btn"><i className="fas fa-file-alt mr-1"></i>Plain Academic Table</button>
      </div>
      <div id="exam-routine-export" className="bg-white rounded-xl p-6 text-gray-900" style={{ width: '100%' }}>
        <div className="text-center mb-4">
          <h2 className="text-[1.1rem] font-bold">International Islamic University Chittagong</h2>
          <h3 className="text-[0.9rem] font-semibold text-gray-700">{deptInfo?.department.name || department}</h3>
          <h4 className="text-[0.85rem] font-bold mt-2">{examType} Examination Routine</h4>
          <p className="text-[0.75rem] text-gray-600">{semesterLabel} &bull; {session}</p>
        </div>

        {/* Slot Headers */}
        <div className="mb-4 flex flex-wrap gap-3 justify-center">
          {slots.map(slot => (
            <div key={slot.id} className="px-4 py-2 bg-gray-100 rounded-lg border border-gray-300 text-center">
              <div className="text-[0.8rem] font-bold text-gray-800">{slot.name}</div>
              <div className="text-[0.72rem] text-gray-600">Time: {slot.startTime} – {slot.endTime}</div>
            </div>
          ))}
        </div>

        <table className="w-full border-collapse border border-gray-300 text-[0.78rem]">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-3 py-2 text-left font-bold w-20">Date</th>
              <th className="border border-gray-300 px-3 py-2 text-left font-bold w-24">Day</th>
              {slots.map(slot => (
                <th key={slot.id} className="border border-gray-300 px-3 py-2 text-left font-bold">
                  {slot.name}
                  <div className="text-[0.62rem] font-normal text-gray-500">{slot.startTime} – {slot.endTime}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="border border-gray-300 px-3 py-2 font-medium">{row.date ? new Date(row.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
                <td className="border border-gray-300 px-3 py-2 font-medium">{row.day || '—'}</td>
                {slots.map(slot => {
                  const course = row.courses[slot.id];
                  return (
                    <td key={slot.id} className="border border-gray-300 px-3 py-2">
                      {course?.code && <div className="font-bold">{course.code}</div>}
                      {course?.title && <div className="text-[0.7rem] text-gray-600">{course.title}</div>}
                      {course?.teacher && <div className="text-[0.65rem] text-gray-500"><i className="fas fa-chalkboard-teacher mr-1"></i>{course.teacher}</div>}
                      {course?.room && <div className="text-[0.68rem] text-gray-500"><i className="fas fa-door-open mr-1"></i>Room {course.room}</div>}
                      {course?.rollRange && <div className="text-[0.65rem] text-gray-400"><i className="fas fa-users mr-1"></i>{formatRollCount(course.rollRange)}</div>}
                      {!course?.code && !course?.title && !course?.room && !course?.teacher && <span className="text-gray-300">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {publishedBy && (
          <p className="text-[0.7rem] text-gray-500 mt-3 text-right">Published by: {publishedBy.name}{publishedBy.title ? `, ${publishedBy.title}` : ''}</p>
        )}
      </div>
    </div>
  );
}

type ExamAllStep = 'setup' | 'courses' | 'assign';

interface ExamAllSemesterSem {
  name: string;
  enabled: boolean;
  courses: ExamCourse[];
}


function ExamAllSemesterView({ examSlots, publishedRoutines, examRoutines, canPublish, profile, email, onPublish, onSaveToCloud, onSaveDraft, canSaveToGithub, onBack }: {
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
  onBack: () => void;
}) {
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

  const steps: { key: ExamAllStep; label: string; icon: string; num: number }[] = [
    { key: 'setup', label: 'Setup', icon: 'cog', num: 1 },
    { key: 'courses', label: 'Courses', icon: 'book', num: 2 },
    { key: 'assign', label: 'Assign & Publish', icon: 'table', num: 3 },
  ];
  const currentStepIdx = steps.findIndex(s => s.key === step);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
        <div>
          <h3 className="text-[1.1rem] font-bold text-dark-text"><i className="fas fa-layer-group text-qsis mr-2"></i>All Semester Exam Routine</h3>
          <p className="text-[0.75rem] text-dark-text2 mt-0.5">3 simple steps — setup, courses, assign & publish</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canPublish && (
            <div className="relative">
              <button onClick={(e) => { e.stopPropagation(); setShowPublishMenu(!showPublishMenu); }} className="routine-btn routine-btn-primary"><i className="fas fa-share-alt mr-1"></i>Publish All ({totalSections} semesters) <i className="fas fa-caret-down ml-1"></i></button>
              {showPublishMenu && (
                <div className="absolute right-0 top-full mt-1 bg-dark-bg2 border border-dark-border rounded-lg shadow-xl z-50 py-1 min-w-[220px]">
                  <button onClick={(e) => { e.stopPropagation(); handleSaveDraftAll(); }} className="w-full text-left px-3 py-2 text-[0.8rem] text-dark-text hover:bg-dark-bg3 flex items-center gap-2">
                    <i className="fas fa-file-alt text-yellow-400"></i>Save as Draft
                    <span className="text-[0.65rem] text-dark-text3 ml-auto">Local only</span>
                  </button>
                  <div className="border-t border-dark-border my-0.5"></div>
                  <button onClick={(e) => { e.stopPropagation(); handleSaveToCloudAll(); }} className="w-full text-left px-3 py-2 text-[0.8rem] text-dark-text hover:bg-dark-bg3 flex items-center gap-2">
                    <i className="fas fa-cloud text-blue-400"></i>Save to Cloud
                    <span className="text-[0.65rem] text-dark-text3 ml-auto">Private</span>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handlePublishAll(); }} className="w-full text-left px-3 py-2 text-[0.8rem] text-dark-text hover:bg-dark-bg3 flex items-center gap-2">
                    <i className="fas fa-globe text-green-400"></i>Publish
                    <span className="text-[0.65rem] text-dark-text3 ml-auto">Public</span>
                  </button>
                </div>
              )}
            </div>
          )}
          <button onClick={onBack} className="routine-btn"><i className="fas fa-arrow-left mr-1"></i>Back</button>
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

      {step === 'setup' && (
        <div className="bg-dark-bg2 border border-dark-border rounded-xl p-5 mt-4">
          <h4 className="text-[0.9rem] font-bold text-dark-text mb-3"><i className="fas fa-cog text-qsis mr-2"></i>Exam Setup</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div>
              <label className="text-[0.72rem] text-dark-text2 mb-1 block">Session</label>
              <input value={sessionVal} onChange={e => setSessionVal(e.target.value)} placeholder="e.g. Spring - 2026" className="w-full px-2 py-1.5 rounded border border-dark-border bg-dark-bg text-dark-text text-[0.78rem] outline-none focus:border-qsis" />
            </div>
            <div>
              <label className="text-[0.72rem] text-dark-text2 mb-1 block">Department</label>
              <CustomSelect value={department} onChange={setDepartment} options={FACULTIES.flatMap(f => f.departments.map(d => ({ value: d.id, label: `${d.shortName} — ${d.name}`, icon: 'fa-building', group: f.shortName })))} placeholder="Department" />
            </div>
            <div>
              <label className="text-[0.72rem] text-dark-text2 mb-1 block">Exam Type</label>
              <CustomSelect value={examType} onChange={setExamType} options={EXAM_TYPES.map(t => ({ value: t, label: t, icon: 'fa-graduation-cap' }))} placeholder="Type" />
            </div>
            <div>
              <label className="text-[0.72rem] text-dark-text2 mb-1 block">Gender</label>
              <CustomSelect value={draftGender} onChange={v => setDraftGender(v as any)} options={[{ value: 'both', label: 'Both', icon: 'fa-venus-mars' }, { value: 'male', label: 'Male', icon: 'fa-mars' }, { value: 'female', label: 'Female', icon: 'fa-venus' }]} placeholder="Gender" />
            </div>
          </div>

          <h5 className="text-[0.82rem] font-semibold text-dark-text mb-2"><i className="fas fa-calendar-alt text-qsis mr-1"></i>Exam Dates</h5>
          <div className="bg-dark-bg border border-dark-border rounded-lg p-3 mb-4">
            <div className="overflow-x-auto">
              <table className="w-full">
              <thead>
                <tr>
                  <th className="px-2 py-1.5 text-left text-[0.7rem] font-semibold text-dark-text2 border-b border-dark-border w-10">#</th>
                  <th className="px-2 py-1.5 text-left text-[0.7rem] font-semibold text-dark-text2 border-b border-dark-border">Date</th>
                  <th className="px-2 py-1.5 text-left text-[0.7rem] font-semibold text-dark-text2 border-b border-dark-border w-32">Day</th>
                  <th className="px-2 py-1.5 border-b border-dark-border w-8"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx} className="border-b border-dark-border">
                    <td className="px-2 py-1.5 text-[0.7rem] text-dark-text3">{idx + 1}</td>
                    <td className="px-2 py-1.5">
                      <input type="date" value={row.date} onChange={e => updateRow(idx, 'date', e.target.value)} className="w-full px-2 py-1 rounded border border-dark-border bg-dark-bg text-dark-text text-[0.75rem] outline-none focus:border-qsis" />
                    </td>
                    <td className="px-2 py-1.5">
                      <CustomSelect value={row.day} onChange={val => updateRow(idx, 'day', val)} placeholder="Day" options={DAYS.map(d => ({ value: d, label: d, icon: 'fa-calendar-day' }))} />
                    </td>
                    <td className="px-2 py-1.5">
                      <button onClick={() => removeRow(idx)} disabled={rows.length <= 1} className="text-red-400 hover:text-red-300 disabled:opacity-30 bg-transparent border-none cursor-pointer text-[0.68rem]"><i className="fas fa-trash"></i></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <button onClick={addRow} className="routine-btn mt-2"><i className="fas fa-plus mr-1"></i>Add Date</button>
          </div>

          <h5 className="text-[0.82rem] font-semibold text-dark-text mb-2"><i className="fas fa-graduation-cap text-qsis mr-1"></i>Semesters</h5>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 mb-4">
            {config.semesters.map((cfgSem) => {
              const sem = semesters.find(s => s.name === cfgSem.id);
              if (!sem) return null;
              const semIdx = semesters.indexOf(sem);
              return (
                <button key={cfgSem.id} onClick={() => toggleSemester(semIdx)} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all ${sem.enabled ? 'bg-qsis/10 border-qsis text-dark-text' : 'bg-dark-bg border-dark-border text-dark-text3 opacity-60'}`}>
                  <span className={`w-4 h-4 rounded border flex items-center justify-center text-[0.6rem] ${sem.enabled ? 'bg-qsis border-qsis text-white' : 'border-dark-border'}`}>{sem.enabled && <i className="fas fa-check"></i>}</span>
                  <span className="text-[0.78rem] font-semibold">{cfgSem.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex justify-end">
            <button onClick={() => setStep('courses')} className="routine-btn routine-btn-primary"><i className="fas fa-arrow-right mr-1"></i>Next: Courses</button>
          </div>
        </div>
      )}

      {step === 'courses' && (
        <div className="bg-dark-bg2 border border-dark-border rounded-xl p-5 mt-4">
          <h4 className="text-[0.9rem] font-bold text-dark-text mb-1"><i className="fas fa-book text-qsis mr-2"></i>Courses</h4>
          <p className="text-[0.72rem] text-dark-text3 mb-3">Courses auto-load from DB &amp; GitHub. Add or edit courses per semester.</p>
          <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
            {enabledSemesters.map((sem, idx) => (
              <button key={sem.name} onClick={() => setActiveSemTab(idx)} className={`px-3 py-1.5 rounded-lg text-[0.72rem] font-semibold whitespace-nowrap border transition-colors ${activeSemTab === idx ? 'bg-qsis text-white border-qsis' : 'bg-dark-bg border-dark-border text-dark-text2 hover:border-qsis/50'}`}>
                {semLabels[sem.name] || sem.name}
                <span className="ml-1 opacity-70">({sem.courses.length})</span>
              </button>
            ))}
          </div>
          {enabledSemesters.map((sem, idx) => idx !== activeSemTab ? null : (
            <div key={sem.name}>
              <div className="space-y-1.5 mb-3">
                {sem.courses.length === 0 && <p className="text-[0.72rem] text-dark-text3 p-3 rounded bg-dark-bg border border-dark-border"><i className="fas fa-spinner fa-spin mr-1"></i>Loading courses...</p>}
                {sem.courses.map((c, cIdx) => {
                  const suggestKey = `${sem.name}:${cIdx}`;
                  const isActive = courseSuggestionsIdx === suggestKey;
                  const hasExactMatch = isActive && c.code.trim() && allCourses.some(ac => ac.code.toUpperCase() === c.code.trim().toUpperCase());
                  return (
                    <div key={cIdx} className={`flex items-center gap-2 p-2 rounded-lg border ${c.fromGithub ? 'bg-dark-bg border-dark-border' : 'bg-yellow-500/5 border-yellow-500/30'}`} ref={isActive ? courseInputRef : undefined}>
                      <div className="relative">
                        <input value={c.code} placeholder="Code (e.g. QSM-3602)" className="w-32 px-2 py-1 rounded border border-dark-border bg-dark-bg2 text-dark-text text-[0.75rem] outline-none focus:border-qsis"
                          onFocus={() => { setCourseSuggestionsIdx(suggestKey); setCourseSearch(c.code); }}
                          onChange={e => { updateSemCourse(sem.name, cIdx, 'code', e.target.value); setCourseSearch(e.target.value); setCourseSuggestionsIdx(suggestKey); }} />
                        {isActive && courseSearch.trim() && filteredCourseSuggestions.length > 0 && (
                          <div className="absolute z-50 top-full left-0 mt-1 w-64 bg-dark-bg2 border border-dark-border rounded-lg shadow-xl max-h-48 overflow-y-auto">
                            {filteredCourseSuggestions.map((sc, si) => (
                              <button key={si} className="w-full text-left px-3 py-1.5 text-[0.72rem] hover:bg-qsis/10 text-dark-text flex justify-between items-center border-none bg-transparent cursor-pointer" onClick={() => { updateSemCourse(sem.name, cIdx, 'code', sc.code); updateSemCourse(sem.name, cIdx, 'title', sc.title); setCourseSuggestionsIdx(null); setCourseSearch(''); }}>
                                <span className="font-mono font-semibold">{sc.code}</span>
                                <span className="text-dark-text3 truncate ml-2">{sc.title}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <input value={c.title} onChange={e => updateSemCourse(sem.name, cIdx, 'title', e.target.value)} placeholder="Title" className="flex-1 px-2 py-1 rounded border border-dark-border bg-dark-bg2 text-dark-text text-[0.75rem] outline-none focus:border-qsis" />
                      {!c.fromGithub && c.code.trim() && !hasExactMatch && c.title.trim() && canSaveToGithub && (
                        <button onClick={() => saveCourseToGitHub(sem.name, c.code, c.title).then(() => { setSemesters(prev => prev.map(s => s.name !== sem.name ? s : { ...s, courses: s.courses.map((cc, j) => j === cIdx ? { ...cc, fromGithub: true } : cc) })); showToast('Saved to GitHub', 'success'); })} className="text-green-400 hover:text-green-300 bg-transparent border-none cursor-pointer text-[0.68rem] whitespace-nowrap" title="Save to GitHub"><i className="fab fa-github mr-0.5"></i>Save</button>
                      )}
                      {c.fromGithub ? <i className="fas fa-check-circle text-green-400 text-[0.68rem]"></i> : <i className="fas fa-cloud-upload-alt text-yellow-400 text-[0.68rem]"></i>}
                      <button onClick={() => removeSemCourse(sem.name, cIdx)} className="text-red-400 hover:text-red-300 bg-transparent border-none cursor-pointer text-[0.68rem]"><i className="fas fa-trash"></i></button>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2 mb-2">
                <button onClick={() => addSemCourse(sem.name)} className="routine-btn"><i className="fas fa-plus mr-1"></i>Add Course</button>
                {canSaveToGithub && sem.courses.some(c => c.code && c.title && !c.fromGithub) && (
                  <button onClick={() => { sem.courses.filter(c => c.code && c.title && !c.fromGithub).forEach(c => saveCourseToGitHub(sem.name, c.code, c.title)); setSemesters(prev => prev.map(s => s.name !== sem.name ? s : { ...s, courses: s.courses.map(c => (c.code && c.title && !c.fromGithub) ? { ...c, fromGithub: true } : c) })); showToast('Courses saved to GitHub', 'success'); }} className="routine-btn routine-btn-accent"><i className="fab fa-github mr-1"></i>Save to GitHub</button>
                )}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 justify-between mt-4">
            <button onClick={() => setStep('setup')} className="routine-btn"><i className="fas fa-arrow-left mr-1"></i>Back</button>
            <button onClick={() => setStep('assign')} className="routine-btn routine-btn-primary"><i className="fas fa-arrow-right mr-1"></i>Next: Assign & Publish</button>
          </div>
        </div>
      )}

      {step === 'assign' && (
        <div className="bg-dark-bg2 border border-dark-border rounded-xl p-5 mt-4">
          <h4 className="text-[0.9rem] font-bold text-dark-text mb-1"><i className="fas fa-table text-qsis mr-2"></i>Assign Semesters to Schedule</h4>
          <p className="text-[0.72rem] text-dark-text3 mb-3">For each date and time slot, select which semester has its exam. Courses auto-fill from Step 2.</p>

          {rows.map((row, rowIdx) => (
            <div key={rowIdx} className="mb-5 p-4 rounded-xl bg-dark-bg border border-dark-border">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-dark-border">
                <div className="flex items-center gap-3">
                  <i className="fas fa-calendar-day text-qsis"></i>
                  <span className="text-[0.9rem] font-bold text-dark-text">{row.date ? new Date(row.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : 'No date'}</span>
                  <span className="text-[0.72rem] text-dark-text3">{row.day}</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${enabledSlots.length}, 1fr)` }}>
                {enabledSlots.map(slot => {
                  const assignedSem = row.semesterSlots?.[slot.id] || '';
                  const semData = enabledSemesters.find(s => s.name === assignedSem);
                  return (
                    <div key={slot.id} className="rounded-lg border border-dark-border bg-dark-bg2 p-3">
                      <div className="text-[0.7rem] font-semibold text-dark-text2 mb-2 flex items-center gap-1">
                        <i className="fas fa-clock text-qsis"></i> {slot.name}
                      </div>
                      <div className="text-[0.62rem] text-dark-text3 mb-2">({slot.startTime} – {slot.endTime})</div>
                      <select value={assignedSem} onChange={e => {
                        const semName = e.target.value;
                        setRows(prev => prev.map((r, i) => {
                          if (i !== rowIdx) return r;
                          const newSemSlots = { ...r.semesterSlots, [slot.id]: semName };
                          const newCourses = { ...r.courses };
                          const cellKey = `${r.date}:${slot.id}`;
                          if (semName) {
                            const sem = enabledSemesters.find(s => s.name === semName);
                            if (sem && sem.courses.length > 0) {
                              newCourses[cellKey] = { code: sem.courses[0].code, title: sem.courses[0].title };
                            }
                          } else {
                            newCourses[cellKey] = { code: '', title: '' };
                          }
                          return { ...r, semesterSlots: newSemSlots, courses: newCourses };
                        }));
                      }} className="w-full px-2 py-1.5 rounded border border-dark-border bg-dark-bg text-dark-text text-[0.75rem] outline-none focus:border-qsis mb-2">
                        <option value="">— Free —</option>
                        {enabledSemesters.map(sem => (
                          <option key={sem.name} value={sem.name}>{semLabels[sem.name] || sem.name} ({sem.courses.length} courses)</option>
                        ))}
                      </select>
                      {semData && semData.courses.length > 0 && (
                        <div className="space-y-0.5">
                          {semData.courses.map(c => (
                            <div key={c.code} className="text-[0.65rem] text-dark-text2 flex items-center gap-1">
                              <i className="fas fa-book text-qsis text-[0.55rem]"></i>
                              <span className="font-semibold">{c.code}</span>
                              <span className="text-dark-text3 truncate">{c.title}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              </div>
            </div>
          ))}

          <div className="flex flex-wrap gap-2 justify-between mt-4">
            <button onClick={() => setStep('courses')} className="routine-btn"><i className="fas fa-arrow-left mr-1"></i>Back</button>
            <div className="relative">
              <button onClick={(e) => { e.stopPropagation(); setShowPublishMenu(!showPublishMenu); }} className="routine-btn routine-btn-primary">
                <i className="fas fa-share-alt mr-1"></i>Publish ({totalSections} semesters) <i className="fas fa-caret-down ml-1"></i>
              </button>
              {showPublishMenu && (
                <div className="absolute right-0 bottom-full mb-1 bg-dark-bg2 border border-dark-border rounded-lg shadow-xl z-50 py-1 min-w-[220px]">
                  <button onClick={(e) => { e.stopPropagation(); handleSaveDraftAll(); }} className="w-full text-left px-3 py-2 text-[0.8rem] text-dark-text hover:bg-dark-bg3 flex items-center gap-2">
                    <i className="fas fa-file-alt text-yellow-400"></i>Save as Draft
                    <span className="text-[0.65rem] text-dark-text3 ml-auto">Local only</span>
                  </button>
                  <div className="border-t border-dark-border my-0.5"></div>
                  <button onClick={(e) => { e.stopPropagation(); handleSaveToCloudAll(); }} className="w-full text-left px-3 py-2 text-[0.8rem] text-dark-text hover:bg-dark-bg3 flex items-center gap-2">
                    <i className="fas fa-cloud text-blue-400"></i>Save to Cloud
                    <span className="text-[0.65rem] text-dark-text3 ml-auto">Private</span>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handlePublishAll(); }} className="w-full text-left px-3 py-2 text-[0.8rem] text-dark-text hover:bg-dark-bg3 flex items-center gap-2">
                    <i className="fas fa-globe text-green-400"></i>Publish
                    <span className="text-[0.65rem] text-dark-text3 ml-auto">Public</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {confirmDialog}
    </>
  );
}

