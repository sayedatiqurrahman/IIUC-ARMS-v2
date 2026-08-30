import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { getTotpForEmail, disableTotp, validateTotp } from '@/lib/totp';

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.totp);
  if (!rl.success) return rl.response!;
  try {
    const primaryEmail = await getUserEmail(req);
    if (!primaryEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { code, email } = body || {};
    if (!code) return NextResponse.json({ error: 'Code required to disable TOTP' }, { status: 400 });

    const target = (email ? String(email).toLowerCase().trim() : '') || primaryEmail;

    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({ where: { userId: primaryEmail } });
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    // The target must be the session primary account or one of its linked emails.
    const linked: string[] = (() => { try { return JSON.parse(profile?.linkedEmails as string || '[]'); } catch { return []; } })();
    const allowed = new Set([primaryEmail, ...linked.map((l) => l.toLowerCase())]);
    if (!allowed.has(target)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const config = await getTotpForEmail(target);
    if (!config?.enabled) {
      return NextResponse.json({ error: 'TOTP not enabled' }, { status: 400 });
    }

    if (!validateTotp(config.secret, target, String(code))) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
    }

    await disableTotp(target);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[totp/disable] error:', err?.message || err);
    return NextResponse.json({ error: 'TOTP disable failed' }, { status: 500 });
  }
}