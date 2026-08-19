'use client';

import { useEffect, useRef } from 'react';

const STORAGE_KEY = 'qsis_cron_schedules_v1';
const LAST_RUN_KEY = 'qsis_cron_last_runs_v1';

const POLL_INTERVAL = 60 * 1000; // Check every 1 minute

interface LastRuns { [jobId: string]: number; }

function getDueJobs(): string[] {
  try {
    const schedules = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const lastRuns: LastRuns = JSON.parse(localStorage.getItem(LAST_RUN_KEY) || '{}');
    const now = Date.now();

    const due: string[] = [];
    for (const [jobId, schedule] of Object.entries(schedules) as [string, string][]) {
      if (!schedule || schedule === 'custom') continue;
      const lastRun = lastRuns[jobId] || 0;
      const interval = getIntervalMs(schedule);
      if (interval > 0 && now - lastRun >= interval) {
        due.push(jobId);
      }
    }
    return due;
  } catch {
    return [];
  }
}

function getIntervalMs(schedule: string): number {
  switch (schedule) {
    case '5min': return 5 * 60 * 1000;
    case '15min': return 15 * 60 * 1000;
    case '30min': return 30 * 60 * 1000;
    case 'hourly': return 60 * 60 * 1000;
    case 'daily-3am':
    case 'daily-6am':
    case 'daily-midnight': return 24 * 60 * 60 * 1000;
    case 'weekly-sun':
    case 'weekly-mon': return 7 * 24 * 60 * 60 * 1000;
    case 'monthly-1st': return 30 * 24 * 60 * 60 * 1000;
    default: return 0;
  }
}

function markRun(jobId: string) {
  try {
    const lastRuns: LastRuns = JSON.parse(localStorage.getItem(LAST_RUN_KEY) || '{}');
    lastRuns[jobId] = Date.now();
    localStorage.setItem(LAST_RUN_KEY, JSON.stringify(lastRuns));
  } catch {}
}

/**
 * Smart poller that respects custom per-job schedules from localStorage.
 * Runs due jobs via POST /api/cron/run with { jobId }.
 * Falls back to /api/publish-scheduled for default behavior.
 */
export function useScheduledPublishPoller() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const poll = async () => {
      const dueJobs = getDueJobs();
      if (dueJobs.length > 0) {
        for (const jobId of dueJobs) {
          try {
            await fetch('/api/cron/run', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jobId }),
            });
            markRun(jobId);
          } catch {}
        }
      }

      // Always also poll publish-scheduled for the default 5-min publish jobs
      fetch('/api/publish-scheduled').catch(() => {});
    };

    poll();
    timerRef.current = setInterval(poll, POLL_INTERVAL);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);
}
