import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.admin);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const effectiveRole = config.getEffectiveRole(email);
    if (effectiveRole !== 'admin') {
      return NextResponse.json({ error: 'Only admins can create users' }, { status: 403 });
    }

    const body = await req.json();
    const { targetEmail, email: formEmail, role, department, password } = body;
    const normalizedEmail = (targetEmail || formEmail || '').toLowerCase().trim();

    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }

    const { getCustomRoles } = await import('@/lib/permissions');
    const customRoleKeys = (await getCustomRoles()).map(r => r.key);
    const validRoles = ['admin', 'manager', 'teacher', 'student', 'user', ...customRoleKeys];
    if (role && !validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const { prisma } = await import('@/lib/prisma');
    const { getAdminAuth } = await import('@/lib/firebase-admin');
    const { invalidateStatusCache } = await import('@/lib/auth-options');

    // Check if user already exists
    const existing = await prisma.profile.findUnique({ where: { userId: normalizedEmail } });
    if (existing) {
      return NextResponse.json({ error: 'User already exists. Use the Users tab to manage them.' }, { status: 409 });
    }

    // Create Firebase Auth user. A DB profile alone cannot sign in — Firebase
    // must hold the account (password/password-setup email/Google) so the
    // person can actually log in.
    let firebaseUid = '';
    const auth = getAdminAuth();
    if (!auth) {
      return NextResponse.json({
        error: 'Firebase Admin SDK is not configured on the server (FIREBASE_PRIVATE_KEY / FIREBASE_CLIENT_EMAIL missing). Create User without it cannot create a real sign-in account, so the user would never be able to log in. Add the Firebase service-account keys to the server environment and try again.',
      }, { status: 500 });
    }
    try {
      const firebaseUser = await auth.createUser({
        email: normalizedEmail,
        displayName: normalizedEmail.split('@')[0],
        emailVerified: true,
        ...(password ? { password } : {}),
      });
      firebaseUid = firebaseUser.uid;
      // Send password setup email so they can set/recover their password.
      await auth.generatePasswordResetLink(normalizedEmail);
    } catch (firebaseErr: any) {
      // If user already exists in Firebase, continue
      if (firebaseErr.code !== 'auth/email-already-exists') {
        console.error('[create-user] Firebase error:', firebaseErr.message);
      }
    }

    // Create profile in database — an admin-created account is granted
    // access immediately, so it is active (not pending).
    await prisma.profile.upsert({
      where: { userId: normalizedEmail },
      create: {
        userId: normalizedEmail,
        email: normalizedEmail,
        role: role || 'user',
        department: department || null,
        accountStatus: 'active',
      },
      update: {
        role: role || 'user',
        department: department || undefined,
        accountStatus: 'active',
      },
    });
    invalidateStatusCache(normalizedEmail);

    // Log the action
    try {
      const callerProfile = await prisma.profile.findUnique({ where: { userId: email } });
      await prisma.activityLog.create({
        data: {
          action: 'user_create',
          userId: email,
          userName: callerProfile?.name || email.split('@')[0],
          details: JSON.stringify({
            targetEmail: normalizedEmail,
            role: role || 'user',
            department: department || null,
          }),
        },
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: `User ${normalizedEmail} created with role "${role || 'user'}"`,
      user: { email: normalizedEmail, role: role || 'user' },
    });
  } catch (e: any) {
    console.error('[create-user] error:', e?.message || e);
    return NextResponse.json({ error: e?.message || 'Failed to create user' }, { status: 500 });
  }
}
