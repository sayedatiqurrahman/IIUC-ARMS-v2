import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// Explicit "request access" flow for a non-university email. The user submits
// their email + name + student/university ID. This is the ONLY place a pending
// account is auto-created now (sign-ins never silently provision one) and the
// only path that notifies the assigned managers/admins.
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.auth);
  if (!rl.success) return rl.response!;

  try {
    const body = await req.json();
    const email = (body.email || '').toLowerCase().trim();
    const name = (body.name || '').trim();
    const id = (body.id || '').trim();
    const contact = (body.contact || '').trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
    }

    // Optional WhatsApp/Telegram number with country code, e.g. +8801XXXXXXXXX,
    // so the manager approving the request can actually reach the user.
    if (contact && !/^\+?[0-9][0-9\s\-]{6,20}$/.test(contact)) {
      return NextResponse.json({ error: 'Enter your WhatsApp/Telegram number with country code, e.g. +8801XXXXXXXXX' }, { status: 400 });
    }

    const { isIiucEmail, resolveLinkedEmail, ensureFirebaseIdentity } = await import('@/lib/linked-accounts');

    if (isIiucEmail(email)) {
      return NextResponse.json({ error: 'University emails are pre-approved — just sign in with your university email.' }, { status: 400 });
    }
    const primary = await resolveLinkedEmail(email);
    if (primary) {
      return NextResponse.json({ error: 'This email is already connected to an account. Just sign in with it.' }, { status: 400 });
    }

    // A blocked (deleted) email can never be re-provisioned.
    const { isDeletedEmail } = await import('@/lib/deleted-emails');
    if (await isDeletedEmail(email)) {
      return NextResponse.json({ error: 'This email cannot be registered.' }, { status: 400 });
    }

    const { prisma } = await import('@/lib/prisma');
    let status: string | null = null;
    try {
      const profile = await prisma.profile.findUnique({ where: { userId: email }, select: { accountStatus: true } });
      status = profile?.accountStatus || null;
    } catch {}
    if (status === 'active') {
      return NextResponse.json({ error: 'This account is already approved — you can sign in now.' }, { status: 400 });
    }
    if (status === 'rejected') {
      return NextResponse.json({ error: 'This request was previously rejected. Contact an admin if you believe this is a mistake.' }, { status: 400 });
    }
    if (!id || id.length < 3) {
      return NextResponse.json({ error: 'Please enter your student/university ID so a manager can verify you.' }, { status: 400 });
    }

    // If this personal email was never used to sign up, give it a passwordless
    // Firebase identity so, once approved, the user can set a password via the
    // "forgot password" email and sign in.
    await ensureFirebaseIdentity(email);

    const { roleForEmail } = await import('@/lib/roles');
    const displayName = name || email.split('@')[0];
    await prisma.profile.upsert({
      where: { userId: email },
      update: { email, name: displayName, universityId: id, whatsapp: contact || null, accountStatus: 'pending', role: 'user' },
      create: { userId: email, email, name: displayName, universityId: id, whatsapp: contact || null, accountStatus: 'pending', role: roleForEmail(email) },
    });

    const { invalidateStatusCache } = await import('@/lib/auth-options');
    invalidateStatusCache(email);

    const { notifyAdminsPendingAccount } = await import('@/lib/telegram/notifications');
    await notifyAdminsPendingAccount(email, displayName, id, contact);

    return NextResponse.json({
      success: true,
      message: 'Request submitted! A manager will verify your student ID and approve your account once it matches.',
    });
  } catch (err: any) {
    console.error('[RequestAccess] error:', err?.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}