import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export async function POST(req: NextRequest) {
  try {
    const { idToken, recaptchaToken } = await req.json();

    if (!idToken) {
      return NextResponse.json({ error: 'Firebase ID token required' }, { status: 400 });
    }

    // Verify reCAPTCHA if token provided
    if (recaptchaToken && process.env.RECAPTCHA_SECRET_KEY) {
      try {
        const recaptchaRes = await fetch(
          `https://recaptchaenterprise.googleapis.com/v1/projects/qsis-arms/assessments?key=${process.env.RECAPTCHA_SECRET_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event: {
                token: recaptchaToken,
                expectedAction: 'LOGIN',
                siteKey: process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY,
              },
            }),
          }
        );

        if (recaptchaRes.ok) {
          const recaptchaData = await recaptchaRes.json();
          if (recaptchaData.score < 0.5) {
            return NextResponse.json({ error: 'reCAPTCHA verification failed' }, { status: 403 });
          }
        }
      } catch (err) {
        console.warn('reCAPTCHA verification skipped:', err);
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
