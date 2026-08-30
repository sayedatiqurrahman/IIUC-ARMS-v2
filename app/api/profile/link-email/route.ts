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
    const { linkEmail, setAsPrimary } = body;

    if (!linkEmail || typeof linkEmail !== 'string') {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const normalizedEmail = linkEmail.toLowerCase().trim();
    if (normalizedEmail === email.toLowerCase()) {
      return NextResponse.json({ error: 'Cannot link your own email' }, { status: 400 });
    }

    // Linking is for personal (non-university) emails so users can keep signing
    // in after their IIUC email expires.
    const { isIiucEmail, isLinkedElsewhere, ensureFirebaseIdentity, sendPasswordResetLink, invalidateLinkedEmail } = await import('@/lib/linked-accounts');
    if (isIiucEmail(normalizedEmail)) {
      return NextResponse.json({ error: 'University emails cannot be linked. Use a personal email (e.g. a Gmail) instead.' }, { status: 400 });
    }

    // Check if this email is already used by another profile (as the primary
    // userId or as one of their linked emails)
    const existing = await prisma.profile.findUnique({ where: { userId: normalizedEmail } });
    if (existing) {
      // A leftover PLACEHOLDER row (pending/rejected/banned — e.g. auto-created
      // by the account owner's own Google sign-in before they linked the
      // address, or a previously-deleted application) must NOT block linking.
      // Remove it so the address can be freshly linked and re-unlinked freely.
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
    if (await isLinkedElsewhere(normalizedEmail, email)) {
      return NextResponse.json({ error: 'This email is already associated with another account' }, { status: 400 });
    }

    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    const currentLinked: string[] = (() => { try { return JSON.parse(profile?.linkedEmails as string || '[]'); } catch { return []; } })();

    if (currentLinked.includes(normalizedEmail)) {
      return NextResponse.json({ error: 'Email already linked' }, { status: 400 });
    }

    // Check limit (max 5 linked emails)
    if (currentLinked.length >= 5) {
      return NextResponse.json({ error: 'Maximum 5 linked emails allowed' }, { status: 400 });
    }

    await prisma.profile.update({
      where: { userId: email },
      data: { linkedEmails: JSON.stringify([...currentLinked, normalizedEmail]) },
    });
    invalidateLinkedEmail(normalizedEmail);

    // Make the address a fully allowed, role-bearing account in its own right:
    // a linked email automatically inherits the primary's role/status, so the
    // approval gate can never show for it (even if resolution is stale).
    const { upsertLinkedMirror, switchPrimary } = await import('@/lib/linked-accounts');
    await upsertLinkedMirror(prisma, email, normalizedEmail);

    if (setAsPrimary) {
      try {
        await ensureFirebaseIdentity(normalizedEmail);
        await switchPrimary(prisma, email, normalizedEmail);
        return NextResponse.json({
          success: true,
          switchedPrimary: true,
          newPrimaryEmail: normalizedEmail,
          message: 'Linked and set as your new primary email! Sign out and sign in again with this new address.',
        });
      } catch (swErr: any) {
        return NextResponse.json({ error: swErr?.message || 'Failed to set as primary' }, { status: 400 });
      }
    }

    // Make the personal email a real login identity, then send a password-set
    // email to that inbox so the owner can log in with email + password.
    await ensureFirebaseIdentity(normalizedEmail);
    const resetLinkSent = await sendPasswordResetLink(normalizedEmail);

    return NextResponse.json({
      success: true,
      linkedEmails: [...currentLinked, normalizedEmail],
      resetLinkSent,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to link email' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.profile);
  if (!rl.success) return rl.response!;
  try {
    const { prisma } = await import('@/lib/prisma');
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { unlinkEmail } = body;

    if (!unlinkEmail || typeof unlinkEmail !== 'string') {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const { invalidateLinkedEmail } = await import('@/lib/linked-accounts');

    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    const currentLinked: string[] = (() => { try { return JSON.parse(profile?.linkedEmails as string || '[]'); } catch { return []; } })();
    const normalizedEmail = unlinkEmail.toLowerCase().trim();

    if (!currentLinked.some(e => e.toLowerCase() === normalizedEmail)) {
      return NextResponse.json({ error: 'Email is not linked' }, { status: 400 });
    }
    const updated = currentLinked.filter(e => e.toLowerCase() !== normalizedEmail);

    await prisma.profile.update({
      where: { userId: email },
      data: { linkedEmails: JSON.stringify(updated) },
    });
    invalidateLinkedEmail(normalizedEmail);

    // Unlinking must ALSO remove the address from Firebase, so a re-link later
    // starts clean (no stale identity reporting "already in use").
    try {
      const { getAdminAuth } = await import('@/lib/firebase-admin');
      const auth = getAdminAuth();
      if (auth) {
        try {
          const record = await auth.getUserByEmail(normalizedEmail);
          await auth.deleteUser(record.uid);
        } catch (firebaseErr: any) {
          const code = firebaseErr?.code || firebaseErr?.errorInfo?.code || '';
          if (code !== 'auth/user-not-found') {
            console.error('[unlink] Firebase identity deletion failed:', firebaseErr?.message || firebaseErr);
          }
        }
      }
    } catch {}

    // Remove the linked-mirror profile (an ACTIVE row auto-created for this
    // address when it was linked) so an unlinked address reverts to being a
    // normal non-account — plus any leftover placeholder rows.
    try {
      const leftover = await prisma.profile.findUnique({ where: { userId: normalizedEmail } });
      const mirror = leftover && (leftover.profileType === 'linked' || leftover.accountStatus === 'pending' || leftover.accountStatus === 'rejected' || leftover.isBanned);
      if (leftover && mirror) {
        await prisma.profile.delete({ where: { userId: normalizedEmail } });
        const { invalidateStatusCache } = await import('@/lib/auth-options');
        invalidateStatusCache(normalizedEmail);
      }
    } catch {}

    return NextResponse.json({ success: true, linkedEmails: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to unlink email' }, { status: 500 });
  }
}
