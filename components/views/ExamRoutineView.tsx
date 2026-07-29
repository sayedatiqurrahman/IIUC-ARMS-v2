'use client';

import { useState, useEffect, useCallback } from 'react';
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
  const canPublish = config.canPublishRoutine(email, profile);

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
      r[idx] = { ...r[idx], date: value, day: DAYS[d.getDay()] || '' };
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
        <div className="bg-dark-bg2 border border-dark-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-[0.95rem] font-bold text-dark-text"><i className="fas fa-layer-group text-qsis mr-2"></i>All Semester Exam Routine</h3>
              <p className="text-[0.75rem] text-dark-text2 mt-0.5">Create exam routines for all 8 semesters from one place.</p>
            </div>
            <button onClick={() => setViewMode('manager')} className="routine-btn"><i className="fas fa-arrow-left mr-1"></i>Back</button>
          </div>
          <div className="space-y-2">
            {config.semesters.map((sem, idx) => {
              const existingDraft = examRoutines.find(r => r.semester === sem.id);
              const existingPub = publishedRoutines.find(r => r.semester === sem.id);
              const display = existingPub || existingDraft;
              const isPublished = !!existingPub;
              return (
                <div key={sem.id} className={`flex items-center justify-between p-3 rounded-lg border ${isPublished ? 'border-green-500/30 bg-green-500/5' : 'border-dark-border bg-dark-bg'}`}>
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-full flex items-center justify-center text-[0.68rem] font-bold" style={{ background: isPublished ? '#166534' : 'var(--bg3)', color: '#fff' }}>{idx + 1}</span>
                    <span className="text-[0.85rem] font-semibold text-dark-text">{sem.label}</span>
                    {isPublished && <span className="text-[0.65rem] text-green-400 font-semibold"><i className="fas fa-globe mr-1"></i>Published</span>}
                    {!isPublished && existingDraft?.isDraft && <span className="text-[0.65rem] text-yellow-400 font-semibold"><i className="fas fa-pen mr-1"></i>Draft</span>}
                  </div>
                  <div className="flex gap-2">
                    {display ? (
                      <>
                        <button onClick={() => { editRoutine(display); }} className="routine-btn" style={{ fontSize: '0.75rem', padding: '6px 12px' }}><i className="fas fa-edit mr-1"></i>Edit</button>
                        <button onClick={() => { setEditingId(display.id); setRows(display.rows); setSemester(display.semester); setSessionVal(display.session); setDepartment(display.department); setExamType(display.examType); setViewMode('preview'); }} className="routine-btn" style={{ fontSize: '0.75rem', padding: '6px 12px' }}><i className="fas fa-eye mr-1"></i>View</button>
                      </>
                    ) : (
                      <button onClick={() => { setEditingId(null); setSemester(sem.id); setSessionVal(getDefaultSession()); setDepartment('qsis'); setExamType('Midterm'); setRows([getDefaultRow(examSlots)]); setViewMode('builder'); }} className="routine-btn routine-btn-primary" style={{ fontSize: '0.75rem', padding: '6px 12px' }}><i className="fas fa-plus mr-1"></i>Create</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
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
