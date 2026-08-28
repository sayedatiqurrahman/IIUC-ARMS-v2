import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

// Sets or updates the password for the signed-in user's Firebase identity via
// the Admin SDK. Unlike the client-side updatePassword call, this does NOT
// throw auth/requires-recent-login for sessions that are older than a few
// minutes (e.g. users signed in with Google or a magic link who then try to
// set a password later).
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.auth);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { newPassword } = body;
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const { adminAuth } = await import('@/lib/firebase-admin');
    const resolvedEmail = email.toLowerCase();

    let uid: string;
    try {
      const userRecord = await adminAuth.getUserByEmail(resolvedEmail);
      uid = userRecord.uid;
    } catch {
      // No Firebase identity for this email yet — create one (and keep the
      // password) so email+password login works going forward.
      const created = await adminAuth.createUser({
        email: resolvedEmail,
        emailVerified: true,
        password: newPassword,
      });
      uid = created.uid;
    }

    await adminAuth.updateUser(uid, { password: newPassword });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to set password' }, { status: 500 });
  }
}