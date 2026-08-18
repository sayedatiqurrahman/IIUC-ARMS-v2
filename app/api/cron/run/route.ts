import { NextRequest, NextResponse } from 'next/server';
import { getJobById, CRON_JOBS } from '@/lib/cron/jobs';

/** POST /api/cron/run — Execute a cron job by ID, or all if no ID given. */
export async function POST(req: NextRequest) {
  // Auth: CRON_SECRET (for Vercel cron) OR admin session
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const isCronAuth = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCronAuth) {
    // Fall back to session auth
    const { getUserEmail } = await import('@/lib/get-user');
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { config } = await import('@/lib/config');
    const { prisma } = await import('@/lib/prisma');
    const { hasPermission } = await import('@/lib/permissions');
    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    const role = config.getEffectiveRole(email, profile?.role);
    if (!(await hasPermission('manageCronJobs', role, profile?.isCR || false, email))) {
      return NextResponse.json({ error: 'Forbidden: manageCronJobs permission required' }, { status: 403 });
    }
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { jobId } = body as { jobId?: string };

    if (jobId) {
      const job = getJobById(jobId);
      if (!job) return NextResponse.json({ error: `Unknown job: ${jobId}` }, { status: 404 });

      const result = await job.run();
      return NextResponse.json(result);
    }

    // Run all jobs
    const results = [];
    for (const job of CRON_JOBS) {
      try {
        const r = await job.run();
        results.push({ jobId: job.id, ...r });
      } catch (e: any) {
        results.push({ jobId: job.id, success: false, message: e?.message || 'Failed' });
      }
    }
    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Cron run failed' }, { status: 500 });
  }
}
