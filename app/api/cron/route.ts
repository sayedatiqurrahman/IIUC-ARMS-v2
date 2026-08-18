import { NextRequest, NextResponse } from 'next/server';
import { getJobById, CRON_JOBS } from '@/lib/cron/jobs';

/**
 * GET /api/cron?job=notice-cleanup
 * Called by Vercel Cron (sends GET requests). Auth via CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const jobId = req.nextUrl.searchParams.get('job');

  try {
    if (jobId) {
      const job = getJobById(jobId);
      if (!job) return NextResponse.json({ error: `Unknown job: ${jobId}` }, { status: 404 });
      const result = await job.run();
      console.log(`[CRON] ${jobId}: ${result.message}`);
      return NextResponse.json({ job: jobId, ...result });
    }

    // Run all jobs
    const results = [];
    for (const job of CRON_JOBS) {
      try {
        const r = await job.run();
        results.push({ jobId: job.id, ...r });
        console.log(`[CRON] ${job.id}: ${r.message}`);
      } catch (e: any) {
        results.push({ jobId: job.id, success: false, message: e?.message || 'Failed' });
        console.error(`[CRON] ${job.id} FAILED:`, e?.message);
      }
    }
    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Cron failed' }, { status: 500 });
  }
}
