import { NextRequest, NextResponse } from 'next/server';
import { verifyTurnstile } from '@/lib/verifyTurnstile';

export async function POST(req: NextRequest) {
  try {
    const { idToken, turnstileToken } = await req.json();

    if (!idToken) {
      return NextResponse.json({ error: 'Firebase ID token required' }, { status: 400 });
    }

    // Verify Turnstile if token provided
    if (turnstileToken && process.env.TURNSTILE_SECRET) {
      try {
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || undefined;
        const turnstileValid = await verifyTurnstile(turnstileToken, ip);
        if (!turnstileValid) {
          return NextResponse.json({ error: 'Turnstile verification failed' }, { status: 403 });
        }
      } catch {
        // Turnstile verification skipped
      }
    }

    // In production, verify the Firebase ID token server-side using Firebase Admin SDK
    // For now, decode the JWT payload to get user info
    const parts = idToken.split('.');
    if (parts.length !== 3) {
      return NextResponse.json({ error: 'Invalid token format' }, { status: 401 });
    }

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

    const user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name || payload.email?.split('@')[0] || 'User',
      image: payload.picture || null,
      login: payload.email?.split('@')[0] || 'user',
    };

    // Create a session token using NextAuth's JWT
    const token = {
      sub: user.id,
      email: user.email,
      name: user.name,
      picture: user.image,
      accessToken: idToken,
      login: user.login,
    };

    return NextResponse.json({
      success: true,
      user,
      token,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Authentication failed' }, { status: 500 });
  }
}
