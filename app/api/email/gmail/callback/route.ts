import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { getGoogleOAuthConfig, exchangeGmailCode, getGmailAddress, saveConnectedSender } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

function parseState(raw: string | null): { email: string; nonce: string; returnTo: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!parsed?.email || !parsed?.nonce) return null;
    const returnTo = typeof parsed.returnTo === 'string' && parsed.returnTo.startsWith('/') && !parsed.returnTo.startsWith('//')
      ? parsed.returnTo : '/';
    return { email: String(parsed.email), nonce: String(parsed.nonce), returnTo };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin;
  const code = req.nextUrl.searchParams.get('code');
  const state = parseState(req.nextUrl.searchParams.get('state'));
  const cookieNonce = req.cookies.get('gmail_oauth_state')?.value;
  const redirectTo = (suffix: string) => new URL(`${state?.returnTo || '/'}${(state?.returnTo || '/').includes('?') ? '&' : '?'}${suffix}`, origin);

  if (!getGoogleOAuthConfig().configured) {
    return NextResponse.redirect(redirectTo('gmail=unconfigured'));
  }
  if (!code || !state || !cookieNonce || state.nonce !== cookieNonce) {
    return NextResponse.redirect(redirectTo('gmail=error'));
  }

  // The redirect happens in the same browser session, so the logged-in user
  // should still be resolvable. Fall back to the email signed into the state.
  const sessionEmail = await getUserEmail(req);
  if (sessionEmail && sessionEmail.toLowerCase() !== state.email.toLowerCase()) {
    return NextResponse.redirect(redirectTo('gmail=error'));
  }

  try {
    const tokens = await exchangeGmailCode(code, origin);
    if (!tokens.refresh_token) {
      return NextResponse.redirect(redirectTo('gmail=norefresh'));
    }
    const gmailAddress = await getGmailAddress(tokens.access_token);
    await saveConnectedSender(state.email, gmailAddress, tokens.refresh_token, tokens.scope);
    const res = NextResponse.redirect(redirectTo('gmail=connected'));
    res.cookies.set('gmail_oauth_state', '', { httpOnly: true, maxAge: 0, path: '/' });
    return res;
  } catch (err: any) {
    console.error('[gmail-callback] error:', err?.message || err);
    return NextResponse.redirect(redirectTo('gmail=error'));
  }
}
