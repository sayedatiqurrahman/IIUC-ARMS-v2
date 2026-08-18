'use client';

import { useEffect, useRef } from 'react';

const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * Periodically polls /api/publish-scheduled to auto-publish
 * scheduled routines/notices. Runs in background when the app is open.
 * Works around Vercel Hobby cron limit (1/day).
 */
export function useScheduledPublishPoller() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Run once on mount, then every 5 min
    const poll = () => {
      fetch('/api/publish-scheduled').catch(() => {});
    };

    poll(); // immediate first run
    timerRef.current = setInterval(poll, POLL_INTERVAL);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);
}
