import { NextResponse } from 'next/server';
import { getJobById } from '@/lib/cron/jobs';

/**
 * GET /api/publish-scheduled
 * Lightweight client-polling endpoint that runs all scheduled-publish jobs.
 * No auth required — only publishes items whose scheduledAt has already passed.
 * Called every ~5 min from the client when the app is open.
 */
export const dynamic = 'force-dynamic';

const PUBLISH_JOB_IDS = [
  'publish-class-routines',
  'publish-exam-routines',
  'publish-seat-plans',
  'publish-notices',
];

export async function GET() {
  try {
    const results = await Promise.allSettled(
      PUBLISH_JOB_IDS.map(id => getJobById(id)?.run() ?? Promise.resolve({ success: false, message: 'Job not found' }))
    );
    const summary = results
      .map((r, i) => {
        const label = PUBLISH_JOB_IDS[i].replace('publish-', '');
        if (r.status === 'fulfilled' && r.value.success) return `${label}: ${r.value.message}`;
        return `${label}: ${r.status === 'rejected' ? 'error' : r.value.message}`;
      })
      .join(' | ');
    return NextResponse.json({ success: true, summary });
  } catch {
    return NextResponse.json({ success: false, summary: 'Publish check failed' });
  }
}
