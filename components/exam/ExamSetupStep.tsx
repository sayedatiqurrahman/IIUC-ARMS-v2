'use client';

import { ExamRow, ExamAllSemesterSem, DAYS, EXAM_TYPES } from './types';
import { config } from '@/lib/config';
import CustomSelect from '@/components/CustomSelect';
import { FACULTIES } from '@/lib/departments';

interface ExamSetupStepProps {
  sessionVal: string;
  setSessionVal: (v: string) => void;
  department: string;
  setDepartment: (v: string) => void;
  examType: string;
  setExamType: (v: string) => void;
  draftGender: 'male' | 'female' | 'both';
  setDraftGender: (v: 'male' | 'female' | 'both') => void;
  rows: ExamRow[];
  updateRow: (idx: number, field: keyof ExamRow, value: string) => void;
  addRow: () => void;
  removeRow: (idx: number) => void;
  semesters: ExamAllSemesterSem[];
  toggleSemester: (idx: number) => void;
  onNext: () => void;
}

export default function ExamSetupStep({
  sessionVal, setSessionVal, department, setDepartment,
  examType, setExamType, draftGender, setDraftGender,
  rows, updateRow, addRow, removeRow,
  semesters, toggleSemester, onNext,
}: ExamSetupStepProps) {
  return (
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
        <button onClick={onNext} className="routine-btn routine-btn-primary"><i className="fas fa-arrow-right mr-1"></i>Next: Courses</button>
      </div>
    </div>
  );
}
