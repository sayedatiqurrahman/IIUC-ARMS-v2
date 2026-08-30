import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';

// Admin-only: link a personal email to another user's profile. Used when a user
// cannot sign in (e.g. their university email no longer works) and the admin is
// satisfied the account is theirs. Mirrors the self-serve link from
// /api/profile/link-email, but acts on an arbitrary user.
export async function POST(req: NextRequest) {
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const effectiveRole = config.getEffectiveRole(email);
    if (effectiveRole !== 'admin') {
      return NextResponse.json({ error: 'Only admins can link emails to profiles' }, { status: 403 });
    }

    const body = await req.json();
    const { userId, linkEmail } = body;
    if (!userId || typeof userId !== 'string' || !linkEmail || typeof linkEmail !== 'string') {
      return NextResponse.json({ error: 'userId and linkEmail are required' }, { status: 400 });
    }

    const { prisma } = await import('@/lib/prisma');
    const { isIiucEmail, isLinkedElsewhere, ensureFirebaseIdentity, sendPasswordResetLink, invalidateLinkedEmail } = await import('@/lib/linked-accounts');

    const normalizedEmail = linkEmail.toLowerCase().trim();
    const targetUserId = userId.toLowerCase().trim();

    const target = await prisma.profile.findUnique({ where: { userId: targetUserId } });
    if (!target) return NextResponse.json({ error: 'User profile not found' }, { status: 404 });

    if (normalizedEmail === targetUserId) {
      return NextResponse.json({ error: 'Cannot link the account\'s own email' }, { status: 400 });
    }
    if (isIiucEmail(normalizedEmail)) {
      return NextResponse.json({ error: 'University emails cannot be linked. Use a personal email (e.g. a Gmail).' }, { status: 400 });
    }

    // Existing profile row for the address: placeholder rows (pending/rejected/
    // banned — usually the owner's own earlier sign-in attempt) are cleared so
    // the address can be freshly linked. Real active accounts still block.
    const existing = await prisma.profile.findUnique({ where: { userId: normalizedEmail } });
    if (existing) {
      const inert = existing.accountStatus === 'pending' || existing.accountStatus === 'rejected' || !!existing.isBanned;
      if (!inert) {
        return NextResponse.json({ error: 'This email is already associated with another account' }, { status: 400 });
      }
      try {
        await prisma.profile.delete({ where: { userId: existing.userId } });
        const { invalidateStatusCache } = await import('@/lib/auth-options');
        invalidateStatusCache(existing.userId);
      } catch {}
    }
    if (await isLinkedElsewhere(normalizedEmail, targetUserId)) {
      return NextResponse.json({ error: 'This email is already associated with another account' }, { status: 400 });
    }

    const currentLinked: string[] = (() => { try { return JSON.parse(target.linkedEmails as string || '[]'); } catch { return []; } })();
    if (currentLinked.includes(normalizedEmail)) {
      return NextResponse.json({ error: 'Email already linked' }, { status: 400 });
    }
    if (currentLinked.length >= 5) {
      return NextResponse.json({ error: 'Maximum 5 linked emails allowed' }, { status: 400 });
    }

    await prisma.profile.update({
      where: { userId: targetUserId },
      data: { linkedEmails: JSON.stringify([...currentLinked, normalizedEmail]) },
    });
    invalidateLinkedEmail(normalizedEmail);

    // Make the personal email a real login identity and send a password-set
    // email to that inbox, so the owner can sign in with email + password.
    await ensureFirebaseIdentity(normalizedEmail);
    const resetLinkSent = await sendPasswordResetLink(normalizedEmail);

    return NextResponse.json({
      success: true,
      linkedEmails: [...currentLinked, normalizedEmail],
      resetLinkSent,
    });
  } catch (err: any) {
    console.error('[admin/link-email] error:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Failed to link email' }, { status: 500 });
  }
}