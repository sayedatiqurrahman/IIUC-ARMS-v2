import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export async function GET(req: NextRequest) {
  const debug: Record<string, any> = {};

  // 1. Check NextAuth session
  try {
    const session = await getServerSession(authOptions);
    debug.nextAuth = {
      hasSession: !!session,
      email: session?.user?.email || null,
      name: session?.user?.name || null,
      accessToken: !!(session as any).accessToken,
    };
  } catch (err: any) {
    debug.nextAuth = { error: err.message };
  }

  // 2. Check Firebase cookies
  const fbIdToken = req.cookies.get('fb_id_token')?.value;
  const fbRefreshToken = req.cookies.get('fb_refresh_token')?.value;
  debug.firebase = {
    hasIdToken: !!fbIdToken,
    idTokenLength: fbIdToken?.length || 0,
    hasRefreshToken: !!fbRefreshToken,
  };

  // 3. Try to verify Firebase token
  if (fbIdToken) {
    try {
      const { adminAuth } = await import('@/lib/firebase-admin');
      const decoded = await adminAuth.verifyIdToken(fbIdToken);
      debug.firebase.decoded = { email: decoded.email, uid: decoded.uid };
    } catch (err: any) {
      debug.firebase.verifyError = err.message;
    }
  }

  // 3b. Admin SDK initialized (service account usable)?
  try {
    const { getAdminAuth } = await import('@/lib/firebase-admin');
    const auth = getAdminAuth();
    debug.firebase.adminReady = !!auth;
    if (!auth) debug.firebase.adminError = 'Firebase Admin SDK did not initialize — check the service-account credentials';
  } catch (err: any) {
    debug.firebase.adminError = err.message;
  }

  // 4. Check DB connection
  try {
    const { prisma } = await import('@/lib/prisma');
    const email = debug.nextAuth?.email || debug.firebase?.decoded?.email;
    if (email) {
      const profile = await prisma.profile.findUnique({ where: { userId: email } });
      debug.db = {
        connected: true,
        profileExists: !!profile,
        profileFields: profile ? Object.keys(profile) : [],
        githubLogin: profile?.githubLogin || null,
      };
    } else {
      debug.db = { connected: true, noEmail: true };
    }
  } catch (err: any) {
    debug.db = { error: err.message };
  }

  // 5. Environment check
  debug.env = {
    hasNextauthSecret: !!process.env.NEXTAUTH_SECRET,
    hasNextauthUrl: !!process.env.NEXTAUTH_URL,
    nextauthUrl: process.env.NEXTAUTH_URL,
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    hasFirebaseServiceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT,
    hasFirebasePrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
    hasFirebaseClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
    hasFirebaseProjectId: !!(process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
  };

  return NextResponse.json(debug, { status: 200 });
}
