import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

/**
 * Get the authenticated user's email from either NextAuth session or Firebase ID token.
 * Checks: NextAuth session → Authorization header → fb_id_token cookie.
 */
export async function getUserEmail(req?: NextRequest): Promise<string | null> {
  // Try NextAuth session first
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.email) {
      return session.user.email;
    }
  } catch {
    // NextAuth unavailable
  }

  if (!req) return null;

  // Try Authorization: Bearer <idToken> header
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const idToken = authHeader.slice(7);
    try {
      const { adminAuth } = await import('@/lib/firebase-admin');
      const decoded = await adminAuth.verifyIdToken(idToken);
      if (decoded.email) {
        return decoded.email;
      }
    } catch {
      // Invalid Firebase token in header
    }
  }

  // Fallback: try Firebase ID token from HttpOnly cookie
  const cookieToken = req.cookies.get('fb_id_token')?.value;
  if (cookieToken) {
    try {
      const { adminAuth } = await import('@/lib/firebase-admin');
      const decoded = await adminAuth.verifyIdToken(cookieToken);
      if (decoded.email) {
        return decoded.email;
      }
    } catch {
      // Invalid Firebase token
    }
  }

  return null;
}
