'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useAppStore } from '@/lib/store';
import { config } from '@/lib/config';
import { showToast } from '@/lib/utils';
import { ExamSlot, loadExamSlots, saveExamSlots, getEnabledSlots } from '@/lib/exam-routine-config';
import CustomSelect from '@/components/CustomSelect';
import MultiTeacherAutocomplete from '@/components/MultiTeacherAutocomplete';
import { FACULTIES, findDepartment } from '@/lib/departments';
import {
  ExamRoutineItem,
  ExamRow,
  ExamCourse,
  getDefaultRow,
  LS_EXAM_DRAFTS,
  LS_EXAM_ALL_DRAFTS,
  DAYS,
  EXAM_TYPES,
} from '@/components/exam/types';
import { ExamRoutineCard, ExamRoutinePrintView, ExamAllSemesterView } from '@/components/exam';
import SchedulePublishModal from '@/components/SchedulePublishModal';

export default function ExamRoutineView() {
  const { data: session } = useSession();
  const profile = useAppStore(s => s.profile);

  const [viewMode, setViewMode] = useState<'manager' | 'builder' | 'preview' | 'slots' | 'allBranch'>('manager');
  const [examSlots, setExamSlots] = useState<ExamSlot[]>([]);
  const [examRoutines, setExamRoutines] = useState<ExamRoutineItem[]>([]);
  const [publishedRoutines, setPublishedRoutines] = useState<ExamRoutineItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<ExamRoutineItem | null>(null);

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
  const [allSemDrafts, setAllSemDrafts] = useState<any[]>([]);
  const [allSemEditId, setAllSemEditId] = useState<string | null>(null);
  const [allSemDraftData, setAllSemDraftData] = useState<any>(null);

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

  const loadAllSemDrafts = useCallback(() => {
    try {
      const drafts = JSON.parse(localStorage.getItem(LS_EXAM_ALL_DRAFTS) || '[]');
      setAllSemDrafts(drafts);
    } catch {}
  }, []);

  const persistAllSemDrafts = useCallback((drafts: any[]) => {
    setAllSemDrafts(drafts);
    localStorage.setItem(LS_EXAM_ALL_DRAFTS, JSON.stringify(drafts));
  }, []);

  useEffect(() => { loadAllSemDrafts(); }, [loadAllSemDrafts]);

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

  async function doPublishRoutine(r: ExamRoutineItem, scheduledAt?: string) {
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
        body: JSON.stringify({ routines: [published], scheduledAt }),
      });
      const data = await res.json();
      if (data.success) {
        persistDrafts(examRoutines.filter(d => d.id !== r.id));
        await loadPublishedFromDB();
        if (scheduledAt) {
          showToast(`Exam routine scheduled! Will auto-publish on ${new Date(scheduledAt).toLocaleString()}.`, 'success');
        } else {
          showToast('Exam routine published!', 'success');
        }
      } else {
        showToast(data.error || 'Failed to publish', 'error');
      }
    } catch {
      showToast('Failed to publish', 'error');
    }
  }

  function publishRoutine(r: ExamRoutineItem) {
    setScheduleTarget(r);
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
          {publishedRoutines.length === 0 && examRoutines.length === 0 && allSemDrafts.length === 0 && (
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
          {allSemDrafts.map(d => (
            <div key={d.id} className="bg-dark-bg2 border border-yellow-500/20 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-[0.9rem] font-bold text-dark-text">{d.examType || 'Exam'} Routine</h4>
                    <span className="text-[0.65rem] px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/20"><i className="fas fa-file-alt mr-0.5"></i>Draft</span>
                    <span className="text-[0.65rem] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/20"><i className="fas fa-layer-group mr-0.5"></i>All Semester</span>
                  </div>
                  <p className="text-[0.75rem] text-dark-text2 mt-0.5">{d.session} &bull; {d.department?.toUpperCase()} &bull; {(d.semesters || []).filter((s: any) => s.enabled).length} semesters</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => {
                    setAllSemEditId(d.id);
                    setAllSemDraftData(d);
                    setViewMode('allBranch');
                  }} className="routine-btn text-[0.72rem]"><i className="fas fa-edit mr-1"></i>Edit</button>
                  <button onClick={() => {
                    const updated = allSemDrafts.filter((x: any) => x.id !== d.id);
                    persistAllSemDrafts(updated);
                    showToast('Deleted', 'success');
                  }} className="routine-btn text-[0.72rem] text-red-400 hover:text-red-300"><i className="fas fa-trash mr-1"></i>Delete</button>
                </div>
              </div>
            </div>
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
                          <MultiTeacherAutocomplete value={row.courses[slot.id]?.teacher || ''} onChange={val => updateRowCourse(idx, slot.id, 'teacher', val)} department={department} placeholder="Teachers (comma separated)" />
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
          onAutoSaveDraft={(draft: any) => {
            const updated = allSemDrafts.filter((d: any) => d.id !== draft.id);
            updated.push(draft);
            persistAllSemDrafts(updated);
          }}
          editDraftId={allSemEditId}
          editDraftData={allSemDraftData}
          onClearEditDraft={() => { setAllSemEditId(null); setAllSemDraftData(null); }}
          onBack={() => { setViewMode('manager'); setAllSemEditId(null); setAllSemDraftData(null); }}
        />
      )}
      {scheduleTarget && (
        <SchedulePublishModal
          title={`Publish "${scheduleTarget.semester} — ${scheduleTarget.examType || 'Exam'}"`}
          description="Choose to publish immediately or schedule for later."
          onPublishNow={() => { const t = scheduleTarget; setScheduleTarget(null); doPublishRoutine(t); }}
          onSchedule={(scheduledAt) => { const t = scheduleTarget; setScheduleTarget(null); doPublishRoutine(t, scheduledAt); }}
          onClose={() => setScheduleTarget(null)}
        />
      )}
    </section>
  );
}
