import { NextRequest, NextResponse } from 'next/server';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

export async function POST(req: NextRequest) {
  try {
    const refreshToken = req.cookies.get('fb_refresh_token')?.value;

    if (!refreshToken) {
      return NextResponse.json({ error: 'No refresh token' }, { status: 401 });
    }

    // Use Firebase REST API to refresh the token
    const res = await fetch(
      `https://securetoken.googleapis.com/v1/token?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      }
    );

    const data = await res.json();

    if (data.error) {
      return NextResponse.json({ error: data.error.message }, { status: 401 });
    }

    const response = NextResponse.json({ success: true });

    // Update cookies with new tokens
    response.cookies.set('fb_id_token', data.id_token, {
      ...COOKIE_OPTIONS,
      maxAge: parseInt(data.expires_in) || 3600,
    });

    response.cookies.set('fb_refresh_token', data.refresh_token, {
      ...COOKIE_OPTIONS,
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    const expiresAt = Date.now() + (parseInt(data.expires_in) || 3600) * 1000;
    response.cookies.set('fb_token_expires', String(expiresAt), {
      ...COOKIE_OPTIONS,
      maxAge: parseInt(data.expires_in) || 3600,
    });

    return response;
  } catch {
    return NextResponse.json({ error: 'Refresh failed' }, { status: 500 });
  }
}
