import { NextResponse } from 'next/server';
import { runScheduledClassRoutines, runScheduledExamRoutines, runScheduledSeatPlans, runScheduledNotices } from '@/lib/cron/jobs';

/**
 * GET /api/publish-scheduled
 * Lightweight client-polling endpoint that runs all scheduled-publish jobs.
 * No auth required — only publishes items whose scheduledAt has already passed.
 * Called every ~5 min from the client when the app is open.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const results = await Promise.allSettled([
      runScheduledClassRoutines(),
      runScheduledExamRoutines(),
      runScheduledSeatPlans(),
      runScheduledNotices(),
    ]);
    const summary = results
      .map((r, i) => {
        const labels = ['class-routines', 'exam-routines', 'seat-plans', 'notices'];
        if (r.status === 'fulfilled' && r.value.success) return `${labels[i]}: ${r.value.message}`;
        return `${labels[i]}: ${r.status === 'rejected' ? 'error' : r.value.message}`;
      })
      .join(' | ');
    return NextResponse.json({ success: true, summary });
  } catch {
    return NextResponse.json({ success: false, summary: 'Publish check failed' });
  }
}
