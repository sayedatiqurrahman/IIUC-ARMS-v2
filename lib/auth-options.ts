import GitHubProvider from 'next-auth/providers/github';
import CredentialsProvider from 'next-auth/providers/credentials';
import type { NextAuthOptions } from 'next-auth';
import { isIiucEmail } from '@/lib/linked-accounts';

const IIUC_STUDENT_REGEX = /^[^@]+@ugrad\.iiuc\.ac\.bd$/i;
const IIUC_TEACHER_REGEX = /^[^@]+@iiuc\.ac\.bd$/i;
const OWNER_EMAILS = [
  'quranicsciencesclub@gmail.com',
  's.atiqurrahman2003@gmail.com',
];

function isAllowedEmail(email: string): boolean {
  const e = email.toLowerCase();
  return IIUC_STUDENT_REGEX.test(e) || IIUC_TEACHER_REGEX.test(e) || OWNER_EMAILS.includes(e);
}

// next-auth's browser signIn() calls `new URL(data.url)` on the returned
// callback URL, so a RELATIVE path (e.g. "/auth/pending") throws
// "Failed to construct 'URL': Invalid URL" and the whole login silently fails.
// Every URL this callback returns must therefore be absolute.
function absolutePath(path: string): string {
  const base = process.env.NEXTAUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  if (!base) return path;
  return `${base.replace(/\/+$/, '')}${path}`;
}

async function hasAdminCreatedProfile(email: string): Promise<boolean> {
  try {
    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({ where: { userId: email.toLowerCase() } });
    if (!profile) return false;
    return !isAllowedEmail(email);
  } catch {
    return false;
  }
}

// Cache account status for 60s to avoid DB hit on every 30s session poll
const statusCache = new Map<string, { status: string; ts: number }>();
const STATUS_CACHE_TTL = 60_000;

async function getAccountStatus(email: string): Promise<string | null> {
  const key = email.toLowerCase();
  const cached = statusCache.get(key);
  if (cached && Date.now() - cached.ts < STATUS_CACHE_TTL) return cached.status;
  try {
    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({ where: { userId: key }, select: { accountStatus: true } });
    const status = profile?.accountStatus || 'active';
    statusCache.set(key, { status, ts: Date.now() });
    return status;
  } catch {
    return cached?.status || null;
  }
}
export { getAccountStatus };

export function invalidateStatusCache(email?: string) {
  if (email) statusCache.delete(email);
  else statusCache.clear();
}

async function ensurePendingProfile(email: string, name?: string): Promise<void> {
  try {
    // Never re-provision a pending account for an email an admin has deleted.
    const { isDeletedEmail } = await import('@/lib/deleted-emails');
    if (await isDeletedEmail(email)) return;
    const { prisma } = await import('@/lib/prisma');
    const { roleForEmail } = await import('@/lib/roles');
    const normalized = email.toLowerCase();
    const existing = await prisma.profile.findUnique({ where: { userId: normalized }, select: { accountStatus: true } });
    const isNew = !existing;
    await prisma.profile.upsert({
      where: { userId: normalized },
      update: {},
      create: { userId: normalized, email: normalized, name: name || normalized.split('@')[0], role: roleForEmail(email), accountStatus: 'pending' },
    });
    if (isNew) {
      const { notifyAdminsPendingAccount } = await import('@/lib/telegram/notifications');
      await notifyAdminsPendingAccount(email, name);
    }
  } catch {}
}

