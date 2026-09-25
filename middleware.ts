import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const CANONICAL_HOST = 'arms.iiuc.net';
const REDIRECT_HOSTS = new Set(['iiuc-arms.eu.cc', 'www.arms.iiuc.net', 'qsis-arms.vercel.app']);

export async function middleware(request: NextRequest) {
  const host = request.nextUrl.hostname.toLowerCase();
  if (REDIRECT_HOSTS.has(host)) {
    const url = request.nextUrl.clone();
    url.protocol = 'https:';
    url.hostname = CANONICAL_HOST;
    url.port = '';
    return NextResponse.redirect(url, 308);
  }

  const refreshToken = request.cookies.get('fb_refresh_token')?.value;
  const expiresAt = request.cookies.get('fb_token_expires')?.value;

  // If we have a refresh token and token is expired (or about to expire in 5 min), refresh it
  if (refreshToken && expiresAt) {
    const expiresAtNum = parseInt(expiresAt);
    const now = Date.now();
    const fiveMinMs = 5 * 60 * 1000;

    if (expiresAtNum - now < fiveMinMs) {
      try {
        const refreshRes = await fetch(`${request.nextUrl.origin}/api/auth/refresh`, {
          method: 'POST',
          headers: { Cookie: request.headers.get('cookie') || '' },
        });

        if (refreshRes.ok) {
          const response = NextResponse.next();
          // Copy set-cookie headers from refresh response
          const setCookies = refreshRes.headers.getSetCookie();
          for (const cookie of setCookies) {
            response.headers.append('Set-Cookie', cookie);
          }
          return response;
        }
      } catch {}
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
