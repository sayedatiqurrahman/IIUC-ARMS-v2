import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';

export async function POST(req: NextRequest) {
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { code } = body;
    if (!code) return NextResponse.json({ error: 'Code required' }, { status: 400 });

    const { prisma } = await import('@/lib/prisma');
    const { TOTP, Secret } = await import('otpauth');

    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    if (!profile?.totpSecret) return NextResponse.json({ error: 'TOTP not set up' }, { status: 400 });

    const totp = new TOTP({
      issuer: 'QSIS-ARMS',
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

    if (!profile.totpEnabled) {
      await prisma.profile.update({
        where: { userId: email },
        data: { totpEnabled: true },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[TOTP Verify] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
