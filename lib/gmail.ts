// Gmail sending via the Google Gmail API (HTTPS, no SMTP).
// Each admin/issuer connects their own Google account once; we store the
// refresh token encrypted and mint short-lived access tokens on demand.

import { encrypt, decrypt, isEncrypted } from '@/lib/crypto';

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email';

export function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  return {
    clientId,
    clientSecret,
    configured: !!(clientId && clientSecret),
  };
}

export function gmailRedirectUri(origin: string): string {
  return process.env.GOOGLE_OAUTH_REDIRECT_URI || `${origin}/api/email/gmail/callback`;
}

export function buildGmailAuthUrl(opts: { origin: string; state: string; loginHint?: string }): string {
  const { clientId } = getGoogleOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: gmailRedirectUri(opts.origin),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    scope: GMAIL_SCOPE,
    state: opts.state,
  });
  if (opts.loginHint) params.set('login_hint', opts.loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGmailCode(code: string, origin: string): Promise<{ refresh_token?: string; access_token: string; scope?: string }> {
  const { clientId, clientSecret } = getGoogleOAuthConfig();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: gmailRedirectUri(origin),
      grant_type: 'authorization_code',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error_description || data?.error || 'token-exchange-failed');
  return data;
}

export async function refreshGmailAccessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = getGoogleOAuthConfig();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(data?.error_description || data?.error || 'token-refresh-failed');
  return data.access_token as string;
}

export async function getGmailAddress(accessToken: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok || !data.email) throw new Error('Could not read Google account email');
  return String(data.email).toLowerCase();
}

function encodeHeader(value: string): string {
  // RFC 2047 encoding for non-ASCII subjects/names.
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function toBase64Url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildMimeMessage(opts: { from: string; fromName?: string; to: string; subject: string; html: string; text: string }): string {
  const boundary = `----iiuc-arms-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const fromHeader = opts.fromName ? `${encodeHeader(opts.fromName)} <${opts.from}>` : opts.from;
  const mime = [
    `From: ${fromHeader}`,
    `To: ${opts.to}`,
    `Subject: ${encodeHeader(opts.subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    '',
    Buffer.from(opts.text, 'utf8').toString('base64'),
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    '',
    Buffer.from(opts.html, 'utf8').toString('base64'),
    `--${boundary}--`,
    '',
  ].join('\r\n');
  return toBase64Url(mime);
}

export async function sendGmailMessage(opts: {
  accessToken: string;
  from: string;
  fromName?: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const raw = buildMimeMessage(opts);
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    let reason = '';
    try {
      const data = await res.json();
      reason = data?.error?.message || data?.error || '';
    } catch {}
    throw new Error(`gmail-send-failed${reason ? `: ${reason}` : ` (${res.status})`}`);
  }
}

// ---- Storage helpers ------------------------------------------------------

export async function getConnectedSender(userId: string): Promise<{ email: string; refreshToken: string } | null> {
  try {
    const { prisma } = await import('@/lib/prisma');
    const row = await prisma.emailSender.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    if (!row) return null;
    const refreshToken = isEncrypted(row.refreshToken) ? decrypt(row.refreshToken) : row.refreshToken;
    return { email: row.email, refreshToken };
  } catch {
    return null;
  }
}

export async function saveConnectedSender(userId: string, email: string, refreshToken: string, scope?: string): Promise<void> {
  const { prisma } = await import('@/lib/prisma');
  const encrypted = encrypt(refreshToken);
  await prisma.emailSender.upsert({
    where: { email },
    update: { userId, refreshToken: encrypted, scope: scope || null },
    create: { userId, email, refreshToken: encrypted, scope: scope || null },
  });
}

export async function removeConnectedSender(userId: string): Promise<void> {
  const { prisma } = await import('@/lib/prisma');
  await prisma.emailSender.deleteMany({ where: { userId } });
}
