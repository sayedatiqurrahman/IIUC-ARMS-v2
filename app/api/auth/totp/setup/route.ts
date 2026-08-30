import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { getTotpForEmail, saveTotpSetup, totpUrl } from '@/lib/totp';

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.totp);
  if (!rl.success) return rl.response!;
  try {
    const primaryEmail = await getUserEmail(req);
    if (!primaryEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const target = (body?.email ? String(body.email).toLowerCase().trim() : '') || primaryEmail;

    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({ where: { userId: primaryEmail } });
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    // The target must be the session primary account or one of its linked emails.
    const linked: string[] = (() => { try { return JSON.parse(profile?.linkedEmails as string || '[]'); } catch { return []; } })();
    const allowed = new Set([primaryEmail, ...linked.map((l) => l.toLowerCase())]);
    if (!allowed.has(target)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { Secret } = await import('otpauth');

    const existing = await getTotpForEmail(target);
    if (existing?.enabled) {
      return NextResponse.json({ error: 'TOTP already enabled. Disable it first.' }, { status: 400 });
    }

    const secret = existing?.secret ? Secret.fromBase32(existing.secret) : new Secret({ size: 20 });
    await saveTotpSetup(target, secret.base32);

    const otpauthURL = totpUrl(secret.base32, target);

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
  } catch (err: any) {
    console.error('[totp/setup] error:', err?.message || err);
    return NextResponse.json({ error: 'TOTP setup failed' }, { status: 500 });
  }
}