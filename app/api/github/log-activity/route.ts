import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { getUserEmail } from '@/lib/get-user';

// Client-side uploads go straight to GitHub, so they never hit the server's
// logUploadActivity path. This endpoint lets the browser record the same
// file_upload activity row (best effort — failures are ignored by the client).
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;

  try {
    const email = await getUserEmail(req);
    if (!email) {
      return NextResponse.json({ error: 'Unauthorized — please login', status: 401 }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const files: string[] = Array.isArray(body.files) ? body.files.filter((f: any) => typeof f === 'string') : [];
    const prUrl = typeof body.prUrl === 'string' ? body.prUrl : null;
    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    if (profile?.isBanned) {
      return NextResponse.json({ error: 'Account banned' }, { status: 403 });
    }

    await prisma.activityLog.create({
      data: {
        action: 'file_upload',
        userId: email,
        userName: profile?.name || email.split('@')[0],
        details: JSON.stringify({ files, count: files.length, prUrl }),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[log-activity] error:', e?.message || e);
    return NextResponse.json({ error: 'Failed to log activity' }, { status: 500 });
  }
}
