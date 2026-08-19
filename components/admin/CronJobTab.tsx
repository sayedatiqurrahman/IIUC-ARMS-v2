'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { CRON_JOBS_META, type CronJobMeta } from '@/lib/cron/jobs-config';

interface JobRunResult {
  jobId: string;
  success: boolean;
  message: string;
  details?: string;
  ranAt: string;
}

interface JobState {
  lastRun?: JobRunResult;
  running: boolean;
}

const GROUP_META: Record<string, { label: string; icon: string; color: string; order: number }> = {
  'scheduled-publish': { label: 'Scheduled Publish', icon: 'fas fa-clock', color: 'text-qsis', order: 1 },
  'cleanup': { label: 'Cleanup & Maintenance', icon: 'fas fa-broom', color: 'text-amber-400', order: 2 },
  'maintenance': { label: 'System Maintenance', icon: 'fas fa-gear', color: 'text-blue-400', order: 3 },
};

const SCHEDULE_OPTIONS = [
  { value: '5min', label: 'Every 5 minutes', cron: '*/5 * * * *' },
  { value: '15min', label: 'Every 15 minutes', cron: '*/15 * * * *' },
  { value: '30min', label: 'Every 30 minutes', cron: '*/30 * * * *' },
  { value: 'hourly', label: 'Every hour', cron: '0 * * * *' },
  { value: 'daily-3am', label: 'Daily at 3:00 AM', cron: '0 3 * * *' },
  { value: 'daily-6am', label: 'Daily at 6:00 AM', cron: '0 6 * * *' },
  { value: 'daily-midnight', label: 'Daily at midnight', cron: '0 0 * * *' },
  { value: 'weekly-sun', label: 'Weekly (Sunday 4 AM)', cron: '0 4 * * 0' },
  { value: 'weekly-mon', label: 'Weekly (Monday 4 AM)', cron: '0 4 * * 1' },
  { value: 'monthly-1st', label: 'Monthly (1st, 4 AM)', cron: '0 4 1 * *' },
  { value: 'custom', label: 'Custom cron expression', cron: '' },
];

const RETENTION_OPTIONS = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 60, label: '60 days' },
  { value: 90, label: '90 days (default)' },
  { value: 180, label: '6 months' },
  { value: 365, label: '1 year' },
];

const STORAGE_KEY = 'qsis_cron_schedules_v1';
const RETENTION_KEY = 'qsis_log_retention_v1';

function loadSchedules(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}
function saveSchedules(s: Record<string, string>) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
function loadRetention(): number { try { return parseInt(localStorage.getItem(RETENTION_KEY) || '90', 10); } catch { return 90; } }
function saveRetention(d: number) { localStorage.setItem(RETENTION_KEY, String(d)); }

