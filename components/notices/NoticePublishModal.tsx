'use client';

import { useState } from 'react';

export interface NoticePublishOptions {
  telegramTargets: ('channel' | 'group' | 'personal')[];
  scheduledAt?: string;
}

interface NoticePublishModalProps {
  onPublish: (options: NoticePublishOptions) => void;
  onClose: () => void;
}

export default function NoticePublishModal({ onPublish, onClose }: NoticePublishModalProps) {
  const [mode, setMode] = useState<'now' | 'schedule'>('now');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [targets, setTargets] = useState<{ channel: boolean; group: boolean; personal: boolean }>({
    channel: true,
    group: true,
    personal: true,
  });

  const minDateTime = (() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5);
    return now.toISOString().slice(0, 16);
  })();

  const toggleTarget = (key: 'channel' | 'group' | 'personal') => {
    setTargets(t => ({ ...t, [key]: !t[key] }));
  };

  const selectedTargets = (['channel', 'group', 'personal'] as const).filter(k => targets[k]);

  const handlePublish = () => {
    const opts: NoticePublishOptions = { telegramTargets: selectedTargets };
    if (mode === 'schedule' && date && time) {
      const dt = new Date(`${date}T${time}`);
      if (dt > new Date()) opts.scheduledAt = dt.toISOString();
    }
    onPublish(opts);
  };

  const canSubmit = selectedTargets.length > 0 && (mode === 'now' || (date && time && new Date(`${date}T${time}`) > new Date()));

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-dark-border bg-dark-bg2 p-5" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[0.92rem] font-bold text-dark-text flex items-center gap-2">
            <i className="fas fa-share-alt text-qsis"></i> Publish Notice
          </h3>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-dark-bg3 flex items-center justify-center text-dark-text2 border-none cursor-pointer">
            <i className="fas fa-times text-xs"></i>
          </button>
        </div>

        {/* Telegram Destinations */}
        <div className="mb-4">
          <label className="block text-[0.75rem] font-medium text-dark-text2 mb-2">
            <i className="fab fa-telegram mr-1 text-sky-400"></i> Forward to Telegram
          </label>
          <div className="space-y-1.5">
            {([
              { key: 'channel' as const, icon: 'fas fa-bullhorn', label: 'Channel', desc: '@iiuc_arms', color: 'text-sky-400' },
              { key: 'group' as const, icon: 'fas fa-users', label: 'Group', desc: '@iiuc_arms_chat', color: 'text-emerald-400' },
              { key: 'personal' as const, icon: 'fas fa-user', label: 'Personal (DM)', desc: 'All subscribed users', color: 'text-violet-400' },
            ]).map(t => (
              <button key={t.key} onClick={() => toggleTarget(t.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition cursor-pointer ${targets[t.key] ? 'bg-qsis/10 border-qsis/30' : 'bg-dark-bg3 border-dark-border hover:border-qsis/20'}`}>
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition ${targets[t.key] ? 'bg-qsis border-qsis' : 'border-dark-text3'}`}>
                  {targets[t.key] && <i className="fas fa-check text-white text-[0.55rem]"></i>}
                </div>
                <i className={`${t.icon} ${t.color} text-sm w-4 text-center`}></i>
                <div className="min-w-0">
                  <span className="text-[0.78rem] font-medium text-dark-text">{t.label}</span>
                  <span className="text-[0.68rem] text-dark-text3 ml-1.5">{t.desc}</span>
                </div>
              </button>
            ))}
          </div>
          {selectedTargets.length === 0 && (
            <p className="text-[0.68rem] text-red-400 mt-1.5"><i className="fas fa-exclamation-circle mr-1"></i>Select at least one destination</p>
          )}
        </div>

        {/* Publish Mode */}
        <div className="mb-4">
          <label className="block text-[0.75rem] font-medium text-dark-text2 mb-2">
            <i className="fas fa-clock mr-1 text-amber-400"></i> Publish Timing
          </label>
          <div className="flex gap-2">
            <button onClick={() => setMode('now')}
              className={`flex-1 py-2.5 rounded-xl text-[0.78rem] font-semibold border cursor-pointer transition ${mode === 'now' ? 'bg-qsis/15 border-qsis/30 text-qsis' : 'bg-dark-bg3 border-dark-border text-dark-text2 hover:border-qsis/20'}`}>
              <i className="fas fa-bolt mr-1.5"></i>Publish Now
            </button>
            <button onClick={() => setMode('schedule')}
              className={`flex-1 py-2.5 rounded-xl text-[0.78rem] font-semibold border cursor-pointer transition ${mode === 'schedule' ? 'bg-qsis/15 border-qsis/30 text-qsis' : 'bg-dark-bg3 border-dark-border text-dark-text2 hover:border-qsis/20'}`}>
              <i className="fas fa-calendar-clock mr-1.5"></i>Schedule
            </button>
          </div>
        </div>

        {mode === 'schedule' && (
          <div className="mb-4">
            <div className="grid grid-cols-2 gap-3">
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
            {date && time && (
              <div className="mt-2 p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-[0.7rem] text-blue-400">
                <i className="fas fa-info-circle mr-1"></i>
                Will auto-publish on <strong>{new Date(`${date}T${time}`).toLocaleString()}</strong>
              </div>
            )}
          </div>
        )}

        {/* Summary */}
        <div className="p-3 rounded-xl bg-dark-bg3/50 border border-dark-border mb-4">
          <p className="text-[0.72rem] text-dark-text2">
            <i className="fas fa-paper-plane mr-1 text-qsis"></i>
            Forward to: {selectedTargets.length > 0 ? selectedTargets.map(t => t === 'channel' ? 'Channel' : t === 'group' ? 'Group' : 'DM').join(', ') : 'None selected'}
            {mode === 'schedule' && date && time && (
              <span className="ml-1 text-blue-400">| Scheduled: {new Date(`${date}T${time}`).toLocaleString()}</span>
            )}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button onClick={handlePublish} disabled={!canSubmit}
            className="flex-1 py-2.5 rounded-xl bg-qsis text-white text-[0.82rem] font-semibold hover:brightness-110 transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5">
            <i className="fas fa-share-alt"></i>
            {mode === 'now' ? 'Publish Now' : 'Schedule Publish'}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-dark-bg3 border border-dark-border text-dark-text2 text-[0.82rem] hover:text-dark-text cursor-pointer">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
