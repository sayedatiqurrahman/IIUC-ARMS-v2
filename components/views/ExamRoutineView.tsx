'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useAppStore } from '@/lib/store';
import { config } from '@/lib/config';
import { showToast } from '@/lib/utils';
import { ExamSlot, DEFAULT_EXAM_SLOTS, loadExamSlots, saveExamSlots, getEnabledSlots } from '@/lib/exam-routine-config';
import TeacherAutocomplete from '@/components/TeacherAutocomplete';
import CustomSelect from '@/components/CustomSelect';
import { FACULTIES, findDepartment } from '@/lib/departments';

function getDefaultSession(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  return month < 6 ? `Spring - ${year}` : `Autumn - ${year}`;
}

interface ExamCourse {
  code: string;
  title: string;
  teacher: string;
}

interface ExamRow {
  date: string;
  day: string;
  courses: Record<string, ExamCourse>;
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
  publishedBy?: { name: string; title?: string };
  publishedAt?: number;
}

const LS_EXAM_DRAFTS = 'qsis-exam-draft-routines';
const LS_EXAM_PUBLISHED = 'qsis-exam-published-routines';
const DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const EXAM_TYPES = ['Midterm', 'Final', 'Quiz', 'Makeup', 'Practical'];

function getDefaultRow(slots: ExamSlot[]): ExamRow {
  const courses: Record<string, ExamCourse> = {};
  slots.filter(s => s.enabled).forEach(s => { courses[s.id] = { code: '', title: '', teacher: '' }; });
  return { date: '', day: '', courses };
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

  useEffect(() => {
    fetch('/api/settings/permissions')
      .then(r => r.json())
      .then(data => {
        if (!data.success) return;
        const perms = data.permissions || {};
        const role = config.getEffectiveRole(email, profile.role);
        const roleKey = profile.isCR ? 'cr' : role;
        const allowed = perms.publishRoutine || ['admin', 'manager', 'teacher', 'cr'];
        setCanPublish(isOwner || allowed.includes(roleKey));
      })
      .catch(() => {});
  }, [email, profile.role, profile.isCR, isOwner]);

  useEffect(() => {
    setExamSlots(loadExamSlots());
    try {
      const drafts = JSON.parse(localStorage.getItem(LS_EXAM_DRAFTS) || '[]');
      const published = JSON.parse(localStorage.getItem(LS_EXAM_PUBLISHED) || '[]');
      setExamRoutines(drafts);
      setPublishedRoutines(published);
    } catch {}
  }, []);

  const persistDrafts = useCallback((r: ExamRoutineItem[]) => {
    setExamRoutines(r);
    localStorage.setItem(LS_EXAM_DRAFTS, JSON.stringify(r));
  }, []);

  const persistPublished = useCallback((r: ExamRoutineItem[]) => {
    setPublishedRoutines(r);
    localStorage.setItem(LS_EXAM_PUBLISHED, JSON.stringify(r));
  }, []);

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

  function saveDraft() {
    const id = editingId || `exam-${Date.now()}`;
    const routine: ExamRoutineItem = {
      id, semester, session: sessionVal, department, examType, rows, slots: examSlots,
      createdAt: Date.now(), published: false, isDraft: true,
    };
    const updated = examRoutines.filter(r => r.id !== id);
    updated.push(routine);
    persistDrafts(updated);
    showToast('Exam routine saved as draft', 'success');
    setViewMode('manager');
  }

  function publishRoutine(r: ExamRoutineItem) {
    const publisherName = profile.name || email.split('@')[0];
    const published: ExamRoutineItem = {
      ...r, published: true, isDraft: false,
      publishedBy: { name: publisherName, title: profile.title || undefined },
      publishedAt: Date.now(),
    };
    const updated = publishedRoutines.filter(p => !(p.semester === r.semester && p.department === r.department && p.examType === r.examType));
    updated.push(published);
    persistPublished(updated);
    persistDrafts(examRoutines.filter(d => d.id !== r.id));
    showToast('Exam routine published!', 'success');
  }

  function unpublishRoutine(id: string) {
    persistPublished(publishedRoutines.filter(r => r.id !== id));
    showToast('Exam routine unpublished', 'success');
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
          <p className="text-[0.78rem] text-dark-text2 mt-0.5">
            {deptInfo ? `${deptInfo.department.shortName} — ${deptInfo.faculty.shortName}` : 'Create and manage exam routines'}
          </p>
        </div>
        {viewMode === 'manager' && (
          <div className="flex gap-2">
            {canPublish && (
              <button onClick={() => setViewMode('slots')} className="routine-btn">
                <i className="fas fa-cog mr-1"></i>Exam Slots
              </button>
            )}
            {canPublish && (
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
          {publishedRoutines.map(r => (
            <ExamRoutineCard key={r.id} routine={r} slots={r.slots || examSlots} onView={() => { setEditingId(r.id); setRows(r.rows); setExamSlots(r.slots || examSlots); setSemester(r.semester); setSessionVal(r.session); setDepartment(r.department); setExamType(r.examType); setViewMode('preview'); }} onUnpublish={() => unpublishRoutine(r.id)} canManage={canPublish} isPublished />
          ))}
          {examRoutines.map(r => (
            <ExamRoutineCard key={r.id} routine={r} slots={r.slots || examSlots} onView={() => editRoutine(r)} onPublish={() => publishRoutine(r)} onDelete={() => deleteRoutine(r.id)} canManage={canPublish} />
          ))}
        </div>
      )}

      {/* ═══════ BUILDER ═══════ */}
      {viewMode === 'builder' && (
        <div className="bg-dark-bg2 border border-dark-border rounded-xl p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
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
                          <TeacherAutocomplete value={row.courses[slot.id]?.teacher || ''} onChange={val => updateRowCourse(idx, slot.id, 'teacher', val)} placeholder="Teacher" />
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

          <div className="flex items-center justify-between mt-4">
            <button onClick={addRow} className="routine-btn"><i className="fas fa-plus mr-1"></i>Add Date</button>
            <div className="flex gap-2">
              <button onClick={saveDraft} className="routine-btn"><i className="fas fa-save mr-1"></i>Save Draft</button>
              {canPublish && (
                <button onClick={() => {
                  const id = editingId || `exam-${Date.now()}`;
                  const routine: ExamRoutineItem = {
                    id, semester, session: sessionVal, department, examType, rows, slots: examSlots,
                    createdAt: Date.now(), published: true, isDraft: false,
                    publishedBy: { name: profile.name || email.split('@')[0], title: profile.title || undefined },
                    publishedAt: Date.now(),
                  };
                  const updated = publishedRoutines.filter(p => !(p.semester === routine.semester && p.department === routine.department && p.examType === routine.examType));
                  updated.push(routine);
                  persistPublished(updated);
                  persistDrafts(examRoutines.filter(d => d.id !== id));
                  showToast('Published!', 'success');
                  setViewMode('manager');
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
          onPublish={(items) => {
            const publisherName = profile.name || email.split('@')[0];
            const published = items.map(r => ({
              ...r, published: true, isDraft: false,
              publishedBy: { name: publisherName, title: profile.title || undefined },
              publishedAt: Date.now(),
            }));
            let updated = [...publishedRoutines];
            for (const pub of published) {
              updated = updated.filter(p => !(p.semester === pub.semester && p.department === pub.department && p.examType === pub.examType));
              updated.push(pub);
            }
            persistPublished(updated);
            showToast(`${published.length} exam routines published!`, 'success');
          }}
          onBack={() => setViewMode('manager')}
        />
      )}
    </section>
  );
}

function ExamRoutineCard({ routine, slots, onView, onPublish, onUnpublish, onDelete, canManage, isPublished }: {
  routine: ExamRoutineItem;
  slots: ExamSlot[];
  onView: () => void;
  onPublish?: () => void;
  onUnpublish?: () => void;
  onDelete?: () => void;
  canManage: boolean;
  isPublished?: boolean;
}) {
  const deptInfo = findDepartment(routine.department);
  return (
    <div className={`bg-dark-bg2 border rounded-xl p-4 ${isPublished ? 'border-green-500/30' : 'border-dark-border'}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-[0.9rem] font-bold text-dark-text">{routine.examType} Exam</h4>
            {isPublished && <span className="px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 text-[0.65rem] font-semibold"><i className="fas fa-globe mr-0.5"></i>Published</span>}
            {routine.isDraft && <span className="px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 text-[0.65rem] font-semibold">Draft</span>}
          </div>
          <p className="text-[0.75rem] text-dark-text2 mt-0.5">
            {routine.semester} &bull; {routine.session} &bull; {deptInfo?.department.shortName || routine.department}
          </p>
          {routine.publishedBy && (
            <p className="text-[0.68rem] text-dark-text3 mt-0.5">
              <i className="fas fa-user-check mr-1"></i>Published by {routine.publishedBy.name}{routine.publishedBy.title ? ` (${routine.publishedBy.title})` : ''}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={onView} className="routine-btn"><i className="fas fa-eye mr-1"></i>View</button>
          {canManage && !isPublished && onPublish && <button onClick={onPublish} className="routine-btn routine-btn-primary"><i className="fas fa-globe mr-1"></i>Publish</button>}
          {canManage && isPublished && onUnpublish && <button onClick={onUnpublish} className="routine-btn text-yellow-400"><i className="fas fa-eye-slash mr-1"></i>Unpublish</button>}
          {canManage && !isPublished && onDelete && <button onClick={onDelete} className="routine-btn text-red-400"><i className="fas fa-trash"></i></button>}
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
        link.download = `exam-routine-${department}-${examType}.png`;
        link.href = dataUrl;
        link.click();
      });
    });
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={handleExport} className="routine-btn routine-btn-primary"><i className="fas fa-download mr-1"></i>Export PNG</button>
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
                      {course?.teacher && <div className="text-[0.68rem] text-gray-500 italic">{course.teacher}</div>}
                      {!course?.code && !course?.title && !course?.teacher && <span className="text-gray-300">—</span>}
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

type ExamAllStep = 'info' | 'dates' | 'courses' | 'assign';

interface ExamAllSemesterSem {
  name: string;
  courses: ExamCourse[];
}

interface TeacherConflictInfo {
  semester: string;
  courseCode: string;
  teacher: string;
  date: string;
  slotId: string;
}

function ExamAllSemesterView({ examSlots, publishedRoutines, examRoutines, canPublish, profile, email, onPublish, onBack }: {
  examSlots: ExamSlot[];
  publishedRoutines: ExamRoutineItem[];
  examRoutines: ExamRoutineItem[];
  canPublish: boolean;
  profile: { name?: string; title?: string; role?: string; isCR?: boolean };
  email: string;
  onPublish: (items: ExamRoutineItem[]) => void;
  onBack: () => void;
}) {
  const [step, setStep] = useState<ExamAllStep>('info');
  const [sessionVal, setSessionVal] = useState(getDefaultSession());
  const [department, setDepartment] = useState('qsis');
  const [examType, setExamType] = useState('Midterm');
  const [rows, setRows] = useState<ExamRow[]>([getDefaultRow(examSlots)]);
  const [semesters, setSemesters] = useState<ExamAllSemesterSem[]>(
    config.semesters.map(s => ({ name: s.id, courses: [] }))
  );
  const [activeSemTab, setActiveSemTab] = useState(0);
  const [conflictMap, setConflictMap] = useState<Record<string, TeacherConflictInfo[]>>({});

  const enabledSlots = getEnabledSlots(examSlots);
  const semLabels = useMemo(() => config.semesters.reduce((acc, s) => { acc[s.id] = s.label; return acc; }, {} as Record<string, string>), []);

  useEffect(() => {
    fetch('/api/semester-courses')
      .then(r => r.json())
      .then(data => {
        if (!data.success || !data.courses?.length) return;
        const courseMap: Record<string, ExamCourse[]> = {};
        for (const c of data.courses) {
          if (!courseMap[c.semester]) courseMap[c.semester] = [];
          courseMap[c.semester].push({ code: c.code, title: c.title, teacher: c.teacher || '' });
        }
        setSemesters(prev => prev.map(s => {
          if (s.courses.length === 0 && courseMap[s.name]) {
            return { ...s, courses: courseMap[s.name] };
          }
          return s;
        }));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const newConflicts: Record<string, TeacherConflictInfo[]> = {};
    for (const row of rows) {
      if (!row.date) continue;
      for (const slot of enabledSlots) {
        const teacherMap: Record<string, { semester: string; courseCode: string }> = {};
        for (const sem of semesters) {
          const course = row.courses[slot.id];
          if (!course?.teacher || !course?.code) continue;
          const key = course.teacher.trim().toLowerCase();
          if (teacherMap[key]) {
            const existing = teacherMap[key];
            const conflictKey = `${row.date}:${slot.id}`;
            if (!newConflicts[conflictKey]) newConflicts[conflictKey] = [];
            newConflicts[conflictKey].push(
              { semester: semLabels[existing.semester] || existing.semester, courseCode: existing.courseCode, teacher: course.teacher, date: row.date, slotId: slot.id },
              { semester: semLabels[sem.name] || sem.name, courseCode: course.code, teacher: course.teacher, date: row.date, slotId: slot.id }
            );
          } else {
            teacherMap[key] = { semester: sem.name, courseCode: course.code };
          }
        }
      }
    }
    setConflictMap(newConflicts);
  }, [rows, semesters, enabledSlots, semLabels]);

  const addRow = () => {
    const courses: Record<string, ExamCourse> = {};
    enabledSlots.forEach(s => { courses[s.id] = { code: '', title: '', teacher: '' }; });
    setRows([...rows, { date: '', day: '', courses }]);
  };

  const removeRow = (idx: number) => {
    if (rows.length <= 1) return;
    setRows(rows.filter((_, i) => i !== idx));
  };

  const updateRow = (idx: number, field: string, value: string) => {
    const r = [...rows];
    if (field === 'date') {
      const d = new Date(value);
      r[idx] = { ...r[idx], date: value, day: DAYS[(d.getDay() + 1) % 7] || '' };
    } else {
      r[idx] = { ...r[idx], [field]: value };
    }
    setRows(r);
  };

  const updateRowCourse = (rowIdx: number, slotId: string, field: keyof ExamCourse, value: string) => {
    const r = [...rows];
    const courses = { ...r[rowIdx].courses };
    courses[slotId] = { ...courses[slotId], [field]: value };
    r[rowIdx] = { ...r[rowIdx], courses };
    setRows(r);
  };

  const updateSemCourse = (semIdx: number, cIdx: number, field: keyof ExamCourse, value: string) => {
    setSemesters(prev => prev.map((s, i) => {
      if (i !== semIdx) return s;
      const courses = [...s.courses];
      courses[cIdx] = { ...courses[cIdx], [field]: value };
      return { ...s, courses };
    }));
  };

  const addSemCourse = (semIdx: number) => {
    setSemesters(prev => prev.map((s, i) => {
      if (i !== semIdx) return s;
      return { ...s, courses: [...s.courses, { code: '', title: '', teacher: '' }] };
    }));
  };

  const removeSemCourse = (semIdx: number, cIdx: number) => {
    setSemesters(prev => prev.map((s, i) => {
      if (i !== semIdx) return s;
      return { ...s, courses: s.courses.filter((_, j) => j !== cIdx) };
    }));
  };

  const handlePublishAll = () => {
    if (rows.every(r => !r.date)) { showToast('Add at least one exam date', 'error'); return; }
    if (Object.keys(conflictMap).length > 0) { showToast('Fix teacher conflicts before publishing', 'error'); return; }

    const items: ExamRoutineItem[] = [];
    for (const sem of semesters) {
      if (sem.courses.length === 0) continue;
      const semRows = rows.map(row => {
        const courses: Record<string, ExamCourse> = {};
        for (const slot of enabledSlots) {
          const cellCourse = row.courses[slot.id];
          const semCourse = sem.courses.find(c => c.code === cellCourse?.code);
          if (semCourse) {
            courses[slot.id] = { code: semCourse.code, title: semCourse.title, teacher: semCourse.teacher };
          } else if (cellCourse?.code) {
            courses[slot.id] = cellCourse;
          } else {
            courses[slot.id] = { code: '', title: '', teacher: '' };
          }
        }
        return { date: row.date, day: row.day, courses };
      });
      items.push({
        id: `exam-all-${Date.now()}-${sem.name}`,
        semester: sem.name, session: sessionVal, department, examType,
        rows: semRows, slots: examSlots,
        createdAt: Date.now(),
      });
    }
    if (items.length === 0) { showToast('Add courses to at least one semester', 'error'); return; }
    if (!confirm(`Publish ${items.length} exam routines?`)) return;
    onPublish(items);
  };

  const steps: { key: ExamAllStep; label: string; icon: string; num: number }[] = [
    { key: 'info', label: 'Basic Info', icon: 'info-circle', num: 1 },
    { key: 'dates', label: 'Exam Dates', icon: 'calendar', num: 2 },
    { key: 'courses', label: 'Courses', icon: 'book', num: 3 },
    { key: 'assign', label: 'Assign & Review', icon: 'table', num: 4 },
  ];
  const currentStepIdx = steps.findIndex(s => s.key === step);

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-[1.1rem] font-bold text-dark-text"><i className="fas fa-layer-group text-qsis mr-2"></i>All Semester Exam Routine</h3>
          <p className="text-[0.75rem] text-dark-text2 mt-0.5">Unified builder — create exam routines for all semesters at once</p>
        </div>
        <div className="flex gap-2">
          {canPublish && (
            <button onClick={handlePublishAll} className="routine-btn routine-btn-primary"><i className="fas fa-share-alt mr-1"></i>Publish All</button>
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

      {step === 'info' && (
        <div className="bg-dark-bg2 border border-dark-border rounded-xl p-5 mt-4">
          <h4 className="text-[0.9rem] font-bold text-dark-text mb-3"><i className="fas fa-info-circle text-qsis mr-2"></i>Basic Information</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[0.7rem] text-dark-text2 block mb-1">Session</label>
              <input value={sessionVal} onChange={e => setSessionVal(e.target.value)} placeholder="e.g. Autumn - 2026" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" />
            </div>
            <div>
              <label className="text-[0.7rem] text-dark-text2 block mb-1">Department</label>
              <CustomSelect value={department} onChange={setDepartment} placeholder="Select..." options={FACULTIES.flatMap(f => f.departments.map(d => ({ value: d.id, label: `${d.shortName} — ${d.name}`, icon: d.icon || 'fa-building', group: f.shortName })))} searchable size="md" />
            </div>
            <div>
              <label className="text-[0.7rem] text-dark-text2 block mb-1">Exam Type</label>
              <CustomSelect value={examType} onChange={setExamType} placeholder="Select..." options={EXAM_TYPES.map(t => ({ value: t, label: t, icon: t === 'Midterm' ? 'fa-file-alt' : t === 'Final' ? 'fa-graduation-cap' : 'fa-question-circle' }))} size="md" />
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <button onClick={() => setStep('dates')} className="routine-btn routine-btn-primary"><i className="fas fa-arrow-right mr-1"></i>Next: Exam Dates</button>
          </div>
        </div>
      )}

      {step === 'dates' && (
        <div className="bg-dark-bg2 border border-dark-border rounded-xl p-5 mt-4">
          <h4 className="text-[0.9rem] font-bold text-dark-text mb-3"><i className="fas fa-calendar text-qsis mr-2"></i>Exam Dates (shared across all semesters)</h4>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left text-[0.72rem] font-semibold text-dark-text2 border-b border-dark-border w-16">#</th>
                  <th className="px-3 py-2 text-left text-[0.72rem] font-semibold text-dark-text2 border-b border-dark-border w-36">Date</th>
                  <th className="px-3 py-2 text-left text-[0.72rem] font-semibold text-dark-text2 border-b border-dark-border w-32">Day</th>
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
                      <CustomSelect value={row.day} onChange={val => updateRow(idx, 'day', val)} placeholder="Day" options={DAYS.map(d => ({ value: d, label: d, icon: 'fa-calendar-day' }))} />
                    </td>
                    <td className="px-2 py-2">
                      <button onClick={() => removeRow(idx)} disabled={rows.length <= 1} className="text-red-400 hover:text-red-300 disabled:opacity-30 bg-transparent border-none cursor-pointer text-[0.7rem]"><i className="fas fa-trash"></i></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between mt-3">
            <button onClick={addRow} className="routine-btn"><i className="fas fa-plus mr-1"></i>Add Date</button>
            <div className="flex gap-2">
              <button onClick={() => setStep('info')} className="routine-btn"><i className="fas fa-arrow-left mr-1"></i>Back</button>
              <button onClick={() => setStep('courses')} className="routine-btn routine-btn-primary"><i className="fas fa-arrow-right mr-1"></i>Next: Courses</button>
            </div>
          </div>
        </div>
      )}

      {step === 'courses' && (
        <div className="bg-dark-bg2 border border-dark-border rounded-xl p-5 mt-4">
          <h4 className="text-[0.9rem] font-bold text-dark-text mb-3"><i className="fas fa-book text-qsis mr-2"></i>Courses per Semester</h4>
          <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
            {semesters.map((sem, idx) => (
              <button key={sem.name} onClick={() => setActiveSemTab(idx)} className={`px-3 py-1.5 rounded-lg text-[0.72rem] font-semibold whitespace-nowrap border transition-colors ${activeSemTab === idx ? 'bg-qsis text-white border-qsis' : 'bg-dark-bg border-dark-border text-dark-text2 hover:border-qsis/50'}`}>
                {semLabels[sem.name] || sem.name}
                {sem.courses.length > 0 && <span className="ml-1 opacity-70">({sem.courses.length})</span>}
              </button>
            ))}
          </div>
          {semesters.map((sem, idx) => idx !== activeSemTab ? null : (
            <div key={sem.name}>
              <div className="space-y-2 mb-3">
                {sem.courses.map((c, cIdx) => (
                  <div key={cIdx} className="flex items-center gap-2 p-2 rounded-lg bg-dark-bg border border-dark-border">
                    <input value={c.code} onChange={e => updateSemCourse(idx, cIdx, 'code', e.target.value)} placeholder="Code" className="w-28 px-2 py-1.5 rounded border border-dark-border bg-dark-bg2 text-dark-text text-[0.78rem] outline-none focus:border-qsis" />
                    <input value={c.title} onChange={e => updateSemCourse(idx, cIdx, 'title', e.target.value)} placeholder="Title" className="flex-1 px-2 py-1.5 rounded border border-dark-border bg-dark-bg2 text-dark-text text-[0.78rem] outline-none focus:border-qsis" />
                    <div className="w-44"><TeacherAutocomplete value={c.teacher} onChange={val => updateSemCourse(idx, cIdx, 'teacher', val)} placeholder="Teacher" /></div>
                    <button onClick={() => removeSemCourse(idx, cIdx)} className="text-red-400 hover:text-red-300 bg-transparent border-none cursor-pointer text-[0.7rem]"><i className="fas fa-trash"></i></button>
                  </div>
                ))}
              </div>
              <button onClick={() => addSemCourse(idx)} className="routine-btn"><i className="fas fa-plus mr-1"></i>Add Course</button>
            </div>
          ))}
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setStep('dates')} className="routine-btn"><i className="fas fa-arrow-left mr-1"></i>Back</button>
            <button onClick={() => setStep('assign')} className="routine-btn routine-btn-primary"><i className="fas fa-arrow-right mr-1"></i>Next: Assign Grid</button>
          </div>
        </div>
      )}

      {step === 'assign' && (
        <div className="bg-dark-bg2 border border-dark-border rounded-xl p-5 mt-4">
          <h4 className="text-[0.9rem] font-bold text-dark-text mb-1"><i className="fas fa-table text-qsis mr-2"></i>Assignment Grid</h4>
          <p className="text-[0.72rem] text-dark-text3 mb-3">For each exam date &amp; slot, select which course is being examined. Teacher conflicts are highlighted automatically.</p>

          {Object.keys(conflictMap).length > 0 && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
              <p className="text-[0.78rem] font-semibold text-red-400 mb-1"><i className="fas fa-exclamation-triangle mr-1"></i>Teacher Conflicts Detected</p>
              {Object.entries(conflictMap).map(([key, conflicts]) => (
                <p key={key} className="text-[0.7rem] text-red-300 ml-4">• Teacher <strong>{conflicts[0]?.teacher}</strong> assigned to {conflicts.map(c => `${c.courseCode} (${c.semester})`).join(' & ')} on the same slot</p>
              ))}
            </div>
          )}

          {rows.map((row, rowIdx) => (
            <div key={rowIdx} className="mb-4 p-3 rounded-lg bg-dark-bg border border-dark-border">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[0.8rem] font-bold text-dark-text">{row.date ? new Date(row.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No date'}</span>
                <span className="text-[0.7rem] text-dark-text3">{row.day}</span>
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: `140px repeat(${enabledSlots.length}, 1fr)` }}>
                <div className="text-[0.65rem] font-semibold text-dark-text3"></div>
                {enabledSlots.map(slot => (
                  <div key={slot.id} className="text-[0.65rem] font-semibold text-dark-text2 text-center">{slot.name}</div>
                ))}
                {semesters.map((sem, semIdx) => (
                  <>
                    <div key={`label-${semIdx}`} className="text-[0.7rem] text-dark-text2 flex items-center">{semLabels[sem.name] || sem.name}</div>
                    {enabledSlots.map(slot => {
                      const cellCourse = row.courses[slot.id];
                      const semCourse = sem.courses.find(c => c.code === cellCourse?.code);
                      const hasConflict = !!conflictMap[`${row.date}:${slot.id}`]?.find(c => c.teacher === (semCourse?.teacher || cellCourse?.teacher));
                      return (
                        <div key={`${semIdx}-${slot.id}`}>
                          <select
                            value={cellCourse?.code || ''}
                            onChange={e => {
                              const course = sem.courses.find(c => c.code === e.target.value);
                              updateRowCourse(rowIdx, slot.id, 'code', e.target.value);
                              if (course) {
                                updateRowCourse(rowIdx, slot.id, 'title', course.title);
                                updateRowCourse(rowIdx, slot.id, 'teacher', course.teacher);
                              }
                            }}
                            className={`w-full px-1.5 py-1 rounded border text-[0.7rem] outline-none ${hasConflict ? 'border-red-500 bg-red-500/10 text-red-300' : 'border-dark-border bg-dark-bg text-dark-text'}`}
                          >
                            <option value="">—</option>
                            {sem.courses.map(c => (
                              <option key={c.code} value={c.code}>{c.code}{c.teacher ? ` (${c.teacher})` : ''}</option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </>
                ))}
              </div>
            </div>
          ))}

          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setStep('courses')} className="routine-btn"><i className="fas fa-arrow-left mr-1"></i>Back</button>
            <button onClick={handlePublishAll} className="routine-btn routine-btn-primary" disabled={Object.keys(conflictMap).length > 0}>
              <i className="fas fa-share-alt mr-1"></i>Publish All ({semesters.filter(s => s.courses.length > 0).length} semesters)
            </button>
          </div>
        </div>
      )}
    </>
  );
}
