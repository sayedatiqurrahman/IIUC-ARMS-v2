import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { invalidateStatusCache } from '@/lib/auth-options';

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.admin);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { confirmEmail } = await req.json();
    if (confirmEmail?.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json({ error: 'Email does not match' }, { status: 400 });
    }

    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    // Block owners from self-deleting
    const { config } = await import('@/lib/config');
    if (config.ownerEmails.includes(email.toLowerCase())) {
      return NextResponse.json({ error: 'Site owners cannot delete their accounts' }, { status: 403 });
    }

    // Remove from club memberships (preserves certificates issued by this user)
    await prisma.clubMember.deleteMany({ where: { userId: email } });

    // Remove club claims
    await prisma.clubClaim.deleteMany({ where: { userId: email } });

    // Remove activity logs
    await prisma.activityLog.deleteMany({ where: { userId: email } });

    // Delete profile — replace with anonymized stub so certificates still reference a name
    await prisma.profile.update({
      where: { userId: email },
      data: {
        name: 'Deleted User',
        image: null,
        email: null,
        whatsapp: null,
        facebook: null,
        linkedin: null,
        twitter: null,
        website: null,
        githubLogin: null,
        githubToken: null,
        githubInstallationId: null,
        githubAvatar: null,
        telegramId: null,
        telegramChatId: null,
        telegramVerified: false,
        telegramOtp: null,
        telegramOtpExpiresAt: null,
        telegramConnectState: null,
        session: null,
        totpEnabled: false,
        totpSecret: null,
        customPermissions: {},
        role: 'user',
        isBanned: false,
        banReason: null,
        bannedBy: null,
        isCR: false,
        isACR: false,
        batchId: null,
        accountStatus: 'deleted',
        linkedEmails: '[]',
        department: null,
        semester: null,
        section: null,
      },
    });

    invalidateStatusCache(email);

    // Delete from Firebase Auth
    try {
      const { getAdminAuth } = await import('@/lib/firebase-admin');
      const auth = getAdminAuth();
      if (auth) {
        try {
          const firebaseUser = await auth.getUserByEmail(email);
          await auth.deleteUser(firebaseUser.uid);
        } catch (fbErr: any) {
          if (fbErr.code !== 'auth/user-not-found') {
            console.error('[Account Delete] Firebase delete error:', fbErr?.message);
          }
        }
      }
    } catch (err: any) {
      console.error('[Account Delete] Firebase delete failed:', err?.message);
    }

    // Clear Firebase session cookies
    const res = NextResponse.json({ success: true, message: 'Account deleted successfully' });
    res.cookies.delete('fb_id_token');
    res.cookies.delete('fb_refresh_token');
    res.cookies.delete('fb_token_expires');
    return res;
  } catch (err: any) {
    console.error('[Account Delete] Error:', err?.message);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}
