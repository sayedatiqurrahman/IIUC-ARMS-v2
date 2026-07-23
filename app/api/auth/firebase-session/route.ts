import { NextRequest, NextResponse } from 'next/server';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

export async function POST(req: NextRequest) {
  try {
    const { idToken, refreshToken, expiresIn } = await req.json();

    if (!idToken) {
      return NextResponse.json({ error: 'Missing idToken' }, { status: 400 });
    }

    const res = NextResponse.json({ success: true });

    // Store Firebase ID token (access token)
    res.cookies.set('fb_id_token', idToken, {
      ...COOKIE_OPTIONS,
      maxAge: expiresIn || 3600, // default 1 hour
    });

    // Store refresh token
    if (refreshToken) {
      res.cookies.set('fb_refresh_token', refreshToken, {
        ...COOKIE_OPTIONS,
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
    }

    // Store token expiry time
    const expiresAt = Date.now() + (expiresIn || 3600) * 1000;
    res.cookies.set('fb_token_expires', String(expiresAt), {
      ...COOKIE_OPTIONS,
      maxAge: expiresIn || 3600,
    });

    return res;
  } catch {
    return NextResponse.json({ error: 'Failed to set session' }, { status: 500 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.delete('fb_id_token');
  res.cookies.delete('fb_refresh_token');
  res.cookies.delete('fb_token_expires');
  return res;
}
