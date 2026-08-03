'use client';

import { useMemo } from 'react';
import TeacherTagInput from '@/components/TeacherTagInput';
import { SeatPlanEntry } from './types';
import { getRollCount, DAYS } from './types';

interface SeatGridProps {
  entries: SeatPlanEntry[];
  setEntries: React.Dispatch<React.SetStateAction<SeatPlanEntry[]>>;
  dateInputs: string[];
  enabledSlots: { id: string; name: string; startTime: string; endTime: string }[];
  enabledSemesters: { id: string; label: string }[];
  excludedSemesters: Set<string>;
  department: string;
  teacherConflicts: Set<number>;
  rollConflicts: Set<number>;
  roomsByGender: { male: string[]; female: string[] };
  setBuilderStep: (step: 1 | 2 | 3) => void;
}

export default function SeatGrid({
  entries, setEntries,
  dateInputs, enabledSlots, enabledSemesters, excludedSemesters,
  department, teacherConflicts, rollConflicts, roomsByGender,
  setBuilderStep,
}: SeatGridProps) {
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
    if (dates.length === 0) { return; }
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
    if (newEntries.length > 0) { setEntries(prev => [...prev, ...newEntries]); }
  }

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

  return (
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
                                    <div className="relative">
                                      <input value={entry.room} onChange={e => updateEntry(idx, 'room', e.target.value)} onFocus={e => (e.target as HTMLInputElement).select()} placeholder="Room" className="w-16 px-1.5 py-0.5 rounded border border-blue-500/30 bg-dark-bg text-dark-text text-[0.7rem] outline-none focus:border-blue-400" list={`maz-rooms-${idx}`} autoComplete="off" />
                                      <datalist id={`maz-rooms-${idx}`}>
                                        {roomsByGender.male.filter(r => r !== entry.room).map(r => <option key={r} value={r} />)}
                                      </datalist>
                                    </div>
                                    <TeacherTagInput value={entry.teacher} onChange={val => updateEntry(idx, 'teacher', val)} department={department} placeholder="Teacher" className="flex-1 min-w-0" />
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
                                    <div className="relative">
                                      <input value={entry.room} onChange={e => updateEntry(idx, 'room', e.target.value)} onFocus={e => (e.target as HTMLInputElement).select()} placeholder="Room" className="w-16 px-1.5 py-0.5 rounded border border-pink-500/30 bg-dark-bg text-dark-text text-[0.7rem] outline-none focus:border-pink-400" list={`faz-rooms-${idx}`} autoComplete="off" />
                                      <datalist id={`faz-rooms-${idx}`}>
                                        {roomsByGender.female.filter(r => r !== entry.room).map(r => <option key={r} value={r} />)}
                                      </datalist>
                                    </div>
                                    <TeacherTagInput value={entry.teacher} onChange={val => updateEntry(idx, 'teacher', val)} department={department} placeholder="Teacher" className="flex-1 min-w-0" />
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

      <div className="flex flex-wrap gap-2 justify-between mt-4">
        <button onClick={() => setBuilderStep(1)} className="routine-btn"><i className="fas fa-arrow-left mr-1"></i>Back</button>
        <button onClick={() => { if (summaryRows.length === 0) { return; } setBuilderStep(3); }} className="routine-btn routine-btn-primary"><i className="fas fa-arrow-right mr-1"></i>Next: Review</button>
      </div>
    </div>
  );
}
