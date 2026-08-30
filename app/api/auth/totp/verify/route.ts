import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { getTotpForEmail, enableTotp, validateTotp } from '@/lib/totp';

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.totp);
  if (!rl.success) return rl.response!;
  try {
    const body = await req.json().catch(() => ({}));
    const { code, email } = body || {};
    if (!code) return NextResponse.json({ error: 'Code required' }, { status: 400 });

    const { prisma } = await import('@/lib/prisma');

    // Determine the principal and the allowed target emails:
    //   - Login flow (no session): the Firebase token's raw email plus whatever
    //     it resolves to (its primary account).
    //   - Dashboard flow (session): the session primary email plus every email
    //     linked to it.
    let rawEmail: string | null = null;
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const { adminAuth } = await import('@/lib/firebase-admin');
        const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
        if (decoded.email) rawEmail = decoded.email.toLowerCase();
      } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    let allowed = new Set<string>();
    let defaultTarget = '';
    if (rawEmail) {
      const { resolveSignInEmail } = await import('@/lib/linked-accounts');
      const resolved = (await resolveSignInEmail(rawEmail) || rawEmail).toLowerCase();
      allowed.add(rawEmail);
      allowed.add(resolved);
      defaultTarget = rawEmail;
    } else {
      const sessionEmail = await getUserEmail(req);
      if (!sessionEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      defaultTarget = sessionEmail;
      allowed.add(sessionEmail);
      const profile = await prisma.profile.findUnique({ where: { userId: sessionEmail } });
      const linked: string[] = (() => { try { return JSON.parse(profile?.linkedEmails as string || '[]'); } catch { return []; } })();
      linked.forEach((e) => allowed.add(e.toLowerCase()));
    }

    const target = (email ? String(email).toLowerCase().trim() : '') || defaultTarget;
    if (!allowed.has(target)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const config = await getTotpForEmail(target);
    if (!config) return NextResponse.json({ error: 'TOTP not set up' }, { status: 400 });

    if (!validateTotp(config.secret, target, String(code))) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
    }

    if (!config.enabled) {
      await enableTotp(target);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[totp/verify] error:', err?.message || err);
    return NextResponse.json({ error: 'TOTP verification failed' }, { status: 500 });
  }
}