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
    const { targetEmail, name, role, department, semester, section } = body;

    if (!targetEmail || !targetEmail.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }

    const validRoles = ['admin', 'manager', 'teacher', 'student', 'user'];
    if (role && !validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const { prisma } = await import('@/lib/prisma');
    const { getAdminAuth } = await import('@/lib/firebase-admin');

    const normalizedEmail = targetEmail.toLowerCase().trim();

    // Check if user already exists
    const existing = await prisma.profile.findUnique({ where: { userId: normalizedEmail } });
    if (existing) {
      return NextResponse.json({ error: 'User already exists. Use the Users tab to manage them.' }, { status: 409 });
    }

    // Create Firebase Auth user (send password reset so they can set their own password)
    let firebaseUid = '';
    const auth = getAdminAuth();
    if (auth) {
      try {
        const firebaseUser = await auth.createUser({
          email: normalizedEmail,
          displayName: name || normalizedEmail.split('@')[0],
          emailVerified: true,
        });
        firebaseUid = firebaseUser.uid;
        // Send password setup email
        await auth.generatePasswordResetLink(normalizedEmail);
      } catch (firebaseErr: any) {
        // If user already exists in Firebase, continue
        if (firebaseErr.code !== 'auth/email-already-exists') {
          console.error('[create-user] Firebase error:', firebaseErr.message);
        }
      }
    }

    // Create profile in database
    await prisma.profile.upsert({
      where: { userId: normalizedEmail },
      create: {
        userId: normalizedEmail,
        email: normalizedEmail,
        name: name || normalizedEmail.split('@')[0],
        role: role || 'user',
        department: department || null,
        semester: semester || null,
        section: section || null,
      },
      update: {
        name: name || normalizedEmail.split('@')[0],
        role: role || 'user',
        department: department || undefined,
        semester: semester || undefined,
        section: section || undefined,
      },
    });

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
            name: name || normalizedEmail.split('@')[0],
            role: role || 'user',
            department: department || null,
          }),
        },
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: `User ${normalizedEmail} created with role "${role || 'user'}"`,
      user: { email: normalizedEmail, name: name || normalizedEmail.split('@')[0], role: role || 'user' },
    });
  } catch (e: any) {
    console.error('[create-user] error:', e?.message || e);
    return NextResponse.json({ error: e?.message || 'Failed to create user' }, { status: 500 });
  }
}