async function verifyFirebaseToken(idToken: string) {
  try {
    const { adminAuth } = await import('@/lib/firebase-admin');
    const decoded = await adminAuth.verifyIdToken(idToken);
    return decoded;
  } catch {
    return null;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
      authorization: { params: { scope: 'repo user:email' } },
    }),
    CredentialsProvider({
      name: 'Firebase',
      credentials: {
        idToken: { label: 'ID Token', type: 'text' },
        email: { label: 'Email', type: 'email' },
        name: { label: 'Name', type: 'text' },
        image: { label: 'Image', type: 'text' },
        turnstileToken: { label: 'Turnstile Token', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.idToken) { console.log('[Auth] authorize: no idToken'); return null; }

        // Verify Turnstile token (skip for TOTP step — already verified at login)
        if (credentials.turnstileToken) {
          try {
            const { verifyTurnstile } = await import('@/lib/verifyTurnstile');
            const turnstileValid = await verifyTurnstile(credentials.turnstileToken);
            if (!turnstileValid) return null;
          } catch {
            // Turnstile verification skipped
          }
        }

        // Try Firebase Admin verification first
        const decoded = await verifyFirebaseToken(credentials.idToken);
        console.log('[Auth] authorize: Firebase token decoded =', !!decoded, decoded?.email);
        if (decoded) {
          let email = (decoded.email || credentials.email || '').toLowerCase();
          if (!email) { console.log('[Auth] authorize: no email from token'); return null; }
          // A linked (secondary) email ALWAYS belongs to its primary account.
          // Resolve it before any other check so a leftover/stale profile row
          // for the secondary address can never detach the login from the
          // original account.
          if (!isIiucEmail(email)) {
            const { resolveSignInEmail } = await import('@/lib/linked-accounts');
            const resolved = (await resolveSignInEmail(email) || '').toLowerCase();
            if (resolved && resolved !== email) email = resolved;
          }
          // A deleted blocklisted email can never sign in.
          const { isDeletedEmail } = await import('@/lib/deleted-emails');
          if (await isDeletedEmail(email)) { console.log('[Auth] authorize: blocklisted (deleted) email', email); return null; }
          let allowed = isAllowedEmail(email) || await hasAdminCreatedProfile(email);
          console.log('[Auth] authorize: email =', email, 'allowed =', allowed);

          if (!allowed) {
            console.log('[Auth] authorize: NOT ALLOWED — creating pending profile for', email);
            await ensurePendingProfile(email, credentials.name);
            return {
              id: decoded.sub || email,
              email,
              name: credentials.name || decoded.name || email.split('@')[0],
              image: credentials.image || decoded.picture || null,
            } as any;
          }
          if (decoded.email_verified === false) { console.log('[Auth] authorize: email not verified'); return null; }
          try {
            const { prisma } = await import('@/lib/prisma');
            const profile = await prisma.profile.findUnique({ where: { userId: email } });
            if (profile?.isBanned) return null;
            if (profile?.accountStatus === 'rejected') return null;
          } catch {}
          return {
            id: decoded.sub || email,
            email,
            name: credentials.name || decoded.name || email.split('@')[0],
            image: credentials.image || decoded.picture || null,
          };
        }

        // Fallback: decode JWT manually (for dev/testing)
        try {
          const parts = credentials.idToken.split('.');
          if (parts.length !== 3) return null;
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
          let email = (credentials.email || payload.email || '').toLowerCase();
          if (!email) return null;
          if (!isIiucEmail(email)) {
            const { resolveSignInEmail } = await import('@/lib/linked-accounts');
            const resolved = (await resolveSignInEmail(email) || '').toLowerCase();
            if (resolved && resolved !== email) email = resolved;
          }
          const { isDeletedEmail } = await import('@/lib/deleted-emails');
          if (await isDeletedEmail(email)) { console.log('[Auth] authorize: blocklisted (deleted) email', email); return null; }
          let allowed = isAllowedEmail(email) || await hasAdminCreatedProfile(email);
          if (!allowed) return null;
          if (payload.email_verified === false) return null;
          try {
            const { prisma } = await import('@/lib/prisma');
            const profile = await prisma.profile.findUnique({ where: { userId: email } });
            if (profile?.isBanned) return null;
          } catch {}
          return {
            id: payload.sub || email,
            email,
            name: credentials.name || payload.name || email.split('@')[0],
            image: credentials.image || payload.picture || null,
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      try {
        let email = (user.email || (profile as any)?.email || '').toLowerCase();
        if (email) {
          const { resolveSignInEmail } = await import('@/lib/linked-accounts');
          email = (await resolveSignInEmail(email) || '').toLowerCase();
        }
        console.log('[Auth] signIn callback — email:', email, 'provider:', account?.provider);
        if (!email) { console.log('[Auth] signIn: no email, rejecting'); return absolutePath('/auth/error?error=invalid-email'); }

        // A deleted blocklisted email can never sign in.
        const { isDeletedEmail } = await import('@/lib/deleted-emails');
        if (await isDeletedEmail(email)) { console.log('[Auth] signIn: blocklisted (deleted) email', email); return absolutePath('/auth/error?error=account-deleted'); }

        // Allow if it's a standard IIUC email OR if user has an admin-created profile
        const allowed = isAllowedEmail(email) || await hasAdminCreatedProfile(email);
        console.log('[Auth] signIn: allowed =', allowed, 'isAllowed =', isAllowedEmail(email));
        if (!allowed) {
          await ensurePendingProfile(email, user.name || undefined);
          return absolutePath('/auth/pending');
        }

        // Check if user is banned or rejected
        try {
          const { prisma } = await import('@/lib/prisma');
          const existing = await prisma.profile.findUnique({ where: { userId: email } });
          if (existing?.isBanned) return absolutePath('/auth/error?error=account-banned');
          if (existing?.accountStatus === 'rejected') return absolutePath('/auth/error?error=account-rejected');
          // For IIUC/owner emails, auto-activate if pending (they are pre-approved)
          if (existing?.accountStatus === 'pending' && isAllowedEmail(email)) {
            await prisma.profile.update({ where: { userId: email }, data: { accountStatus: 'active' } });
          } else if (existing?.accountStatus === 'pending') {
            return absolutePath('/auth/pending');
          }
        } catch {}

        if (account?.provider === 'github') {
          try {
            const token = account.access_token;
            const emailRes = await fetch('https://api.github.com/user/emails', {
              headers: { Authorization: `token ${token}` },
            });
            if (emailRes.ok) {
              const emails = await emailRes.json();
              let allowedEmail = emails.find((e: any) => e.primary && isAllowedEmail(e.email));
              if (!allowedEmail) {
                for (const e of emails) {
                  if (e.primary && await hasAdminCreatedProfile(e.email)) {
                    allowedEmail = e;
                    break;
                  }
                }
              }
              if (allowedEmail) {
                user.email = allowedEmail.email;
              } else {
                return absolutePath('/auth/error?error=invalid-email');
              }
            }

            const githubLogin = (profile as any)?.login || user.name || '';
            if (githubLogin && user.email) {
              try {
                const { prisma } = await import('@/lib/prisma');
                const { roleForEmail } = await import('@/lib/roles');
                await prisma.profile.upsert({
                  where: { userId: user.email },
                  update: { githubLogin, email: user.email },
                  create: { userId: user.email, email: user.email, githubLogin, role: roleForEmail(user.email) },
                });
              } catch {}
            }
          } catch {}
        }

        return true;
      } catch (err) {
        console.error('[Auth] signIn callback unexpected error:', err);
        return true;
      }
    },
    async jwt({ token, account, profile }) {
      try {
        if (account) {
          token.accessToken = account.access_token;
        }
        if (profile) {
          token.email = profile.email;
          token.name = profile.name;
          token.picture = (profile as any).picture;
        }
        if (token.email) {
          const status = await getAccountStatus(token.email as string);
          token.accountStatus = status || 'active';
        }
      } catch (err) {
        console.error('[Auth] jwt callback error:', err);
      }
      return token;
    },
    async session({ session, token }) {
      try {
        (session as any).accessToken = token.accessToken;
        // Refresh account status from DB on every session poll so pending/rejected
        // users lose access immediately when an admin moves/approves them.
        if (token.email) {
          const status = await getAccountStatus(token.email as string);
          (session as any).accountStatus = status || 'active';
        } else {
          (session as any).accountStatus = token.accountStatus || 'active';
        }
        if (session.user) {
          session.user.email = token.email as string;
          session.user.name = token.name as string;
          session.user.image = token.picture as string;
        }
      } catch (err) {
        console.error('[Auth] session callback error:', err);
      }
      return session;
    },
  },
  pages: {
    signIn: '/',
    error: '/auth/error',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
  secret: process.env.NEXTAUTH_SECRET,
  cookies: {
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    callbackUrl: {
      name: `next-auth.callback-url`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    csrfToken: {
      name: `next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
};
