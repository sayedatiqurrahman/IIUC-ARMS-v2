import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

/**
 * Get the authenticated user's email from either NextAuth session or Firebase ID token cookie.
 * Works even when NEXTAUTH_URL doesn't match the deployment domain.
 */
export async function getUserEmail(req?: NextRequest): Promise<string | null> {
  // Try NextAuth session first
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.email) return session.user.email;
  } catch {}

  // Fallback: try Firebase ID token from HttpOnly cookie
  if (req) {
    const idToken = req.cookies.get('fb_id_token')?.value;
    if (idToken) {
      try {
        const { adminAuth } = await import('@/lib/firebase-admin');
        const decoded = await adminAuth.verifyIdToken(idToken);
        if (decoded.email) return decoded.email;
      } catch {}
    }
  }

  return null;
}
