import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.profile);
  if (!rl.success) return rl.response!;
  try {
    const { prisma } = await import('@/lib/prisma');
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { newPrimary } = body;

    if (!newPrimary || typeof newPrimary !== 'string') {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const { isIiucEmail, invalidateLinkedEmail, switchPrimary } = await import('@/lib/linked-accounts');
    const target = newPrimary.toLowerCase().trim();

    if (target === email.toLowerCase()) {
      return NextResponse.json({ error: 'This is already your primary email' }, { status: 400 });
    }
    if (isIiucEmail(target)) {
      return NextResponse.json({ error: 'A university email cannot become a personal primary. Use a personal email instead.' }, { status: 400 });
    }

    // Only a linked email of THIS account can be promoted to primary.
    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    const linked: string[] = (() => { try { return JSON.parse(profile?.linkedEmails as string || '[]'); } catch { return []; } })();
    if (!linked.some((x) => (x || '').toLowerCase() === target)) {
      return NextResponse.json({ error: 'That email is not linked to this account. Link it first.' }, { status: 400 });
    }

    await switchPrimary(prisma, email, target);
    invalidateLinkedEmail(email);
    invalidateLinkedEmail(target);

    return NextResponse.json({
      success: true,
      newPrimaryEmail: target,
      message: 'Primary email changed! Sign out and sign in again with the new address.',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to switch primary email' }, { status: 500 });
  }
}