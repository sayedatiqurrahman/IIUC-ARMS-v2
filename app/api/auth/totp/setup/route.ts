import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';

export async function POST(req: NextRequest) {
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const { TOTP, Secret } = await import('otpauth');

    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    const existingTOTP = new TOTP({ issuer: 'QSIS-ARMS', label: email, algorithm: 'SHA1', digits: 6, period: 30 });

    let secret: InstanceType<typeof Secret>;
    if (profile.totpSecret && profile.totpEnabled) {
      return NextResponse.json({ error: 'TOTP already enabled. Disable it first.' }, { status: 400 });
    } else if (profile.totpSecret) {
      secret = Secret.fromBase32(profile.totpSecret);
    } else {
      secret = new Secret({ size: 20 });
    }

    existingTOTP.secret = secret;

    await prisma.profile.update({
      where: { userId: email },
      data: { totpSecret: secret.base32 },
    });

    const otpauthURL = existingTOTP.toString();

    let qrCodeDataUrl = '';
    try {
      const QRCode = await import('qrcode');
      qrCodeDataUrl = await QRCode.toDataURL(otpauthURL, { width: 256, margin: 2 });
    } catch {}

    return NextResponse.json({
      secret: secret.base32,
      otpauthURL,
      qrCode: qrCodeDataUrl,
    });
  } catch {
    return NextResponse.json({ error: 'TOTP setup failed' }, { status: 500 });
  }
}
