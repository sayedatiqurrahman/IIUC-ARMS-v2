'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useAppStore } from '@/lib/store';
import { config } from '@/lib/config';
import { showToast } from '@/lib/utils';
import { ExamSlot, loadExamSlots, getEnabledSlots } from '@/lib/exam-routine-config';
import { findDepartment } from '@/lib/departments';
import { useConfirm } from '@/components/ConfirmModal';
import {
  SeatPlanEntry, SeatPlanDraft, BatchConfig, StudentResultGroup,
  LS_SEAT_PLAN_DRAFTS, LS_BATCH_CONFIGS, SEM_GENDER_MAP,
  getDefaultSession, rollInRange,
} from '@/components/seatplan';
import { RoomEditor } from '@/components/seatplan';
import { SeatGrid } from '@/components/seatplan';
import { SeatPlanPrintView } from '@/components/seatplan';
import { StudentSeatFinder } from '@/components/seatplan';

export default function SeatPlanView() {
  const { data: session } = useSession();
  const { confirm, confirmDialog } = useConfirm();
  const profile = useAppStore(s => s.profile);

  const email = session?.user?.email || profile.email || '';
  const isOwner = config.ownerEmails.includes(email);
  const effectiveRole = config.getEffectiveRole(email, profile.role);
  const showTeacher = effectiveRole === 'admin' || effectiveRole === 'manager' || effectiveRole === 'teacher' || profile.isCR;
  const canManageBatches = effectiveRole === 'admin' || effectiveRole === 'manager' || effectiveRole === 'teacher' || profile.isCR || profile.isACR;

  const [viewMode, setViewMode] = useState<'student' | 'manager' | 'builder'>('student');
  const [builderStep, setBuilderStep] = useState<1 | 2 | 3>(1);

  const [localDrafts, setLocalDrafts] = useState<SeatPlanDraft[]>([]);
  const [cloudPlans, setCloudPlans] = useState<SeatPlanDraft[]>([]);
  const [publishedPlans, setPublishedPlans] = useState<SeatPlanDraft[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [sessionVal, setSessionVal] = useState('');
  const [department, setDepartment] = useState(profile.department || 'qsis');
  const [examType, setExamType] = useState('Midterm');
  const [gender, setGender] = useState<'male' | 'female' | 'both'>('both');
  const [entries, setEntries] = useState<SeatPlanEntry[]>([]);
  const [examSlots, setExamSlots] = useState<ExamSlot[]>([]);
  const [showPublishMenu, setShowPublishMenu] = useState(false);

  const [batchConfigs, setBatchConfigs] = useState<BatchConfig[]>([]);
  const [roomCapacity, setRoomCapacity] = useState('40');
  const [excludedSemesters, setExcludedSemesters] = useState<Set<string>>(new Set());

  const [studentSemester, setStudentSemester] = useState(profile.semester || '');
  const [studentDate, setStudentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [studentGender, setStudentGender] = useState(() => { try { return localStorage.getItem('qsis-seatplan-gender') || ''; } catch { return ''; } });
  const [studentRoll, setStudentRoll] = useState('');
  const [studentDept, setStudentDept] = useState(profile.department || 'qsis');
  const [findTriggered, setFindTriggered] = useState(false);
  const rollIdRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (viewMode === 'student' && rollIdRef.current) {
      setTimeout(() => rollIdRef.current?.focus(), 200);
    }
  }, [viewMode]);

  const enabledSlots = useMemo(() => getEnabledSlots(examSlots), [examSlots]);
  const enabledSemesters = useMemo(() => config.semesters, []);

  useEffect(() => {
    setExamSlots(loadExamSlots());
    loadLocalDrafts();
    loadCloudPlans();
    loadPublishedPlans();
    loadBatchConfigs();
  }, []);

  useEffect(() => {
    if (!showPublishMenu) return;
    const handler = () => setShowPublishMenu(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [showPublishMenu]);

  useEffect(() => {
    if (profile.department) setStudentDept(profile.department);
    if (profile.semester) setStudentSemester(profile.semester);
  }, [profile.department, profile.semester]);

  useEffect(() => {
    setFindTriggered(false);
  }, [studentDept, studentSemester, studentDate]);

  useEffect(() => {
    try { localStorage.setItem('qsis-seatplan-gender', studentGender); } catch {}
  }, [studentGender]);

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (viewMode !== 'builder') return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      const draft = buildDraft('draft');
      const updated = localDrafts.filter(d => d.id !== draft.id);
      updated.push(draft);
      persistLocalDrafts(updated);
    }, 3000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [entries, sessionVal, department, examType, viewMode]);

  const loadLocalDrafts = useCallback(() => {
    try {
      const raw = localStorage.getItem(LS_SEAT_PLAN_DRAFTS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setLocalDrafts(parsed);
      }
    } catch {}
  }, []);

  const persistLocalDrafts = useCallback((drafts: SeatPlanDraft[]) => {
    setLocalDrafts(drafts);
    localStorage.setItem(LS_SEAT_PLAN_DRAFTS, JSON.stringify(drafts));
  }, []);

  const loadCloudPlans = useCallback(async () => {
    try {
      const res = await fetch('/api/published-exam-routines');
      const data = await res.json();
      if (data.success && Array.isArray(data.routines)) {
        const all = data.routines.filter((r: any) => r.type === 'seatplan');
        setCloudPlans(all.filter((r: any) => r.status !== 'published'));
        setPublishedPlans(all.filter((r: any) => r.status === 'published'));
      }
    } catch {}
  }, []);

  const loadBatchConfigs = useCallback(() => {
    try {
      const raw = localStorage.getItem(LS_BATCH_CONFIGS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setBatchConfigs(parsed);
      }
    } catch {}
  }, []);

  const persistBatchConfigs = useCallback((configs: BatchConfig[]) => {
    setBatchConfigs(configs);
    localStorage.setItem(LS_BATCH_CONFIGS, JSON.stringify(configs));
  }, []);

  function autoPromoteBatches() {
    const now = Date.now();
    const SIX_MONTHS = 180 * 24 * 60 * 60 * 1000;
    const updated = batchConfigs.map(b => {
      if (now - b.lastPromoted >= SIX_MONTHS) {
        const semIdx = config.semesters.findIndex(s => s.id === b.semester);
        if (semIdx >= 0 && semIdx < config.semesters.length - 1) {
          return { ...b, semester: config.semesters[semIdx + 1].id, lastPromoted: now };
        }
      }
      return b;
    });
    if (JSON.stringify(updated) !== JSON.stringify(batchConfigs)) {
      persistBatchConfigs(updated);
      showToast('Batches auto-promoted', 'success');
    }
  }

  const studentResults = useMemo(() => {
    if (!findTriggered) return [];
    const groups: Record<string, StudentResultGroup> = {};

    for (const plan of publishedPlans) {
      if (plan.department && plan.department !== studentDept) continue;
      for (const entry of plan.entries) {
        if (!entry.room) continue;
        const matchesSemester = studentSemester && entry.semester === studentSemester;
        const matchesDate = studentDate && entry.date === studentDate;
        if (!matchesSemester && !matchesDate) continue;
        if (studentSemester && !matchesSemester) continue;
        if (studentDate && !matchesDate) continue;
        if (studentGender && entry.gender !== studentGender) continue;
        if (studentRoll && entry.rollFrom && !rollInRange(studentRoll, entry.rollFrom, entry.rollTo)) continue;

        if (!groups[entry.semester]) {
          const semLabel = config.semesters.find(s => s.id === entry.semester)?.label || entry.semester;
          groups[entry.semester] = { semester: entry.semester, semesterLabel: semLabel, maleEntries: [], femaleEntries: [] };
        }
        if (entry.gender === 'female') {
          groups[entry.semester].femaleEntries.push({ plan, entry });
        } else {
          groups[entry.semester].maleEntries.push({ plan, entry });
        }
      }
    }

    return Object.values(groups).sort((a, b) => {
      const idxA = config.semesters.findIndex(s => s.id === a.semester);
      const idxB = config.semesters.findIndex(s => s.id === b.semester);
      return idxA - idxB;
    });
  }, [publishedPlans, studentSemester, studentDept, studentDate, studentGender, findTriggered]);

  const allPlans = useMemo(() => [...cloudPlans, ...localDrafts], [cloudPlans, localDrafts]);

  function startNew() {
    setEditingId(null);
    setSessionVal(getDefaultSession());
    setDepartment(profile.department || 'qsis');
    setExamType('Midterm');
    setGender('both');
    setEntries([]);
    setBuilderStep(1);
    setViewMode('builder');
  }

  function editPlan(plan: SeatPlanDraft) {
    setEditingId(plan.id);
    setSessionVal(plan.session);
    setDepartment(plan.department);
    setExamType(plan.examType);
    setEntries([...plan.entries]);
    setBuilderStep(1);
    setViewMode('builder');
  }

  function deleteLocalPlan(id: string) {
    persistLocalDrafts(localDrafts.filter(d => d.id !== id));
    showToast('Deleted', 'success');
  }

  async function unpublishPlan(id: string) {
    try {
      const res = await fetch(`/api/published-exam-routines?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) { await loadCloudPlans(); await loadPublishedPlans(); showToast('Unpublished', 'success'); }
    } catch { showToast('Failed', 'error'); }
  }

  const loadPublishedPlans = useCallback(async () => {
    try {
      const res = await fetch('/api/published-exam-routines');
      const data = await res.json();
      if (data.success && Array.isArray(data.routines)) {
        setPublishedPlans(data.routines.filter((r: any) => r.type === 'seatplan' && r.status === 'published'));
      }
    } catch {}
  }, []);

  const [dateInputs, setDateInputs] = useState<string[]>(['']);

  const summaryRows = useMemo(() => {
    const sorted = [...entries].sort((a, b) => {
      const semA = enabledSemesters.findIndex(s => s.id === a.semester);
      const semB = enabledSemesters.findIndex(s => s.id === b.semester);
      if (semA !== semB) return semA - semB;
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      const slotA = enabledSlots.findIndex(s => s.id === a.slotId);
      const slotB = enabledSlots.findIndex(s => s.id === b.slotId);
      return slotA - slotB;
    });
    return sorted.filter(e => e.room || e.teacher);
  }, [entries, enabledSemesters, enabledSlots]);

  const teacherConflicts = useMemo(() => {
    const conflicting = new Set<number>();
    const teacherMap: Record<string, number[]> = {};
    entries.forEach((e, idx) => {
      if (!e.teacher) return;
      const names = e.teacher.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      for (const name of names) {
        const key = `${name}:${e.date}:${e.slotId}`;
        if (!teacherMap[key]) teacherMap[key] = [];
        teacherMap[key].push(idx);
      }
    });
    for (const indices of Object.values(teacherMap)) {
      if (indices.length > 1) {
        for (const idx of indices) conflicting.add(idx);
      }
    }
    return conflicting;
  }, [entries]);

  const roomsByGender = useMemo(() => {
    const maleRooms = new Set<string>();
    const femaleRooms = new Set<string>();
    for (const e of entries) {
      if (!e.room) continue;
      if (e.gender === 'male') maleRooms.add(e.room);
      else if (e.gender === 'female') femaleRooms.add(e.room);
      else { maleRooms.add(e.room); femaleRooms.add(e.room); }
    }
    return { male: Array.from(maleRooms).sort(), female: Array.from(femaleRooms).sort() };
  }, [entries]);

  const rollConflicts = useMemo(() => {
    const conflicting = new Set<number>();
    const rollMap: Record<string, { idx: number; from: string; to: string }[]> = {};
    entries.forEach((e, idx) => {
      if (!e.rollFrom) return;
      const key = `${e.date}:${e.slotId}`;
      if (!rollMap[key]) rollMap[key] = [];
      rollMap[key].push({ idx, from: e.rollFrom, to: e.rollTo || e.rollFrom });
    });
    for (const group of Object.values(rollMap)) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i], b = group[j];
          if (a.from <= b.to && b.from <= a.to) {
            conflicting.add(a.idx);
            conflicting.add(b.idx);
          }
        }
      }
    }
    return conflicting;
  }, [entries]);

  function buildDraft(status?: string): SeatPlanDraft {
    const semesters = Array.from(new Set(entries.map(e => e.semester)));
    return { id: editingId || `seatplan-${Date.now()}`, semester: semesters.join(',') || 'all', session: sessionVal, department, examType, entries, createdAt: Date.now(), published: false, status };
  }

  function getMissingSemesters(): string[] {
    const coveredSemesters = new Set(entries.filter(e => e.room).map(e => e.semester));
    return enabledSemesters.filter(s => !excludedSemesters.has(s.id) && !coveredSemesters.has(s.id)).map(s => s.label);
  }

  async function handleSaveDraft() {
    const draft = buildDraft('draft');
    const updated = localDrafts.filter(d => d.id !== draft.id);
    updated.push(draft);
    persistLocalDrafts(updated);
    showToast('Saved as draft', 'success');
    setViewMode('manager');
  }

  async function handleSaveToCloud() {
    const missing = getMissingSemesters();
    if (missing.length > 0) {
      if (!await confirm({ message: `Warning: ${missing.length} semester(s) have no room assignments:\n${missing.join(', ')}\n\nSave anyway?`, title: 'Missing Rooms' })) return;
    }
    const draft = buildDraft('saved');
    draft.publishedBy = { name: profile.name || email.split('@')[0], title: profile.title, email };
    draft.publishedAt = Date.now();
    try {
      const res = await fetch('/api/published-exam-routines', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ routines: [{ ...draft, type: 'seatplan' }] }) });
      const data = await res.json();
      if (data.success) { if (editingId) persistLocalDrafts(localDrafts.filter(d => d.id !== editingId)); await loadCloudPlans(); showToast('Saved to cloud', 'success'); setViewMode('manager'); }
      else showToast(data.error || 'Failed', 'error');
    } catch { showToast('Failed', 'error'); }
  }

  async function handlePublish() {
    const missing = getMissingSemesters();
    if (missing.length > 0) {
      if (!await confirm({ message: `Warning: ${missing.length} semester(s) have no room assignments:\n${missing.join(', ')}\n\nPublish anyway? Students in these semesters won't see seat info.`, title: 'Missing Rooms' })) return;
    }
    const draft = buildDraft('published');
    draft.published = true;
    draft.publishedBy = { name: profile.name || email.split('@')[0], title: profile.title, email };
    draft.publishedAt = Date.now();
    try {
      const res = await fetch('/api/published-exam-routines', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ routines: [{ ...draft, type: 'seatplan' }] }) });
      const data = await res.json();
      if (data.success) { if (editingId) persistLocalDrafts(localDrafts.filter(d => d.id !== editingId)); await loadCloudPlans(); await loadPublishedPlans(); showToast('Published!', 'success'); setViewMode('manager'); }
      else showToast(data.error || 'Failed', 'error');
    } catch { showToast('Failed', 'error'); }
  }

  return (
    <section className="mb-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
        <div>
          <h2 className="text-[1.3rem] font-bold text-dark-text"><i className="fas fa-chair text-qsis mr-2"></i>Seat Plan</h2>
          <p className="text-[0.72rem] text-dark-text2 mt-0.5">Find your exam room or manage seat assignments</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {viewMode !== 'student' && (
            <button onClick={() => setViewMode('student')} className="routine-btn"><i className="fas fa-search mr-1"></i>Find My Seat</button>
          )}
          {showTeacher && viewMode !== 'manager' && (
            <button onClick={() => setViewMode('manager')} className="routine-btn"><i className="fas fa-cog mr-1"></i>Manage</button>
          )}
          {viewMode === 'manager' && (
            <button onClick={startNew} className="routine-btn routine-btn-primary"><i className="fas fa-plus mr-1"></i>New Seat Plan</button>
          )}
          {viewMode === 'builder' && (
            <button onClick={() => setViewMode('manager')} className="routine-btn"><i className="fas fa-arrow-left mr-1"></i>Back</button>
          )}
        </div>
      </div>

      {viewMode === 'student' && (
        <StudentSeatFinder
          studentDept={studentDept}
          setStudentDept={setStudentDept}
          studentSemester={studentSemester}
          setStudentSemester={setStudentSemester}
          studentDate={studentDate}
          setStudentDate={setStudentDate}
          studentGender={studentGender}
          setStudentGender={setStudentGender}
          studentRoll={studentRoll}
          setStudentRoll={setStudentRoll}
          findTriggered={findTriggered}
          setFindTriggered={setFindTriggered}
          studentResults={studentResults}
          publishedPlans={publishedPlans}
          enabledSlots={enabledSlots}
          showTeacher={showTeacher}
          rollIdRef={rollIdRef}
        />
      )}

      {viewMode === 'manager' && (
        <div className="space-y-3">
          {allPlans.length === 0 && (
            <div className="text-center py-10">
              <i className="fas fa-chair text-3xl text-dark-text3 mb-3 block"></i>
              <p className="text-[0.9rem] text-dark-text2">No seat plans yet</p>
              <p className="text-[0.75rem] text-dark-text3 mt-1">Click &quot;New Seat Plan&quot; to create one</p>
            </div>
          )}
          {allPlans.map(plan => {
            const isPublished = plan.published || plan.status === 'published';
            const isCloudSaved = plan.status === 'saved';
            const isDraft = plan.status === 'draft' || (!isPublished && !isCloudSaved);
            const canEdit = isOwner || (plan.publishedBy?.email && plan.publishedBy.email === email);
            const pDept = findDepartment(plan.department);
            return (
              <div key={plan.id} className={`bg-dark-bg2 border rounded-xl p-4 ${isPublished ? 'border-green-500/30' : isCloudSaved ? 'border-blue-500/30' : 'border-dark-border'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-[0.9rem] font-bold text-dark-text">{plan.examType} Seat Plan</h4>
                      {isPublished && <span className="px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 text-[0.65rem] font-semibold"><i className="fas fa-globe mr-0.5"></i>Published</span>}
                      {isCloudSaved && <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 text-[0.65rem] font-semibold"><i className="fas fa-cloud mr-0.5"></i>Saved</span>}
                      {isDraft && <span className="px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 text-[0.65rem] font-semibold">Draft</span>}
                    </div>
                    <p className="text-[0.75rem] text-dark-text2 mt-0.5">{plan.session} &bull; {pDept?.department.shortName || plan.department} &bull; {plan.entries.filter(e => e.room).length} assignments</p>
                    {plan.publishedBy && <p className="text-[0.68rem] text-dark-text3 mt-0.5"><i className="fas fa-user-check mr-1"></i>{plan.publishedBy.name}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canEdit && <button onClick={() => editPlan(plan)} className="routine-btn" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', color: '#3b82f6' }}><i className="fas fa-edit mr-1"></i>Edit</button>}
                    {canEdit && isPublished && <button onClick={() => unpublishPlan(plan.id)} className="routine-btn text-yellow-400"><i className="fas fa-eye-slash"></i></button>}
                    {canEdit && <button onClick={() => deleteLocalPlan(plan.id)} className="routine-btn text-red-400"><i className="fas fa-trash"></i></button>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewMode === 'builder' && (
        <div>
          <div className="routine-builder-steps">
            {([1, 2, 3] as const).map((s, idx) => {
              const labels = ['Setup', 'Assign Rooms', 'Review & Publish'];
              return (
                <div key={s} className={`routine-step ${builderStep === s ? 'active' : ''} ${builderStep > s ? 'completed' : ''}`}>
                  <div className="routine-step-num">{builderStep > s ? <i className="fas fa-check"></i> : s}</div>
                  <span className="routine-step-label">{labels[idx]}</span>
                  {idx < 2 && <div className="routine-step-line"></div>}
                </div>
              );
            })}
          </div>

          {builderStep === 1 && (
            <RoomEditor
              sessionVal={sessionVal}
              setSessionVal={setSessionVal}
              department={department}
              setDepartment={setDepartment}
              examType={examType}
              setExamType={setExamType}
              dateInputs={dateInputs}
              setDateInputs={setDateInputs}
              excludedSemesters={excludedSemesters}
              setExcludedSemesters={setExcludedSemesters}
              roomCapacity={roomCapacity}
              setRoomCapacity={setRoomCapacity}
              batchConfigs={batchConfigs}
              setBatchConfigs={persistBatchConfigs}
              enabledSemesters={enabledSemesters}
              canManageBatches={canManageBatches}
              profile={profile}
              departmentValue={department}
              entries={entries}
              setEntries={setEntries}
              enabledSlots={enabledSlots}
              setBuilderStep={setBuilderStep}
            />
          )}

          {builderStep === 2 && (
            <SeatGrid
              entries={entries}
              setEntries={setEntries}
              dateInputs={dateInputs}
              enabledSlots={enabledSlots}
              enabledSemesters={enabledSemesters}
              excludedSemesters={excludedSemesters}
              department={department}
              teacherConflicts={teacherConflicts}
              rollConflicts={rollConflicts}
              roomsByGender={roomsByGender}
              setBuilderStep={setBuilderStep}
            />
          )}

          {builderStep === 3 && (
            <SeatPlanPrintView
              entries={entries}
              showTeacher={showTeacher}
              enabledSlots={enabledSlots}
              setBuilderStep={setBuilderStep}
              showPublishMenu={showPublishMenu}
              setShowPublishMenu={setShowPublishMenu}
              summaryRows={summaryRows}
              onSaveDraft={handleSaveDraft}
              onSaveToCloud={handleSaveToCloud}
              onPublish={handlePublish}
            />
          )}
        </div>
      )}
      {confirmDialog}
    </section>
  );
}
