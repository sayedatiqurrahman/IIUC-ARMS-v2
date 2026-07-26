import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.totp);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { code } = body;
    if (!code) return NextResponse.json({ error: 'Code required to disable TOTP' }, { status: 400 });

    const { prisma } = await import('@/lib/prisma');
    const { TOTP, Secret } = await import('otpauth');

    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    if (!profile?.totpSecret || !profile.totpEnabled) {
      return NextResponse.json({ error: 'TOTP not enabled' }, { status: 400 });
    }

    const totp = new TOTP({
      issuer: 'IIUC-ARMS',
      label: email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(profile.totpSecret),
    });

    const delta = totp.validate({ token: code, window: 1 });
    if (delta === null) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
    }

    await prisma.profile.update({
      where: { userId: email },
      data: { totpEnabled: false, totpSecret: null },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'TOTP disable failed' }, { status: 500 });
  }
}
