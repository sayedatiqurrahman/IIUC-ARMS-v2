import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
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
