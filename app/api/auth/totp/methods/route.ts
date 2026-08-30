import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { setTotpMethods } from '@/lib/totp';

export async function POST(req: NextRequest) {
  try {
    const primaryEmail = await getUserEmail(req);
    if (!primaryEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { methods, email } = body || {};
    if (!Array.isArray(methods)) {
      return NextResponse.json({ error: 'methods must be an array' }, { status: 400 });
    }

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

    const validMethods = ['email', 'google', 'magiclink'];
    const filtered = methods.filter((m: string) => validMethods.includes(m));

    if (!filtered.includes('email')) {
      filtered.unshift('email');
    }

    await setTotpMethods(target, filtered);

    return NextResponse.json({ success: true, totpMethods: filtered });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to update methods' }, { status: 500 });
  }
}