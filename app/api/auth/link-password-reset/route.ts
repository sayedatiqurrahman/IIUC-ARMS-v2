import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

// Sends a password-set email to a LINKED (secondary) email so its owner can
// create a password and then sign in with that account directly. The email's
// presence as a linked identity of an authorized account is the proof of
// ownership — no other session/authorization is required. The Firebase identity
// is ensured to exist first (with emailVerified) so the reset link works even
// if the address was never turned into a Firebase user.
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.auth);
  if (!rl.success) return rl.response!;
  try {
    const body = await req.json();
    const rawEmail = (body?.email || '').toLowerCase().trim();
    if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
    }

    const { isIiucEmail, isLinkedIdentity, ensureFirebaseIdentity, sendPasswordResetLink } = await import('@/lib/linked-accounts');
    // Never reset passwords for university / owner addresses here — this is
    // strictly for linked (secondary) identities.
    if (isIiucEmail(rawEmail)) {
      return NextResponse.json({ error: 'Not a linked (secondary) email' }, { status: 400 });
    }
    if (!(await isLinkedIdentity(rawEmail))) {
      return NextResponse.json({ error: 'This email is not linked to any account. Link it first from your account settings.' }, { status: 400 });
    }

    await ensureFirebaseIdentity(rawEmail);
    const sent = await sendPasswordResetLink(rawEmail);
    if (!sent) {
      return NextResponse.json({ error: 'Failed to send the password-set email. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, email: rawEmail });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to send password-set email' }, { status: 500 });
  }
}
