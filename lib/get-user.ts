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
    if (session?.user?.email) {
      console.log('[getUserEmail] Found via NextAuth session:', session.user.email);
      return session.user.email;
    }
    console.warn('[getUserEmail] NextAuth session returned but no email:', session);
  } catch (err: any) {
    console.error('[getUserEmail] NextAuth getServerSession failed:', err.message);
  }

  // Fallback: try Firebase ID token from HttpOnly cookie
  if (req) {
    const idToken = req.cookies.get('fb_id_token')?.value;
    if (idToken) {
      try {
        const { adminAuth } = await import('@/lib/firebase-admin');
        const decoded = await adminAuth.verifyIdToken(idToken);
        if (decoded.email) {
          console.log('[getUserEmail] Found via Firebase token:', decoded.email);
          return decoded.email;
        }
      } catch (err: any) {
        console.error('[getUserEmail] Firebase token verification failed:', err.message);
      }
    } else {
      console.warn('[getUserEmail] No fb_id_token cookie found');
    }
  } else {
    console.warn('[getUserEmail] No request object provided');
  }

  console.error('[getUserEmail] All auth methods failed — returning null');
  return null;
}
