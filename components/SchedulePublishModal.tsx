'use client';

import { useState } from 'react';

interface SchedulePublishModalProps {
  title: string;
  description?: string;
  onPublishNow: () => void;
  onSchedule: (scheduledAt: string) => void;
  onClose: () => void;
}

export default function SchedulePublishModal({ title, description, onPublishNow, onSchedule, onClose }: SchedulePublishModalProps) {
  const [mode, setMode] = useState<'now' | 'schedule'>('now');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');

  const minDateTime = (() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5);
    return now.toISOString().slice(0, 16);
  })();

  const handlePublish = () => {
    if (mode === 'now') {
      onPublishNow();
    } else {
      if (!date || !time) return;
      const dt = new Date(`${date}T${time}`);
      if (dt <= new Date()) return;
      onSchedule(dt.toISOString());
    }
  };

  const isValid = mode === 'now' || (date && time && new Date(`${date}T${time}`) > new Date());

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-dark-border bg-dark-bg2 p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[0.92rem] font-bold text-dark-text flex items-center gap-2">
            <i className="fas fa-share-alt text-qsis"></i> {title}
          </h3>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-dark-bg3 flex items-center justify-center text-dark-text2 border-none cursor-pointer">
            <i className="fas fa-times text-xs"></i>
          </button>
        </div>

        {description && <p className="text-[0.75rem] text-dark-text3 mb-3">{description}</p>}

        {/* Mode toggle */}
        <div className="flex gap-2 mb-4">
          <button onClick={() => setMode('now')}
            className={`flex-1 py-2.5 rounded-xl text-[0.8rem] font-semibold border cursor-pointer transition ${mode === 'now' ? 'bg-qsis/15 border-qsis/30 text-qsis' : 'bg-dark-bg3 border-dark-border text-dark-text2 hover:border-qsis/20'}`}>
            <i className="fas fa-bolt mr-1.5"></i>Publish Now
          </button>
          <button onClick={() => setMode('schedule')}
            className={`flex-1 py-2.5 rounded-xl text-[0.8rem] font-semibold border cursor-pointer transition ${mode === 'schedule' ? 'bg-qsis/15 border-qsis/30 text-qsis' : 'bg-dark-bg3 border-dark-border text-dark-text2 hover:border-qsis/20'}`}>
            <i className="fas fa-clock mr-1.5"></i>Schedule
          </button>
        </div>

        {/* Schedule inputs */}
        {mode === 'schedule' && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-[0.7rem] font-medium text-dark-text2 mb-1">Date</label>
              <input type="date" value={date} min={minDateTime.slice(0, 10)} onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-dark-bg3 border border-dark-border text-[0.82rem] text-dark-text focus:border-qsis outline-none" />
            </div>
            <div>
              <label className="block text-[0.7rem] font-medium text-dark-text2 mb-1">Time</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-dark-bg3 border border-dark-border text-[0.82rem] text-dark-text focus:border-qsis outline-none" />
            </div>
          </div>
        )}

        {mode === 'schedule' && date && time && (
          <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-[0.72rem] text-blue-400 mb-4">
            <i className="fas fa-info-circle mr-1"></i>
            Will auto-publish on <strong>{new Date(`${date}T${time}`).toLocaleString()}</strong> via cron job.
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={handlePublish} disabled={!isValid}
            className="flex-1 py-2.5 rounded-xl bg-qsis text-white text-[0.82rem] font-semibold hover:brightness-110 transition cursor-pointer disabled:opacity-50">
            {mode === 'now' ? <><i className="fas fa-share-alt mr-1"></i>Publish Now</> : <><i className="fas fa-clock mr-1"></i>Schedule Publish</>}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-dark-bg3 border border-dark-border text-dark-text2 text-[0.82rem] hover:text-dark-text cursor-pointer">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
