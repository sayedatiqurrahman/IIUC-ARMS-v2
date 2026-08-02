'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useAppStore } from '@/lib/store';
import { config } from '@/lib/config';
import { showToast } from '@/lib/utils';
import { ExamSlot, loadExamSlots, getEnabledSlots } from '@/lib/exam-routine-config';
import CustomSelect from '@/components/CustomSelect';
import TeacherAutocomplete from '@/components/TeacherAutocomplete';
import { FACULTIES, findDepartment } from '@/lib/departments';
import { useConfirm } from '@/components/ConfirmModal';

interface SeatPlanEntry {
  semester: string;
  date: string;
  slotId: string;
  room: string;
  teacher: string;
  gender: 'male' | 'female' | 'both';
  rollFrom: string;
  rollTo: string;
}

interface SeatPlanDraft {
  id: string;
  semester: string;
  session: string;
  department: string;
  examType: string;
  entries: SeatPlanEntry[];
  createdAt: number;
  published?: boolean;
  publishedBy?: { name: string; title?: string; email?: string };
  publishedAt?: number;
  status?: string;
  type?: string;
}

const LS_SEAT_PLAN_DRAFTS = 'qsis-seat-plan-drafts';
const LS_BATCH_CONFIGS = 'qsis-batch-configs';
const EXAM_TYPES = ['Midterm', 'Final', 'Quiz', 'Makeup', 'Practical'];
const DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const SEM_GENDER_MAP: Record<string, 'male' | 'female'> = {
  '1st-semister': 'male', '2nd-semister': 'male', '3rd-semister': 'male', '4th-semister': 'male',
  '5th-semister': 'female', '6th-semister': 'female', '7th-semister': 'female', '8th-semister': 'female',
};

interface BatchConfig {
  id: string;
  name: string;
  prefix: string;
  rollStart: string;
  rollEnd: string;
  excludeRolls: string;
  semester: string;
  department: string;
  createdAt: number;
  lastPromoted: number;
}

function getDefaultSession(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  return month < 6 ? `Spring - ${year}` : `Autumn - ${year}`;
}

