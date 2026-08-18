'use client';

import { useState, useCallback } from 'react';
import { CRON_JOBS, type CronJob } from '@/lib/cron/jobs';

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

export default function CronJobTab() {
  const [jobStates, setJobStates] = useState<Record<string, JobState>>({});
  const [runAllResult, setRunAllResult] = useState<{ running: boolean; done: boolean; results: JobRunResult[] }>({ running: false, done: false, results: [] });

  const updateState = useCallback((jobId: string, patch: Partial<JobState>) => {
    setJobStates(prev => ({ ...prev, [jobId]: { ...prev[jobId], ...patch } }));
  }, []);

  const runJob = useCallback(async (job: CronJob) => {
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
    for (const job of CRON_JOBS) {
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

  const successCount = runAllResult.results.filter(r => r.success).length;
  const failCount = runAllResult.results.filter(r => !r.success).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-[1.05rem] font-semibold flex items-center gap-2">
            <i className="fas fa-clock text-orange-400"></i> Cron Jobs
          </h3>
          <p className="text-[0.72rem] text-dark-text3 mt-0.5">Manage automated maintenance tasks. Run manually or let Vercel Cron handle scheduling.</p>
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
          Completed: {successCount} succeeded, {failCount} failed out of {CRON_JOBS.length} jobs
        </div>
      )}

      {/* Job Cards */}
      <div className="space-y-3">
        {CRON_JOBS.map(job => {
          const state = jobStates[job.id];
          const lastResult = state?.lastRun;
          const isRunning = state?.running;

          return (
            <div key={job.id} className="rounded-xl border border-dark-border bg-dark-bg2 p-4 transition-all hover:border-qsis/20">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl bg-dark-bg3 flex items-center justify-center shrink-0`}>
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

      {/* Vercel Cron Info */}
      <div className="rounded-xl border border-dark-border bg-dark-bg2 p-4">
        <h4 className="text-[0.82rem] font-semibold text-dark-text mb-2 flex items-center gap-2">
          <i className="fas fa-info-circle text-qsis"></i> Vercel Cron Configuration
        </h4>
        <p className="text-[0.72rem] text-dark-text3 mb-3">
          These jobs run automatically via Vercel Cron in <code className="px-1 py-0.5 rounded bg-dark-bg3 text-qsis text-[0.68rem]">vercel.json</code>. You can also trigger them manually above or via the API.
        </p>
        <div className="text-[0.68rem] text-dark-text3 space-y-1">
          <p><i className="fas fa-terminal mr-1.5 text-dark-text2"></i>API: <code className="px-1.5 py-0.5 rounded bg-dark-bg3 text-qsis">POST /api/cron/run</code> with <code className="px-1.5 py-0.5 rounded bg-dark-bg3 text-qsis">{'{ "jobId": "notice-cleanup" }'}</code></p>
          <p><i className="fas fa-shield-halved mr-1.5 text-dark-text2"></i>Auth: Requires <code className="px-1.5 py-0.5 rounded bg-dark-bg3 text-qsis">Authorization: Bearer {'<CRON_SECRET>'}</code> header or admin session</p>
          <p><i className="fas fa-lock mr-1.5 text-dark-text2"></i>Permission: Only users with <code className="px-1.5 py-0.5 rounded bg-dark-bg3 text-qsis">manageCronJobs</code> permission can access (default: admin only)</p>
        </div>
      </div>
    </div>
  );
}
