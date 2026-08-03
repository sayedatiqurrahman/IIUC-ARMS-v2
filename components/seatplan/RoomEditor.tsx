'use client';

import { useState } from 'react';
import { config } from '@/lib/config';
import { showToast } from '@/lib/utils';
import CustomSelect from '@/components/CustomSelect';
import { FACULTIES } from '@/lib/departments';
import {
  BatchConfig, EXAM_TYPES, SEM_GENDER_MAP,
  generateRollIds,
} from './types';

interface RoomEditorProps {
  sessionVal: string;
  setSessionVal: (v: string) => void;
  department: string;
  setDepartment: (v: string) => void;
  examType: string;
  setExamType: (v: string) => void;
  dateInputs: string[];
  setDateInputs: React.Dispatch<React.SetStateAction<string[]>>;
  excludedSemesters: Set<string>;
  setExcludedSemesters: React.Dispatch<React.SetStateAction<Set<string>>>;
  roomCapacity: string;
  setRoomCapacity: (v: string) => void;
  batchConfigs: BatchConfig[];
  setBatchConfigs: (configs: BatchConfig[]) => void;
  enabledSemesters: { id: string; label: string }[];
  canManageBatches: boolean;
  profile: { semester?: string; department?: string };
  departmentValue: string;
  entries: { semester: string; date: string; slotId: string; room: string; gender: string }[];
  setEntries: React.Dispatch<React.SetStateAction<any[]>>;
  enabledSlots: { id: string; name: string; startTime: string; endTime: string }[];
  setBuilderStep: (step: 1 | 2 | 3) => void;
}

export default function RoomEditor({
  sessionVal, setSessionVal,
  department, setDepartment,
  examType, setExamType,
  dateInputs, setDateInputs,
  excludedSemesters, setExcludedSemesters,
  roomCapacity, setRoomCapacity,
  batchConfigs, setBatchConfigs,
  enabledSemesters, canManageBatches,
  profile, departmentValue,
  setEntries, enabledSlots, setBuilderStep,
}: RoomEditorProps) {
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [batchName, setBatchName] = useState('');
  const [batchPrefix, setBatchPrefix] = useState('');
  const [batchRollStart, setBatchRollStart] = useState('');
  const [batchRollEnd, setBatchRollEnd] = useState('');
  const [batchExcludeRolls, setBatchExcludeRolls] = useState('');

  function addDateInput() { setDateInputs(prev => [...prev, '']); }
  function removeDateInput(idx: number) { if (dateInputs.length > 1) setDateInputs(prev => prev.filter((_, i) => i !== idx)); }
  function updateDateInput(idx: number, val: string) { setDateInputs(prev => prev.map((d, i) => i === idx ? val : d)); }

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
      department: departmentValue,
      createdAt: Date.now(),
      lastPromoted: Date.now(),
    };
    setBatchConfigs([...batchConfigs, newBatch]);
    setBatchName(''); setBatchPrefix(''); setBatchRollStart(''); setBatchRollEnd(''); setBatchExcludeRolls('');
    setShowBatchForm(false);
    showToast('Batch added', 'success');
  }

  function removeBatch(id: string) {
    setBatchConfigs(batchConfigs.filter(b => b.id !== id));
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
    const newEntries: any[] = [];
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
    setEntries((prev: any[]) => [...prev, ...newEntries]);
    showToast(`Allocated ${rollIds.length} students into ${Math.ceil(rollIds.length / (parseInt(roomCapacity) || 40))} rooms per slot`, 'success');
  }

  return (
    <div className="bg-dark-bg2 border border-dark-border rounded-xl p-5 mt-4">
      <h4 className="text-[0.9rem] font-bold text-dark-text mb-3"><i className="fas fa-cog text-qsis mr-2"></i>Setup</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-4">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 mb-4">
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
                    <button onClick={() => autoAllocateFromBatch(b.id)} className="text-[0.68rem] px-2 py-1 rounded bg-green-500/15 text-green-400 hover:bg-green-500/25 border-none cursor-pointer font-medium"><i className="fas fa-magic mr-0.5"></i>Allocate</button>
                    <button onClick={() => removeBatch(b.id)} className="text-red-400 hover:text-red-300 bg-transparent border-none cursor-pointer text-[0.65rem]"><i className="fas fa-trash"></i></button>
                  </div>
                );
              })}
            </div>
          )}
          {showBatchForm ? (
            <div className="p-3 rounded-lg bg-dark-bg border border-dark-border mb-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 mb-2">
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
  );
}