export default function SeatPlanView() {
  const { data: session } = useSession();
  const { confirm, ConfirmModal } = useConfirm();
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
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [batchName, setBatchName] = useState('');
  const [batchPrefix, setBatchPrefix] = useState('');
  const [batchRollStart, setBatchRollStart] = useState('');
  const [batchRollEnd, setBatchRollEnd] = useState('');
  const [batchExcludeRolls, setBatchExcludeRolls] = useState('');
  const [excludedSemesters, setExcludedSemesters] = useState<Set<string>>(new Set());

  const [studentSemester, setStudentSemester] = useState(profile.semester || '');
  const [studentDate, setStudentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [studentGender, setStudentGender] = useState(() => { try { return localStorage.getItem('qsis-seatplan-gender') || ''; } catch { return ''; } });
  const [studentRoll, setStudentRoll] = useState('');
  const [studentDept, setStudentDept] = useState(profile.department || 'qsis');
  const [findTriggered, setFindTriggered] = useState(false);
  const rollIdRef = useRef<HTMLInputElement>(null);

  // Auto-focus Roll ID when switching to student view
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

  // Auto-save builder draft every 3 seconds of inactivity
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

  function addBatch() {
    if (!batchName || !batchPrefix) { showToast('Name and prefix required', 'error'); return; }
    const newBatch: BatchConfig = {
      id: `batch-${Date.now()}`,
      name: batchName,
      prefix: batchPrefix.toUpperCase(),
      rollStart: batchRollStart,
      rollEnd: batchRollEnd,
      excludeRolls: batchExcludeRolls,
      semester: profile.semester || '1st-semister',
      department: department,
      createdAt: Date.now(),
      lastPromoted: Date.now(),
    };
    persistBatchConfigs([...batchConfigs, newBatch]);
    setBatchName(''); setBatchPrefix(''); setBatchRollStart(''); setBatchRollEnd(''); setBatchExcludeRolls('');
    setShowBatchForm(false);
    showToast('Batch added', 'success');
  }

  function removeBatch(id: string) {
    persistBatchConfigs(batchConfigs.filter(b => b.id !== id));
  }

  function generateRollIds(batch: BatchConfig): string[] {
    const prefix = batch.prefix.toUpperCase();
    const start = parseInt(batch.rollStart) || 1;
    const end = parseInt(batch.rollEnd) || 99;
    const excludes = new Set(
      batch.excludeRolls.split(/[,;\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
    );
    const ids: string[] = [];
    for (let i = start; i <= end; i++) {
      const id = `${prefix}${String(i).padStart(3, '0')}`;
      if (!excludes.has(id)) ids.push(id);
    }
    return ids;
  }

  function autoAllocateFromBatch(batchId: string) {
    const batch = batchConfigs.find(b => b.id === batchId);
    if (!batch) return;
    const capacity = parseInt(roomCapacity) || 40;
    const rollIds = generateRollIds(batch);
    if (rollIds.length === 0) { showToast('No roll IDs generated', 'error'); return; }
    const dates = dateInputs.filter(d => d.trim());
    if (dates.length === 0) { showToast('Add dates first', 'error'); return; }
    const semGender = SEM_GENDER_MAP[batch.semester] || 'male';
    const newEntries: SeatPlanEntry[] = [];
    for (const date of dates) {
      for (const slot of enabledSlots) {
        const roomCount = Math.ceil(rollIds.length / capacity);
        for (let r = 0; r < roomCount; r++) {
          const chunk = rollIds.slice(r * capacity, (r + 1) * capacity);
          const roomName = `${batch.prefix}-R${r + 1}`;
          const from = chunk[0];
          const to = chunk[chunk.length - 1];
          newEntries.push({
            semester: batch.semester,
            date,
            slotId: slot.id,
            room: roomName,
            teacher: '',
            gender: semGender,
            rollFrom: from,
            rollTo: to,
          });
        }
      }
    }
    setEntries(prev => [...prev, ...newEntries]);
    showToast(`Allocated ${rollIds.length} students into ${Math.ceil(rollIds.length / (parseInt(roomCapacity) || 40))} rooms per slot`, 'success');
  }

  interface StudentResultGroup {
    semester: string;
    semesterLabel: string;
    maleEntries: { plan: SeatPlanDraft; entry: SeatPlanEntry }[];
    femaleEntries: { plan: SeatPlanDraft; entry: SeatPlanEntry }[];
  }

  function rollInRange(roll: string, from: string, to: string): boolean {
    if (!from) return true;
    const r = roll.toUpperCase();
    const f = from.toUpperCase();
    const t = to ? to.toUpperCase() : '';
    if (t) return r >= f && r <= t;
    return r >= f;
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

  function updateEntry(idx: number, field: keyof SeatPlanEntry, value: string) {
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e));
  }

  function addEntry(semester: string, date: string, slotId: string, g: 'male' | 'female') {
    setEntries(prev => [...prev, { semester, date, slotId, room: '', teacher: '', gender: g, rollFrom: '', rollTo: '' }]);
  }

  function removeEntry(idx: number) {
    setEntries(prev => prev.filter((_, i) => i !== idx));
  }

  function autoPopulateEntries() {
    const dates = dateInputs.filter(d => d.trim());
    if (dates.length === 0) { showToast('Add dates first', 'error'); return; }
    const existing = new Set(entries.map(e => `${e.semester}:${e.date}:${e.slotId}:${e.gender}:${e.room}`));
    const newEntries: SeatPlanEntry[] = [];
    for (const sem of enabledSemesters) {
      if (excludedSemesters.has(sem.id)) continue;
      for (const date of dates) {
        for (const slot of enabledSlots) {
          for (const g of ['male', 'female'] as const) {
            if (!existing.has(`${sem.id}:${date}:${slot.id}:${g}:`)) {
              newEntries.push({ semester: sem.id, date, slotId: slot.id, room: '', teacher: '', gender: g, rollFrom: '', rollTo: '' });
            }
          }
        }
      }
    }
    if (newEntries.length > 0) { setEntries(prev => [...prev, ...newEntries]); showToast(`Added ${newEntries.length} entries`, 'success'); }
    else showToast('All exist', 'info');
  }

  const [dateInputs, setDateInputs] = useState<string[]>(['']);
  function addDateInput() { setDateInputs(prev => [...prev, '']); }
  function removeDateInput(idx: number) { if (dateInputs.length > 1) setDateInputs(prev => prev.filter((_, i) => i !== idx)); }
  function updateDateInput(idx: number, val: string) { setDateInputs(prev => prev.map((d, i) => i === idx ? val : d)); }

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

  function getRollCount(from: string, to: string): number {
    if (!from) return 0;
    const matchFrom = from.match(/^(.*?)(\d+)$/);
    const matchTo = (to || from).match(/^(.*?)(\d+)$/);
    if (!matchFrom || !matchTo || matchFrom[1] !== matchTo[1]) return 1;
    const start = parseInt(matchFrom[2]);
    const end = parseInt(matchTo[2]);
    return Math.max(1, end - start + 1);
  }

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

  const deptInfo = findDepartment(department);

  return (
    <section className="mb-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-[1.3rem] font-bold text-dark-text"><i className="fas fa-chair text-qsis mr-2"></i>Seat Plan</h2>
          <p className="text-[0.72rem] text-dark-text2 mt-0.5">Find your exam room or manage seat assignments</p>
        </div>
        <div className="flex gap-2">
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
        <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4 sm:p-5">
          <h4 className="text-[0.9rem] font-bold text-dark-text mb-3 text-center sm:text-left"><i className="fas fa-search text-qsis mr-2"></i>Find My Exam Room</h4>
          <p className="text-[0.72rem] text-dark-text3 mb-4 text-center sm:text-left">Select your details to see which room your exam is held in.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 mb-5">
            <div>
              <label className="text-[0.72rem] text-dark-text2 mb-1 block"><i className="fas fa-building mr-1"></i>Department</label>
              <CustomSelect value={studentDept} onChange={setStudentDept} options={FACULTIES.flatMap(f => f.departments.map(d => ({ value: d.id, label: `${d.shortName} — ${d.name}`, icon: 'fa-building', group: f.shortName })))} placeholder="Department" />
            </div>
            <div>
              <label className="text-[0.72rem] text-dark-text2 mb-1 block"><i className="fas fa-graduation-cap mr-1"></i>Semester</label>
              <CustomSelect value={studentSemester} onChange={setStudentSemester} options={[{ value: '', label: 'All Semesters', icon: 'fa-layer-group' }, ...config.semesters.map(s => ({ value: s.id, label: s.label, icon: 'fa-book' }))]} placeholder="All Semesters" />
            </div>
            <div>
              <label className="text-[0.72rem] text-dark-text2 mb-1 block"><i className="fas fa-calendar-day mr-1"></i>Exam Date</label>
              <input type="date" value={studentDate} onChange={e => setStudentDate(e.target.value)} className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" />
            </div>
            <div>
              <label className="text-[0.72rem] text-dark-text2 mb-1 block"><i className="fas fa-venus-mars mr-1"></i>Gender (optional)</label>
              <CustomSelect value={studentGender} onChange={setStudentGender} options={[{ value: '', label: 'All', icon: 'fa-venus-mars' }, { value: 'male', label: 'Male (MAZ)', icon: 'fa-mars' }, { value: 'female', label: 'Female (FAZ)', icon: 'fa-venus' }]} placeholder="All" />
            </div>
            <div>
              <label className="text-[0.72rem] text-dark-text2 mb-1 block"><i className="fas fa-id-card mr-1"></i>Roll ID (optional)</label>
              <input ref={rollIdRef} value={studentRoll} onChange={e => setStudentRoll(e.target.value)} onKeyDown={e => e.key === 'Enter' && studentDate && setFindTriggered(true)} placeholder="e.g. Q233099" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" />
            </div>
          </div>
          <div className="flex justify-center mb-4">
            <button
              onClick={() => studentDate && setFindTriggered(true)}
              disabled={!studentDate}
              className={`w-full max-w-sm px-5 py-2.5 rounded-lg text-[0.85rem] font-semibold transition-all cursor-pointer border-none ${studentDate ? 'bg-qsis text-white hover:bg-qsis-dark shadow-lg shadow-qsis/20' : 'bg-dark-bg3 text-dark-text3 cursor-not-allowed'}`}
            >
              <i className="fas fa-search mr-1.5"></i>Find Room
            </button>
          </div>
          {findTriggered && (
            <div className="flex justify-center mb-4">
              <button onClick={() => setFindTriggered(false)} className="px-4 py-2 rounded-lg text-[0.78rem] font-medium bg-dark-bg3 text-dark-text2 border border-dark-border hover:border-dark-text3 transition-all cursor-pointer">
                <i className="fas fa-times mr-1"></i>Clear
              </button>
            </div>
          )}

          {findTriggered && studentResults.length > 0 ? (
            <div className="space-y-4">
              <p className="text-[0.78rem] text-dark-text2 font-semibold">
                <i className="fas fa-calendar-day mr-1 text-qsis"></i>
                {new Date(studentDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                <span className="text-dark-text3 ml-2">— {studentResults.length} semester(s) with exams</span>
              </p>
              {studentResults.map(group => {
                const pDept = findDepartment(studentDept);
                const buildingName = pDept?.department.shortName || studentDept;
                return (
                <div key={group.semester} className="rounded-xl border border-dark-border overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-dark-bg3">
                    <span className="text-[0.8rem] font-bold text-dark-text">{group.semesterLabel}</span>
                    <div className="flex gap-1.5">
                      {!studentGender && <span className="text-[0.55rem] px-1.5 py-0.5 rounded font-bold bg-blue-500/20 text-blue-400">MAZ</span>}
                      {!studentGender && <span className="text-[0.55rem] px-1.5 py-0.5 rounded font-bold bg-pink-500/20 text-pink-400">FAZ</span>}
                      {studentGender === 'male' && <span className="text-[0.55rem] px-1.5 py-0.5 rounded font-bold bg-blue-500/20 text-blue-400">MAZ</span>}
                      {studentGender === 'female' && <span className="text-[0.55rem] px-1.5 py-0.5 rounded font-bold bg-pink-500/20 text-pink-400">FAZ</span>}
                    </div>
                  </div>
                  <div className="bg-dark-bg2 divide-y divide-dark-border">
                    {group.maleEntries.map(({ plan, entry }, idx) => {
                      const slot = enabledSlots.find(s => s.id === entry.slotId);
                      return (
                        <div key={`m${idx}`} className="flex items-center gap-3 px-4 py-2.5">
                          <span className="text-[0.55rem] px-1.5 py-0.5 rounded font-bold bg-blue-500/20 text-blue-400 flex-shrink-0">MAZ</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-[0.85rem] font-bold text-dark-text">{entry.room}</span>
                              {entry.rollFrom && <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400/80 font-mono">{entry.rollFrom}{entry.rollTo ? ` – ${entry.rollTo}` : '+'}</span>}
                            </div>
                            <div className="text-[0.7rem] text-dark-text3">
                              <i className="fas fa-building mr-1"></i>{buildingName}
                              {slot && <> &bull; {slot.name} ({slot.startTime} – {slot.endTime})</>}
                            </div>
                          </div>
                          <div className="text-[0.65rem] text-dark-text3 flex-shrink-0">{plan.examType}</div>
                        </div>
                      );
                    })}
                    {group.femaleEntries.map(({ plan, entry }, idx) => {
                      const slot = enabledSlots.find(s => s.id === entry.slotId);
                      return (
                        <div key={`f${idx}`} className="flex items-center gap-3 px-4 py-2.5">
                          <span className="text-[0.55rem] px-1.5 py-0.5 rounded font-bold bg-pink-500/20 text-pink-400 flex-shrink-0">FAZ</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-[0.85rem] font-bold text-dark-text">{entry.room}</span>
                              {entry.rollFrom && <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-400/80 font-mono">{entry.rollFrom}{entry.rollTo ? ` – ${entry.rollTo}` : '+'}</span>}
                            </div>
                            <div className="text-[0.7rem] text-dark-text3">
                              <i className="fas fa-building mr-1"></i>{buildingName}
                              {slot && <> &bull; {slot.name} ({slot.startTime} – {slot.endTime})</>}
                            </div>
                          </div>
                          <div className="text-[0.65rem] text-dark-text3 flex-shrink-0">{plan.examType}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                );
              })}
            </div>
          ) : findTriggered ? (
            <div className="text-center py-8">
              <i className="fas fa-chair text-3xl text-dark-text3 mb-3 block"></i>
              <p className="text-[0.85rem] text-dark-text2">No exams found on this date</p>
              <p className="text-[0.72rem] text-dark-text3 mt-1">Check back later or contact your admin</p>
            </div>
          ) : (
            <div className="text-center py-8">
              <i className="fas fa-graduation-cap text-3xl text-dark-text3 mb-3 block"></i>
              <p className="text-[0.85rem] text-dark-text2">Select a date to see exam rooms</p>
            </div>
          )}

          {publishedPlans.length > 0 && (
            <div className="mt-6 pt-4 border-t border-dark-border">
              <h5 className="text-[0.82rem] font-semibold text-dark-text mb-3"><i className="fas fa-table text-qsis mr-1"></i>All Published Seat Plans</h5>
              {publishedPlans.map(plan => {
                const pDept = findDepartment(plan.department);
                return (
                  <div key={plan.id} className="mb-3 p-3 rounded-lg bg-dark-bg border border-dark-border">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="text-[0.82rem] font-bold text-dark-text">{plan.examType}</span>
                        <span className="text-[0.7rem] text-dark-text3 ml-2">{plan.session} &bull; {pDept?.department.shortName || plan.department}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 text-[0.6rem] font-semibold"><i className="fas fa-globe mr-0.5"></i>Published</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[0.72rem]">
                        <thead>
                          <tr className="border-b border-dark-border">
                            <th className="px-2 py-1.5 text-left font-semibold text-dark-text2">Semester</th>
                            <th className="px-2 py-1.5 text-left font-semibold text-dark-text2">Date</th>
                            <th className="px-2 py-1.5 text-left font-semibold text-dark-text2">Slot</th>
                            <th className="px-2 py-1.5 text-left font-semibold text-dark-text2">Room</th>
                            {showTeacher && <th className="px-2 py-1.5 text-left font-semibold text-dark-text2">Teacher</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {plan.entries.filter(e => e.room).sort((a, b) => {
                            const semA = config.semesters.findIndex(s => s.id === a.semester);
                            const semB = config.semesters.findIndex(s => s.id === b.semester);
                            if (semA !== semB) return semA - semB;
                            if (a.date !== b.date) return a.date.localeCompare(b.date);
                            const slotA = enabledSlots.findIndex(s => s.id === a.slotId);
                            const slotB = enabledSlots.findIndex(s => s.id === b.slotId);
                            return slotA - slotB;
                          }).map((entry, idx) => {
                            const semLabel = config.semesters.find(s => s.id === entry.semester)?.label || entry.semester;
                            const slotLabel = enabledSlots.find(s => s.id === entry.slotId)?.name || entry.slotId;
                            const isMale = entry.gender === 'male';
                            return (
                              <tr key={idx} className="border-b border-dark-border">
                                <td className="px-2 py-1.5">
                                  <span className="text-dark-text">{semLabel}</span>
                                  <span className={`ml-1 text-[0.5rem] px-1 py-0.5 rounded ${isMale ? 'bg-blue-500/20 text-blue-400' : 'bg-pink-500/20 text-pink-400'}`}>{isMale ? 'MAZ' : 'FAZ'}</span>
                                </td>
                                <td className="px-2 py-1.5 text-dark-text2">{entry.date ? new Date(entry.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
                                <td className="px-2 py-1.5 text-dark-text2">{slotLabel}</td>
                                <td className="px-2 py-1.5 font-semibold text-dark-text">{entry.room}</td>
                                {showTeacher && <td className="px-2 py-1.5 text-dark-text3">{entry.teacher || '—'}</td>}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
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
                <div className="flex items-center justify-between">
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
                  <div className="flex gap-2">
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
            <div className="bg-dark-bg2 border border-dark-border rounded-xl p-5 mt-4">
              <h4 className="text-[0.9rem] font-bold text-dark-text mb-3"><i className="fas fa-cog text-qsis mr-2"></i>Setup</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                <div>
                  <label className="text-[0.72rem] text-dark-text2 mb-1 block">Session</label>
                  <input value={sessionVal} onChange={e => setSessionVal(e.target.value)} placeholder="e.g. Spring - 2026" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" />
                </div>
                <div>
                  <label className="text-[0.72rem] text-dark-text2 mb-1 block">Department</label>
                  <CustomSelect value={department} onChange={setDepartment} options={FACULTIES.flatMap(f => f.departments.map(d => ({ value: d.id, label: `${d.shortName} — ${d.name}`, icon: 'fa-building', group: f.shortName })))} placeholder="Department" searchable size="md" />
                </div>
                <div>
                  <label className="text-[0.72rem] text-dark-text2 mb-1 block">Exam Type</label>
                  <CustomSelect value={examType} onChange={setExamType} options={EXAM_TYPES.map(t => ({ value: t, label: t, icon: 'fa-graduation-cap' }))} placeholder="Type" size="md" />
                </div>
              </div>
              <h5 className="text-[0.82rem] font-semibold text-dark-text mb-2"><i className="fas fa-calendar-alt text-qsis mr-1"></i>Exam Dates</h5>
              <div className="bg-dark-bg border border-dark-border rounded-lg p-3 mb-4">
                {dateInputs.map((d, idx) => (
                  <div key={idx} className="flex items-center gap-2 mb-2 last:mb-0">
                    <span className="text-[0.7rem] text-dark-text3 w-6">{idx + 1}.</span>
                    <input type="date" value={d} onChange={e => updateDateInput(idx, e.target.value)} className="flex-1 px-2 py-1.5 rounded border border-dark-border bg-dark-bg text-dark-text text-[0.78rem] outline-none focus:border-qsis" />
                    <button onClick={() => removeDateInput(idx)} disabled={dateInputs.length <= 1} className="text-red-400 hover:text-red-300 disabled:opacity-30 bg-transparent border-none cursor-pointer text-[0.68rem]"><i className="fas fa-trash"></i></button>
                  </div>
                ))}
                <button onClick={addDateInput} className="routine-btn mt-2"><i className="fas fa-plus mr-1"></i>Add Date</button>
              </div>
              <h5 className="text-[0.82rem] font-semibold text-dark-text mb-2"><i className="fas fa-graduation-cap text-qsis mr-1"></i>Semesters</h5>
              <p className="text-[0.68rem] text-dark-text3 mb-2">Uncheck to exclude from auto-fill. Manual entries still allowed.</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                {enabledSemesters.map(sem => {
                  const excluded = excludedSemesters.has(sem.id);
                  return (
                    <button
                      key={sem.id}
                      type="button"
                      onClick={() => setExcludedSemesters(prev => {
                        const next = new Set(prev);
                        if (next.has(sem.id)) next.delete(sem.id); else next.add(sem.id);
                        return next;
                      })}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${excluded ? 'bg-dark-bg border-dark-border text-dark-text3' : 'bg-qsis/10 border-qsis text-dark-text'}`}
                    >
                      <span className={`w-4 h-4 rounded border flex items-center justify-center text-[0.6rem] ${excluded ? 'border-dark-border bg-dark-bg' : 'bg-qsis border-qsis text-white'}`}>
                        {!excluded && <i className="fas fa-check"></i>}
                      </span>
                      <span className="text-[0.78rem] font-semibold">{sem.label}</span>
                      <span className="ml-auto flex gap-1">
                        <span className="text-[0.5rem] px-1 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold">MAZ</span>
                        <span className="text-[0.5rem] px-1 py-0.5 rounded bg-pink-500/20 text-pink-400 font-bold">FAZ</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-3 mb-4">
                <h5 className="text-[0.82rem] font-semibold text-dark-text"><i className="fas fa-users text-qsis mr-1"></i>Room Capacity</h5>
                <div className="flex items-center gap-2">
                  <input type="number" value={roomCapacity} onChange={e => setRoomCapacity(e.target.value)} min="1" placeholder="40" className="w-20 px-2 py-1 rounded border border-dark-border bg-dark-bg text-dark-text text-[0.78rem] outline-none focus:border-qsis text-center" />
                  <span className="text-[0.72rem] text-dark-text3">seats/room</span>
                </div>
              </div>
              {canManageBatches && (
              <>
              <h5 className="text-[0.82rem] font-semibold text-dark-text mb-2"><i className="fas fa-layer-group text-qsis mr-1"></i>Student Batches (Auto-Allocate)</h5>
              <p className="text-[0.68rem] text-dark-text3 mb-2">Define batches by roll ID prefix and range. Use auto-allocate in Step 2 to distribute students into rooms.</p>
              {batchConfigs.length > 0 && (
                <div className="space-y-2 mb-3">
                  {batchConfigs.map(b => {
                    const ids = generateRollIds(b);
                    const semLabel = config.semesters.find(s => s.id === b.semester)?.label || b.semester;
                    return (
                      <div key={b.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-dark-bg border border-dark-border">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[0.82rem] font-bold text-dark-text">{b.name}</span>
                            <span className="text-[0.65rem] px-1.5 py-0.5 rounded bg-qsis/15 text-qsis font-mono">{b.prefix}***</span>
                            <span className="text-[0.65rem] text-dark-text3">{ids.length} students</span>
                          </div>
                          <div className="text-[0.68rem] text-dark-text3 mt-0.5">
                            Roll: {b.rollStart}–{b.rollEnd} &bull; {semLabel}
                            {b.excludeRolls && <span className="ml-1 text-red-400/70">(excl: {b.excludeRolls})</span>}
                          </div>
                        </div>
                        <button onClick={() => { autoAllocateFromBatch(b.id); }} className="text-[0.68rem] px-2 py-1 rounded bg-green-500/15 text-green-400 hover:bg-green-500/25 border-none cursor-pointer font-medium"><i className="fas fa-magic mr-0.5"></i>Allocate</button>
                        <button onClick={() => removeBatch(b.id)} className="text-red-400 hover:text-red-300 bg-transparent border-none cursor-pointer text-[0.65rem]"><i className="fas fa-trash"></i></button>
                      </div>
                    );
                  })}
                </div>
              )}
              {showBatchForm ? (
                <div className="p-3 rounded-lg bg-dark-bg border border-dark-border mb-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                    <input value={batchName} onChange={e => setBatchName(e.target.value)} placeholder="Batch name (e.g. Q23)" className="px-2 py-1.5 rounded border border-dark-border bg-dark-bg2 text-dark-text text-[0.78rem] outline-none focus:border-qsis" />
                    <input value={batchPrefix} onChange={e => setBatchPrefix(e.target.value)} placeholder="Prefix (e.g. Q23)" className="px-2 py-1.5 rounded border border-dark-border bg-dark-bg2 text-dark-text text-[0.78rem] outline-none focus:border-qsis" />
                    <input value={batchRollStart} onChange={e => setBatchRollStart(e.target.value)} placeholder="Roll start (e.g. 1)" className="px-2 py-1.5 rounded border border-dark-border bg-dark-bg2 text-dark-text text-[0.78rem] outline-none focus:border-qsis" />
                    <input value={batchRollEnd} onChange={e => setBatchRollEnd(e.target.value)} placeholder="Roll end (e.g. 99)" className="px-2 py-1.5 rounded border border-dark-border bg-dark-bg2 text-dark-text text-[0.78rem] outline-none focus:border-qsis" />
                  </div>
                  <input value={batchExcludeRolls} onChange={e => setBatchExcludeRolls(e.target.value)} placeholder="Exclude rolls (comma separated, e.g. Q23005,Q23010)" className="w-full px-2 py-1.5 rounded border border-dark-border bg-dark-bg2 text-dark-text text-[0.78rem] outline-none focus:border-qsis mb-2" />
                  <div className="flex gap-2">
                    <button onClick={addBatch} className="routine-btn routine-btn-primary text-[0.72rem]"><i className="fas fa-check mr-1"></i>Save Batch</button>
                    <button onClick={() => setShowBatchForm(false)} className="routine-btn text-[0.72rem]">Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowBatchForm(true)} className="routine-btn mb-4"><i className="fas fa-plus mr-1"></i>Add Batch</button>
              )}
              </>
              )}
              <div className="flex justify-end">
                <button onClick={() => { if (dateInputs.filter(d => d.trim()).length === 0) { showToast('Add dates first', 'error'); return; } setEntries([]); setBuilderStep(2); }} className="routine-btn routine-btn-primary"><i className="fas fa-arrow-right mr-1"></i>Next: Assign Rooms</button>
              </div>
            </div>
          )}

          {builderStep === 2 && (
            <div className="bg-dark-bg2 border border-dark-border rounded-xl p-5 mt-4">
              <h4 className="text-[0.9rem] font-bold text-dark-text mb-1"><i className="fas fa-door-open text-qsis mr-2"></i>Assign Rooms & Teachers</h4>
              <p className="text-[0.72rem] text-dark-text3 mb-3">Assign a room and teacher for each semester, date, and time slot.</p>
              {teacherConflicts.size > 0 && (
                <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-[0.78rem] text-red-400 font-medium">
                  <i className="fas fa-exclamation-triangle mr-1.5"></i>
                  {teacherConflicts.size} teacher conflict(s) found — same teacher assigned to multiple rooms on the same date & slot.
                </div>
              )}
              {rollConflicts.size > 0 && (
                <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-[0.78rem] text-red-400 font-medium">
                  <i className="fas fa-exclamation-triangle mr-1.5"></i>
                  {rollConflicts.size} roll range conflict(s) found — overlapping roll IDs assigned to multiple rooms on the same date & slot.
                </div>
              )}
              <button onClick={autoPopulateEntries} className="routine-btn routine-btn-accent mb-4"><i className="fas fa-magic mr-1"></i>Auto-fill All</button>
              {dateInputs.filter(d => d.trim()).map((dateVal, dateIdx) => {
                const dayName = DAYS[(new Date(dateVal + 'T00:00:00').getDay() + 1) % 7] || '';
                return (
                  <div key={dateIdx} className="mb-5 p-4 rounded-xl bg-dark-bg border border-dark-border">
                    <div className="flex items-center gap-3 mb-3 pb-2 border-b border-dark-border">
                      <i className="fas fa-calendar-day text-qsis"></i>
                      <span className="text-[0.9rem] font-bold text-dark-text">{new Date(dateVal + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      <span className="text-[0.72rem] text-dark-text3">{dayName}</span>
                    </div>
                    {enabledSlots.map(slot => (
                      <div key={slot.id} className="mb-3 last:mb-0">
                        <div className="text-[0.72rem] font-semibold text-dark-text2 mb-2 flex items-center gap-2">
                          <i className="fas fa-clock text-qsis"></i> {slot.name} <span className="text-dark-text3 font-normal">({slot.startTime} – {slot.endTime})</span>
                        </div>
                        <div className="space-y-1">
                          {enabledSemesters.filter(sem => !excludedSemesters.has(sem.id)).map(sem => {
                            const semMaleEntries = entries.filter(e => e.semester === sem.id && e.date === dateVal && e.slotId === slot.id && e.gender === 'male');
                            const semFemaleEntries = entries.filter(e => e.semester === sem.id && e.date === dateVal && e.slotId === slot.id && e.gender === 'female');
                            const hasConflict = [...semMaleEntries, ...semFemaleEntries].some((_, i, arr) => {
                              const idx = entries.indexOf(arr[i]);
                              return teacherConflicts.has(idx) || rollConflicts.has(idx);
                            });
                            return (
                              <div key={sem.id} className={`p-2 rounded-lg border bg-dark-bg2 ${hasConflict ? 'border-red-500/50' : 'border-dark-border'}`}>
                                <div className="text-[0.72rem] font-semibold text-dark-text2 mb-1.5 flex items-center justify-between">
                                  <span>{sem.label}</span>
                                  {hasConflict && <span className="text-[0.55rem] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-bold"><i className="fas fa-exclamation-triangle mr-0.5"></i>Conflict</span>}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div>
                                    <div className="flex items-center gap-1 mb-1">
                                      <span className="text-[0.55rem] px-1.5 py-0.5 rounded font-bold bg-blue-500/20 text-blue-400">MAZ</span>
                                    </div>
                                    <div className="space-y-1.5">
                                      {semMaleEntries.map((entry) => {
                                        const idx = entries.indexOf(entry);
                                        const isConflict = teacherConflicts.has(idx) || rollConflicts.has(idx);
                                        const rollCount = getRollCount(entry.rollFrom, entry.rollTo);
                                        return (
                                          <div key={idx} className={`flex items-center gap-1 p-1.5 rounded border ${isConflict ? 'border-red-500/40 bg-red-500/5' : 'border-dark-border bg-dark-bg'}`}>
                                            <input value={entry.room} onChange={e => updateEntry(idx, 'room', e.target.value)} placeholder="Room" className="w-16 px-1.5 py-0.5 rounded border border-blue-500/30 bg-dark-bg text-dark-text text-[0.7rem] outline-none focus:border-blue-400" />
                                            <TeacherAutocomplete value={entry.teacher} onChange={val => updateEntry(idx, 'teacher', val)} department={department} placeholder="Teacher" />
                                            <input value={entry.rollFrom} onChange={e => updateEntry(idx, 'rollFrom', e.target.value)} placeholder="From" className="w-16 px-1.5 py-0.5 rounded border border-blue-500/30 bg-dark-bg text-dark-text text-[0.7rem] outline-none focus:border-blue-400" />
                                            <span className="text-dark-text3 text-[0.6rem]">–</span>
                                            <input value={entry.rollTo} onChange={e => updateEntry(idx, 'rollTo', e.target.value)} placeholder="To" className="w-16 px-1.5 py-0.5 rounded border border-blue-500/30 bg-dark-bg text-dark-text text-[0.7rem] outline-none focus:border-blue-400" />
                                            {entry.rollFrom && <span className="text-[0.55rem] text-dark-text3 whitespace-nowrap">{rollCount}std</span>}
                                            <button onClick={() => removeEntry(idx)} className="text-red-400 hover:text-red-300 bg-transparent border-none cursor-pointer text-[0.6rem] flex-shrink-0"><i className="fas fa-times"></i></button>
                                          </div>
                                        );
                                      })}
                                      <button onClick={() => addEntry(sem.id, dateVal, slot.id, 'male')} className="text-[0.65rem] text-blue-400 hover:text-blue-300 bg-transparent border-none cursor-pointer"><i className="fas fa-plus mr-0.5"></i>Add Room</button>
                                    </div>
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-1 mb-1">
                                      <span className="text-[0.55rem] px-1.5 py-0.5 rounded font-bold bg-pink-500/20 text-pink-400">FAZ</span>
                                    </div>
                                    <div className="space-y-1.5">
                                      {semFemaleEntries.map((entry) => {
                                        const idx = entries.indexOf(entry);
                                        const isConflict = teacherConflicts.has(idx) || rollConflicts.has(idx);
                                        const rollCount = getRollCount(entry.rollFrom, entry.rollTo);
                                        return (
                                          <div key={idx} className={`flex items-center gap-1 p-1.5 rounded border ${isConflict ? 'border-red-500/40 bg-red-500/5' : 'border-dark-border bg-dark-bg'}`}>
                                            <input value={entry.room} onChange={e => updateEntry(idx, 'room', e.target.value)} placeholder="Room" className="w-16 px-1.5 py-0.5 rounded border border-pink-500/30 bg-dark-bg text-dark-text text-[0.7rem] outline-none focus:border-pink-400" />
                                            <TeacherAutocomplete value={entry.teacher} onChange={val => updateEntry(idx, 'teacher', val)} department={department} placeholder="Teacher" />
                                            <input value={entry.rollFrom} onChange={e => updateEntry(idx, 'rollFrom', e.target.value)} placeholder="From" className="w-16 px-1.5 py-0.5 rounded border border-pink-500/30 bg-dark-bg text-dark-text text-[0.7rem] outline-none focus:border-pink-400" />
                                            <span className="text-dark-text3 text-[0.6rem]">–</span>
                                            <input value={entry.rollTo} onChange={e => updateEntry(idx, 'rollTo', e.target.value)} placeholder="To" className="w-16 px-1.5 py-0.5 rounded border border-pink-500/30 bg-dark-bg text-dark-text text-[0.7rem] outline-none focus:border-pink-400" />
                                            {entry.rollFrom && <span className="text-[0.55rem] text-dark-text3 whitespace-nowrap">{rollCount}std</span>}
                                            <button onClick={() => removeEntry(idx)} className="text-red-400 hover:text-red-300 bg-transparent border-none cursor-pointer text-[0.6rem] flex-shrink-0"><i className="fas fa-times"></i></button>
                                          </div>
                                        );
                                      })}
                                      <button onClick={() => addEntry(sem.id, dateVal, slot.id, 'female')} className="text-[0.65rem] text-pink-400 hover:text-pink-300 bg-transparent border-none cursor-pointer"><i className="fas fa-plus mr-0.5"></i>Add Room</button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
              {dateInputs.filter(d => d.trim()).length === 0 && (
                <div className="text-center py-8 text-dark-text3"><i className="fas fa-calendar-plus text-2xl mb-2 block"></i><p className="text-[0.82rem]">Add dates in Step 1 first</p></div>
              )}
              <div className="flex justify-between mt-4">
                <button onClick={() => setBuilderStep(1)} className="routine-btn"><i className="fas fa-arrow-left mr-1"></i>Back</button>
                <button onClick={() => { if (summaryRows.length === 0) { showToast('Add room assignments', 'error'); return; } setBuilderStep(3); }} className="routine-btn routine-btn-primary"><i className="fas fa-arrow-right mr-1"></i>Next: Review</button>
              </div>
            </div>
          )}

          {builderStep === 3 && (
            <div className="bg-dark-bg2 border border-dark-border rounded-xl p-5 mt-4">
              <h4 className="text-[0.9rem] font-bold text-dark-text mb-1"><i className="fas fa-check-circle text-qsis mr-2"></i>Review & Publish</h4>
              <div className="overflow-x-auto mb-4">
                <table className="w-full border-collapse">
                  <thead><tr>
                    <th className="px-3 py-2 text-left text-[0.72rem] font-semibold text-dark-text2 border-b border-dark-border">Semester</th>
                    <th className="px-3 py-2 text-left text-[0.72rem] font-semibold text-dark-text2 border-b border-dark-border">Date</th>
                    <th className="px-3 py-2 text-left text-[0.72rem] font-semibold text-dark-text2 border-b border-dark-border">Slot</th>
                    <th className="px-3 py-2 text-left text-[0.72rem] font-semibold text-dark-text2 border-b border-dark-border">Room</th>
                    <th className="px-3 py-2 text-left text-[0.72rem] font-semibold text-dark-text2 border-b border-dark-border">Roll Range</th>
                    {showTeacher && <th className="px-3 py-2 text-left text-[0.72rem] font-semibold text-dark-text2 border-b border-dark-border">Teacher</th>}
                  </tr></thead>
                  <tbody>
                    {summaryRows.map((row, idx) => {
                      const semLabel = config.semesters.find(s => s.id === row.semester)?.label || row.semester;
                      const slotLabel = enabledSlots.find(s => s.id === row.slotId)?.name || row.slotId;
                      const isMale = row.gender === 'male';
                      return (
                        <tr key={idx} className="border-b border-dark-border">
                          <td className="px-3 py-2"><span className="text-dark-text">{semLabel}</span><span className={`ml-1.5 text-[0.55rem] px-1.5 py-0.5 rounded ${isMale ? 'bg-blue-500/20 text-blue-400' : 'bg-pink-500/20 text-pink-400'}`}>{isMale ? 'MAZ' : 'FAZ'}</span></td>
                          <td className="px-3 py-2 text-[0.78rem] text-dark-text">{row.date ? new Date(row.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
                          <td className="px-3 py-2 text-[0.78rem] text-dark-text2">{slotLabel}</td>
                          <td className="px-3 py-2 text-[0.78rem] font-semibold text-dark-text">{row.room || '—'}</td>
                          <td className="px-3 py-2 text-[0.72rem] text-dark-text3">{row.rollFrom && row.rollTo ? `${row.rollFrom} – ${row.rollTo}` : row.rollFrom ? `${row.rollFrom}+` : '—'}</td>
                          {showTeacher && <td className="px-3 py-2 text-[0.78rem] text-dark-text2">{row.teacher || '—'}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between mt-4">
                <button onClick={() => setBuilderStep(2)} className="routine-btn"><i className="fas fa-arrow-left mr-1"></i>Back</button>
                <div className="relative">
                  <button onClick={e => { e.stopPropagation(); setShowPublishMenu(!showPublishMenu); }} className="routine-btn routine-btn-primary" disabled={summaryRows.length === 0}>
                    <i className="fas fa-share-alt mr-1"></i>Save / Publish ({summaryRows.length}) <i className="fas fa-caret-down ml-1"></i>
                  </button>
                  {showPublishMenu && (
                    <div className="absolute right-0 bottom-full mb-1 bg-dark-bg2 border border-dark-border rounded-lg shadow-xl z-50 py-1 min-w-[220px]">
                      <button onClick={e => { e.stopPropagation(); handleSaveDraft(); }} className="w-full text-left px-3 py-2 text-[0.8rem] text-dark-text hover:bg-dark-bg3 flex items-center gap-2"><i className="fas fa-file-alt text-yellow-400"></i>Save as Draft<span className="text-[0.65rem] text-dark-text3 ml-auto">Local</span></button>
                      <div className="border-t border-dark-border my-0.5"></div>
                      <button onClick={e => { e.stopPropagation(); handleSaveToCloud(); }} className="w-full text-left px-3 py-2 text-[0.8rem] text-dark-text hover:bg-dark-bg3 flex items-center gap-2"><i className="fas fa-cloud text-blue-400"></i>Save to Cloud<span className="text-[0.65rem] text-dark-text3 ml-auto">Private</span></button>
                      <button onClick={e => { e.stopPropagation(); handlePublish(); }} className="w-full text-left px-3 py-2 text-[0.8rem] text-dark-text hover:bg-dark-bg3 flex items-center gap-2"><i className="fas fa-globe text-green-400"></i>Publish<span className="text-[0.65rem] text-dark-text3 ml-auto">Public</span></button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {<ConfirmModal />}
    </section>
  );
}