export default function CronJobTab() {
  const [jobStates, setJobStates] = useState<Record<string, JobState>>({});
  const [runAllResult, setRunAllResult] = useState<{ running: boolean; done: boolean; results: JobRunResult[] }>({ running: false, done: false, results: [] });
  const [schedules, setSchedules] = useState<Record<string, string>>({});
  const [customCrons, setCustomCrons] = useState<Record<string, string>>({});
  const [retention, setRetention] = useState(90);
  const [deletingAll, setDeletingAll] = useState(false);
  const [deletingRetention, setDeletingRetention] = useState(false);
  const [deleteResult, setDeleteResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    setSchedules(loadSchedules());
    setRetention(loadRetention());
  }, []);

  const updateSchedule = useCallback((jobId: string, value: string) => {
    setSchedules(prev => {
      const next = { ...prev, [jobId]: value };
      saveSchedules(next);
      return next;
    });
  }, []);

  const updateCustomCron = useCallback((jobId: string, value: string) => {
    setCustomCrons(prev => ({ ...prev, [jobId]: value }));
  }, []);

  const saveCustomCron = useCallback((jobId: string) => {
    const expr = customCrons[jobId]?.trim();
    if (!expr) return;
    setSchedules(prev => {
      const next = { ...prev, [jobId]: expr };
      saveSchedules(next);
      return next;
    });
  }, [customCrons]);

  const updateRetention = useCallback((days: number) => {
    setRetention(days);
    saveRetention(days);
  }, []);

  const updateState = useCallback((jobId: string, patch: Partial<JobState>) => {
    setJobStates(prev => ({ ...prev, [jobId]: { ...prev[jobId], ...patch } }));
  }, []);

  const runJob = useCallback(async (job: CronJobMeta) => {
    updateState(job.id, { running: true });
    try {
      const res = await fetch('/api/cron/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id }),
      });
      const data = await res.json();
      const result: JobRunResult = {
        jobId: job.id,
        success: data.success,
        message: data.message || data.error || 'Unknown result',
        details: data.details,
        ranAt: new Date().toLocaleString(),
      };
      updateState(job.id, { running: false, lastRun: result });
    } catch (e: any) {
      updateState(job.id, {
        running: false,
        lastRun: { jobId: job.id, success: false, message: `Network error: ${e?.message || 'Failed'}`, ranAt: new Date().toLocaleString() },
      });
    }
  }, [updateState]);

  const runAll = useCallback(async () => {
    setRunAllResult({ running: true, done: false, results: [] });
    const results: JobRunResult[] = [];
    for (const job of CRON_JOBS_META) {
      updateState(job.id, { running: true });
      try {
        const res = await fetch('/api/cron/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: job.id }),
        });
        const data = await res.json();
        const r: JobRunResult = {
          jobId: job.id,
          success: data.success,
          message: data.message || data.error || 'Unknown',
          details: data.details,
          ranAt: new Date().toLocaleString(),
        };
        results.push(r);
        updateState(job.id, { running: false, lastRun: r });
      } catch (e: any) {
        const r: JobRunResult = { jobId: job.id, success: false, message: `Error: ${e?.message}`, ranAt: new Date().toLocaleString() };
        results.push(r);
        updateState(job.id, { running: false, lastRun: r });
      }
    }
    setRunAllResult({ running: false, done: true, results });
  }, [updateState]);

  const deleteAllLogs = useCallback(async () => {
    setDeletingAll(true);
    setDeleteResult(null);
    try {
      const res = await fetch('/api/cron/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteAllLogs' }),
      });
      const data = await res.json();
      setDeleteResult({ success: data.success, message: data.message || data.error });
    } catch (e: any) {
      setDeleteResult({ success: false, message: `Error: ${e?.message}` });
    }
    setDeletingAll(false);
  }, []);

  const deleteByRetention = useCallback(async () => {
    setDeletingRetention(true);
    setDeleteResult(null);
    try {
      const res = await fetch('/api/cron/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteLogsByRetention', days: retention }),
      });
      const data = await res.json();
      setDeleteResult({ success: data.success, message: data.message || data.error });
    } catch (e: any) {
      setDeleteResult({ success: false, message: `Error: ${e?.message}` });
    }
    setDeletingRetention(false);
  }, [retention]);

  const successCount = runAllResult.results.filter(r => r.success).length;
  const failCount = runAllResult.results.filter(r => !r.success).length;

  const groupedJobs = useMemo(() => {
    const groups: Record<string, CronJobMeta[]> = {};
    for (const job of CRON_JOBS_META) {
      const g = job.group || 'cleanup';
      if (!groups[g]) groups[g] = [];
      groups[g].push(job);
    }
    return Object.entries(groups)
      .sort((a, b) => (GROUP_META[a[0]]?.order || 99) - (GROUP_META[b[0]]?.order || 99));
  }, []);

  const getScheduleLabel = (jobId: string) => {
    const val = schedules[jobId];
    if (!val) return null;
    const opt = SCHEDULE_OPTIONS.find(o => o.value === val);
    if (opt && opt.value !== 'custom') return opt.label;
    return `Custom: ${val}`;
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-[1.05rem] font-semibold flex items-center gap-2">
            <i className="fas fa-clock text-orange-400"></i> Cron Jobs
          </h3>
          <p className="text-[0.72rem] text-dark-text3 mt-0.5">Manage automated tasks. Configure schedules, run manually, or let Vercel Cron handle scheduling.</p>
        </div>
        <button onClick={runAll} disabled={runAllResult.running}
          className="px-4 py-2 rounded-xl bg-qsis text-white text-[0.78rem] font-semibold hover:brightness-110 transition cursor-pointer disabled:opacity-50 flex items-center gap-2">
          {runAllResult.running ? (
            <><i className="fas fa-spinner fa-spin"></i> Running all...</>
          ) : (
            <><i className="fas fa-play"></i> Run All Jobs</>
          )}
        </button>
      </div>

      {/* Run All summary */}
      {runAllResult.done && (
        <div className={`p-3 rounded-xl border text-[0.78rem] ${failCount > 0 ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-green-500/10 border-green-500/30 text-green-400'}`}>
          <i className={`fas ${failCount > 0 ? 'fa-exclamation-triangle' : 'fa-check-circle'} mr-2`}></i>
          Completed: {successCount} succeeded, {failCount} failed out of {CRON_JOBS_META.length} jobs
        </div>
      )}

      {/* Grouped Job Cards */}
      <div className="space-y-5">
        {groupedJobs.map(([groupKey, jobs]) => {
          const gm = GROUP_META[groupKey] || { label: groupKey, icon: 'fas fa-folder', color: 'text-dark-text2', order: 99 };
          return (
            <div key={groupKey}>
              <h4 className="text-[0.78rem] font-semibold text-dark-text2 mb-2.5 flex items-center gap-2 uppercase tracking-wider">
                <i className={`${gm.icon} ${gm.color}`}></i> {gm.label}
              </h4>
              <div className="space-y-2">
                {jobs.map(job => {
                  const state = jobStates[job.id];
                  const lastResult = state?.lastRun;
                  const isRunning = state?.running;
                  const currentSchedule = schedules[job.id] || '';
                  const scheduleLabel = getScheduleLabel(job.id);

                  return (
                    <div key={job.id} className="rounded-xl border border-dark-border bg-dark-bg2 p-4 transition-all hover:border-qsis/20">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-dark-bg3 flex items-center justify-center shrink-0">
                          <i className={`${job.icon} ${job.color} text-lg`}></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <h4 className="text-[0.88rem] font-semibold text-dark-text">{job.label}</h4>
                            {lastResult && (
                              <span className={`text-[0.6rem] px-1.5 py-0.5 rounded-full font-semibold ${lastResult.success ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                                {lastResult.success ? 'OK' : 'FAIL'}
                              </span>
                            )}
                            {scheduleLabel && (
                              <span className="text-[0.6rem] px-1.5 py-0.5 rounded-full bg-qsis/15 text-qsis font-semibold">
                                <i className="fas fa-clock mr-0.5"></i>{scheduleLabel}
                              </span>
                            )}
                          </div>
                          <p className="text-[0.72rem] text-dark-text3 mb-2">{job.description}</p>
                          <div className="flex items-center gap-3 text-[0.65rem] text-dark-text3">
                            <span><i className="fas fa-calendar mr-1"></i>{job.schedule}</span>
                            {lastResult && (
                              <span><i className="fas fa-clock mr-1"></i>Last: {lastResult.ranAt}</span>
                            )}
                          </div>
                          {lastResult && (
                            <p className={`text-[0.7rem] mt-1.5 ${lastResult.success ? 'text-dark-text3' : 'text-red-400'}`}>
                              {lastResult.message}
                              {lastResult.details && <span className="text-dark-text3 ml-1">({lastResult.details})</span>}
                            </p>
                          )}

                          {/* Schedule Selector */}
                          <div className="mt-3 flex flex-col sm:flex-row items-start sm:items-center gap-2">
                            <label className="text-[0.68rem] text-dark-text3 font-semibold shrink-0">Schedule:</label>
                            <select
                              value={currentSchedule}
                              onChange={e => updateSchedule(job.id, e.target.value)}
                              className="px-2 py-1 rounded-lg bg-dark-bg3 border border-dark-border text-[0.72rem] text-dark-text outline-none focus:border-qsis/40 min-w-[160px]"
                            >
                              <option value="">Default (server cron)</option>
                              {SCHEDULE_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                            {currentSchedule === 'custom' && (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={customCrons[job.id] || ''}
                                  onChange={e => updateCustomCron(job.id, e.target.value)}
                                  placeholder="*/10 * * * *"
                                  className="px-2 py-1 rounded-lg bg-dark-bg3 border border-dark-border text-[0.72rem] text-dark-text font-mono outline-none focus:border-qsis/40 w-[160px]"
                                />
                                <button onClick={() => saveCustomCron(job.id)}
                                  className="px-2 py-1 rounded-lg bg-qsis/15 text-qsis text-[0.68rem] font-semibold hover:bg-qsis/25 transition cursor-pointer border-none">
                                  Save
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        <button onClick={() => runJob(job)} disabled={isRunning}
                          className="px-3 py-1.5 rounded-lg bg-dark-bg3 border border-dark-border text-dark-text2 text-[0.75rem] font-semibold hover:text-qsis hover:border-qsis/40 transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shrink-0">
                          {isRunning ? (
                            <><i className="fas fa-spinner fa-spin text-qsis"></i><span className="hidden sm:inline">Running</span></>
                          ) : (
                            <><i className="fas fa-play text-[0.6rem]"></i><span className="hidden sm:inline">Run</span></>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Log Management Section */}
      <div className="rounded-xl border border-dark-border bg-dark-bg2 p-4">
        <h4 className="text-[0.85rem] font-semibold text-dark-text mb-3 flex items-center gap-2">
          <i className="fas fa-trash-can text-red-400"></i> Log Management
        </h4>

        {/* Retention selector */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4 p-3 rounded-lg bg-dark-bg3 border border-dark-border">
          <label className="text-[0.75rem] text-dark-text2 font-semibold shrink-0">Log Retention Period:</label>
          <select
            value={retention}
            onChange={e => updateRetention(Number(e.target.value))}
            className="px-2 py-1.5 rounded-lg bg-dark-bg2 border border-dark-border text-[0.78rem] text-dark-text outline-none focus:border-qsis/40"
          >
            {RETENTION_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button onClick={deleteByRetention} disabled={deletingRetention}
            className="px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[0.75rem] font-semibold hover:bg-amber-500/25 transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5">
            {deletingRetention ? (
              <><i className="fas fa-spinner fa-spin"></i> Cleaning...</>
            ) : (
              <><i className="fas fa-broom"></i> Clean Logs Older Than {retention} Days</>
            )}
          </button>
        </div>

        {/* Delete All */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 rounded-lg bg-dark-bg3 border border-dark-border">
          <p className="text-[0.75rem] text-dark-text2 flex-1">
            <i className="fas fa-exclamation-triangle text-red-400 mr-1.5"></i>
            <strong className="text-dark-text">Delete ALL logs</strong> — activity logs, Telegram notification logs, and upload chunks. This cannot be undone.
          </p>
          <button onClick={deleteAllLogs} disabled={deletingAll}
            className="px-4 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-[0.75rem] font-semibold hover:bg-red-500/25 transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shrink-0">
            {deletingAll ? (
              <><i className="fas fa-spinner fa-spin"></i> Deleting...</>
            ) : (
              <><i className="fas fa-trash-can"></i> Delete All Logs</>
            )}
          </button>
        </div>

        {/* Delete result */}
        {deleteResult && (
          <div className={`mt-3 p-2.5 rounded-lg text-[0.75rem] ${deleteResult.success ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'}`}>
            <i className={`fas ${deleteResult.success ? 'fa-check-circle' : 'fa-exclamation-circle'} mr-1.5`}></i>
            {deleteResult.message}
          </div>
        )}
      </div>

      {/* Vercel Cron Info */}
      <div className="rounded-xl border border-dark-border bg-dark-bg2 p-4">
        <h4 className="text-[0.82rem] font-semibold text-dark-text mb-2 flex items-center gap-2">
          <i className="fas fa-info-circle text-qsis"></i> Schedule & API Info
        </h4>
        <p className="text-[0.72rem] text-dark-text3 mb-3">
          Custom schedules are stored locally and used by the client-side poller. Server cron runs via Vercel Cron in <code className="px-1 py-0.5 rounded bg-dark-bg3 text-qsis text-[0.68rem]">vercel.json</code>.
        </p>
        <div className="text-[0.68rem] text-dark-text3 space-y-1">
          <p><i className="fas fa-terminal mr-1.5 text-dark-text2"></i>API: <code className="px-1.5 py-0.5 rounded bg-dark-bg3 text-qsis">POST /api/cron/run</code> with <code className="px-1.5 py-0.5 rounded bg-dark-bg3 text-qsis">{'{ "jobId": "notice-cleanup" }'}</code></p>
          <p><i className="fas fa-trash-can mr-1.5 text-dark-text2"></i>Delete all: <code className="px-1.5 py-0.5 rounded bg-dark-bg3 text-qsis">{'{ "action": "deleteAllLogs" }'}</code></p>
          <p><i className="fas fa-clock mr-1.5 text-dark-text2"></i>Retention: <code className="px-1.5 py-0.5 rounded bg-dark-bg3 text-qsis">{'{ "action": "deleteLogsByRetention", "days": 90 }'}</code></p>
          <p><i className="fas fa-shield-halved mr-1.5 text-dark-text2"></i>Auth: Requires <code className="px-1.5 py-0.5 rounded bg-dark-bg3 text-qsis">Authorization: Bearer {'<CRON_SECRET>'}</code> header or admin session</p>
        </div>
      </div>
    </div>
  );
}
