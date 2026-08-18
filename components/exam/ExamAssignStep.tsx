'use client';

import { ExamRow, ExamAllSemesterSem } from './types';
import { ExamSlot } from '@/lib/exam-routine-config';

interface ExamAssignStepProps {
  rows: ExamRow[];
  setRows: React.Dispatch<React.SetStateAction<ExamRow[]>>;
  enabledSlots: ExamSlot[];
  enabledSemesters: ExamAllSemesterSem[];
  semLabels: Record<string, string>;
  totalSections: number;
  showPublishMenu: boolean;
  setShowPublishMenu: (v: boolean) => void;
  handleSaveDraftAll: () => void;
  handleSaveToCloudAll: () => void;
  handlePublishAll: () => void;
  onBack: () => void;
}

export default function ExamAssignStep({
  rows, setRows, enabledSlots, enabledSemesters, semLabels,
  totalSections, showPublishMenu, setShowPublishMenu,
  handleSaveDraftAll, handleSaveToCloudAll, handlePublishAll, onBack,
}: ExamAssignStepProps) {
  return (
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
        <button onClick={onBack} className="routine-btn"><i className="fas fa-arrow-left mr-1"></i>Back</button>
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
  );
}
