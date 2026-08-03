'use client';

import { config } from '@/lib/config';
import { SeatPlanEntry } from './types';

interface SeatPlanPrintViewProps {
  entries: SeatPlanEntry[];
  showTeacher: boolean;
  enabledSlots: { id: string; name: string; startTime: string; endTime: string }[];
  setBuilderStep: (step: 1 | 2 | 3) => void;
  showPublishMenu: boolean;
  setShowPublishMenu: (v: boolean) => void;
  summaryRows: SeatPlanEntry[];
  onSaveDraft: () => void;
  onSaveToCloud: () => void;
  onPublish: () => void;
}

export default function SeatPlanPrintView({
  entries, showTeacher, enabledSlots,
  setBuilderStep, showPublishMenu, setShowPublishMenu,
  summaryRows, onSaveDraft, onSaveToCloud, onPublish,
}: SeatPlanPrintViewProps) {
  return (
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
      <div className="flex flex-wrap items-center gap-2 justify-between mt-4">
        <button onClick={() => setBuilderStep(2)} className="routine-btn"><i className="fas fa-arrow-left mr-1"></i>Back</button>
        <div className="relative">
          <button onClick={e => { e.stopPropagation(); setShowPublishMenu(!showPublishMenu); }} className="routine-btn routine-btn-primary" disabled={summaryRows.length === 0}>
            <i className="fas fa-share-alt mr-1"></i>Save / Publish ({summaryRows.length}) <i className="fas fa-caret-down ml-1"></i>
          </button>
          {showPublishMenu && (
            <div className="absolute right-0 bottom-full mb-1 bg-dark-bg2 border border-dark-border rounded-lg shadow-xl z-50 py-1 min-w-[220px]">
              <button onClick={e => { e.stopPropagation(); onSaveDraft(); }} className="w-full text-left px-3 py-2 text-[0.8rem] text-dark-text hover:bg-dark-bg3 flex items-center gap-2"><i className="fas fa-file-alt text-yellow-400"></i>Save as Draft<span className="text-[0.65rem] text-dark-text3 ml-auto">Local</span></button>
              <div className="border-t border-dark-border my-0.5"></div>
              <button onClick={e => { e.stopPropagation(); onSaveToCloud(); }} className="w-full text-left px-3 py-2 text-[0.8rem] text-dark-text hover:bg-dark-bg3 flex items-center gap-2"><i className="fas fa-cloud text-blue-400"></i>Save to Cloud<span className="text-[0.65rem] text-dark-text3 ml-auto">Private</span></button>
              <button onClick={e => { e.stopPropagation(); onPublish(); }} className="w-full text-left px-3 py-2 text-[0.8rem] text-dark-text hover:bg-dark-bg3 flex items-center gap-2"><i className="fas fa-globe text-green-400"></i>Publish<span className="text-[0.65rem] text-dark-text3 ml-auto">Public</span></button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
