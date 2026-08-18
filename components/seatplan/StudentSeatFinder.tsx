'use client';

import { RefObject } from 'react';
import { config } from '@/lib/config';
import CustomSelect from '@/components/CustomSelect';
import { FACULTIES, findDepartment } from '@/lib/departments';
import { SeatPlanDraft, StudentResultGroup } from './types';

interface StudentSeatFinderProps {
  studentDept: string;
  setStudentDept: (v: string) => void;
  studentSemester: string;
  setStudentSemester: (v: string) => void;
  studentDate: string;
  setStudentDate: (v: string) => void;
  studentGender: string;
  setStudentGender: (v: string) => void;
  studentRoll: string;
  setStudentRoll: (v: string) => void;
  findTriggered: boolean;
  setFindTriggered: (v: boolean) => void;
  studentResults: StudentResultGroup[];
  publishedPlans: SeatPlanDraft[];
  enabledSlots: { id: string; name: string; startTime: string; endTime: string }[];
  showTeacher: boolean;
  rollIdRef: RefObject<HTMLInputElement | null>;
}

export default function StudentSeatFinder({
  studentDept, setStudentDept,
  studentSemester, setStudentSemester,
  studentDate, setStudentDate,
  studentGender, setStudentGender,
  studentRoll, setStudentRoll,
  findTriggered, setFindTriggered,
  studentResults, publishedPlans, enabledSlots, showTeacher,
  rollIdRef,
}: StudentSeatFinderProps) {
  return (
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
  );
}
