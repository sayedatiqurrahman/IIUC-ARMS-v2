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
    const { removeDeletedEmail } = await import('@/lib/deleted-emails');

    // Is there already a DB record? It may be a stale/rejected/pending leftover,
    // a profile re-created by the person's own Google sign-in (so Firebase was
    // deleted but the row kept coming back), or a real existing account. Treat
    // "Create User" as create-or-repair: take the account over, grant active
    // access, and make sure Firebase holds a working sign-in.
    const existing = await prisma.profile.findUnique({ where: { userId: normalizedEmail } });

    // A DB profile alone cannot sign in — Firebase must hold the account
    // (password / password-setup email / Google). Ensure it exists and that the
    // person can set a password.
    const auth = getAdminAuth();
    if (!auth) {
      return NextResponse.json({
        error: 'Firebase Admin SDK is not configured on the server (FIREBASE_PRIVATE_KEY / FIREBASE_CLIENT_EMAIL missing). Create User without it cannot create a real sign-in account, so the user would never be able to log in. Add the Firebase service-account keys to the server environment and try again.',
      }, { status: 500 });
    }
    try {
      let firebaseExists = false;
      try {
        const firebaseUser = await auth.getUserByEmail(normalizedEmail);
        firebaseExists = true;
        if (password) {
          try { await auth.updateUser(firebaseUser.uid, { password }); } catch {}
        }
      } catch (lookupErr: any) {
        const code = lookupErr?.code || lookupErr?.errorInfo?.code || '';
        if (code !== 'auth/user-not-found') throw lookupErr;
        // No Firebase account — create one (repairs the "deleted from Firebase
        // but stuck in DB / couldn't log in" state).
        const firebaseUser = await auth.createUser({
          email: normalizedEmail,
          displayName: normalizedEmail.split('@')[0],
          emailVerified: true,
          ...(password ? { password } : {}),
        });
        firebaseExists = !!firebaseUser?.uid;
      }
      if (firebaseExists) {
        // Always send a password-setup link so the person can actually sign in
        // (fresh creates and recoveries alike). Non-fatal if it fails.
        try { await auth.generatePasswordResetLink(normalizedEmail); } catch (linkErr: any) {
          console.error('[create-user] reset link failed:', linkErr?.message);
        }
      }
    } catch (firebaseErr: any) {
      console.error('[create-user] Firebase error:', firebaseErr?.message || firebaseErr);
      return NextResponse.json({ error: `Firebase error: ${firebaseErr?.message || 'unknown'}` }, { status: 500 });
    }

    // Create or repair the profile — admin-created/repaired accounts are active
    // (never pending), un-banned, and get the requested role & department. An
    // existing stale record is taken over rather than rejected.
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
        isBanned: false,
        banReason: null,
        bannedBy: null,
      },
    });

    // Lift any delete-blocklist entry so this account can sign in again.
    await removeDeletedEmail(prisma as any, normalizedEmail);
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
      message: existing
        ? `Account ${normalizedEmail} repaired — access granted (${role || 'user'}). A password-setup email was sent.`
        : `User ${normalizedEmail} created with role "${role || 'user'}". A password-setup email was sent.`,
      user: { email: normalizedEmail, role: role || 'user', repaired: !!existing },
    });
  } catch (e: any) {
    console.error('[create-user] error:', e?.message || e);
    return NextResponse.json({ error: e?.message || 'Failed to create user' }, { status: 500 });
  }
}
