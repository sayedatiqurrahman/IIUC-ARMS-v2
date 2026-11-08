import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getUserEmail } from '@/lib/get-user';
import { getGoogleOAuthConfig, buildGmailAuthUrl } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

export async function GET(req: NextRequest) {
  const email = await getUserEmail(req);
  const origin = new URL(req.url).origin;
  const returnTo = safeReturnTo(req.nextUrl.searchParams.get('returnTo'));

  if (!email) {
    return NextResponse.redirect(new URL(`/?signin=1&returnTo=${encodeURIComponent(returnTo)}`, origin));
  }

  const { configured } = getGoogleOAuthConfig();
  if (!configured) {
    return NextResponse.redirect(new URL(`${returnTo}${returnTo.includes('?') ? '&' : '?'}gmail=unconfigured`, origin));
  }

  const nonce = randomBytes(16).toString('hex');
  const state = Buffer.from(JSON.stringify({ email, nonce, returnTo }), 'utf8').toString('base64url');
  const authUrl = buildGmailAuthUrl({ origin, state, loginHint: email });

  const res = NextResponse.redirect(authUrl);
  res.cookies.set('gmail_oauth_state', nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  return res;
}
