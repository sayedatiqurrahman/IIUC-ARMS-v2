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

// Authoritative "may this email sign in?" decision used by both authorize and
// the signIn callback. Returns true when the address is:
//   - a standard IIUC / owner email, OR
//   - a linked (secondary) identity of any approved profile, OR
//   - an admin-approved external account (profile exists with an active status
//     or an assigned role/privilege).
// This is the single source of truth so a user can never be mis-routed to the
// approval gate once their account (or an account it resolves to) is approved.
async function isAccountAllowed(email: string): Promise<boolean> {
  const e = (email || '').toLowerCase().trim();
  if (!e) return false;
  if (isAllowedEmail(e) || isIiucEmail(e)) return true;
  try {
    // A linked (secondary) identity is itself an allowed account: linking it
    // from the dashboard is only possible while signed in as an approved user,
    // so its very presence proves it was deliberately authorized.
    const { resolveLinkedEmail } = await import('@/lib/linked-accounts');
    if (await resolveLinkedEmail(e)) return true;
    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({
      where: { userId: e },
      select: { accountStatus: true, role: true, isCR: true, isACR: true },
    });
    if (!profile) return false;
    if (profile.accountStatus === 'rejected' || profile.accountStatus === 'banned') return false;
    // A profile with an active status, or any assigned role / CR / ACR counts as
    // approved — assigning any of those IS approval.
    if (profile.accountStatus === 'active') return true;
    if (profile.accountStatus === 'pending' || profile.accountStatus === null || profile.accountStatus === undefined) {
      if (profile.role && profile.role !== 'user' && profile.role !== 'external') return true;
      if (profile.isCR || profile.isACR) return true;
    }
    return false;
  } catch {
    return false;
  }
}

// The email a sign-in should be treated as. Resolves linked (secondary) emails
// to their primary, then re-checks whether that resolved account is allowed.
async function resolveAndAllow(email: string): Promise<{ resolved: string; allowed: boolean }> {
  const lower = (email || '').toLowerCase().trim();
  if (!lower) return { resolved: lower, allowed: false };
  if (isAllowedEmail(lower)) return { resolved: lower, allowed: true };
  const { resolveSignInEmail } = await import('@/lib/linked-accounts');
  let resolved = (await resolveSignInEmail(lower) || '').toLowerCase();
  if (!resolved) resolved = lower;
  return { resolved, allowed: await isAccountAllowed(resolved) };
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
          // The raw address the user is actually signing in with. It may be a
          // linked (secondary) email, which has its own (proved) ownership even
          // before we resolve it to the primary below.
          const rawSignInEmail = email;
          // Resolve linked (secondary) emails to their primary, then decide
          // authoritatively whether the (resolved) account is allowed. A linked
          // email ALWAYS belongs to its primary account, so it must never be
          // treated as an unapproved standalone address.
          if (!isIiucEmail(email)) {
            const { resolved, allowed } = await resolveAndAllow(email);
            if (allowed) {
              email = resolved;
            } else if (resolved !== email && resolved) {
              // `resolved` != input means this address appears in some allowed
              // profile's linkedEmails (resolveLinkedEmail found a primary). That
              // is AUTHORITATIVE proof it is a linked (secondary) identity of an
              // allowed account, so it must never be gated as a standalone
              // unapproved address. Whenever the primary resolves, allow login.
              console.log('[Auth] authorize: linked to primary —', email, '->', resolved);
              email = resolved;
              // Self-heal: ensure an active mirror row exists for this linked
              // email so it is recognized as a linked identity on future logins
              // even if the linkedEmails list can't be scanned.
              try {
                const { prisma } = await import('@/lib/prisma');
                const { upsertLinkedMirror } = await import('@/lib/linked-accounts');
                await upsertLinkedMirror(prisma, resolved, rawSignInEmail);
              } catch {}
            } else {
              // Not resolved to a primary and not already allowed. Use the
              // authoritative linked check (active mirror OR listed in some
              // active profile's linkedEmails). A linked identity NEVER hits the
              // request-access gate — it signs in as itself.
              const isLinked = await import('@/lib/linked-accounts').then(m => m.isLinkedIdentity(email));
              if (isLinked) {
                console.log('[Auth] authorize: linked identity allowed as itself —', email);
              } else if (decoded.email_verified !== false) {
                // Strong ownership proof: Firebase verified this address (e.g. a
                // real Google account the user fully owns). If it already has a
                // real, non-rejected/non-banned profile in our DB, it is a valid
                // sign-in (DB-first). Only brand-new, never-seen addresses are
                // routed to the request-access gate.
                try {
                  const { prisma } = await import('@/lib/prisma');
                  const own = await prisma.profile.findUnique({
                    where: { userId: email },
                    select: { accountStatus: true, isBanned: true },
                  });
                  if (own && own.accountStatus !== 'rejected' && own.accountStatus !== 'banned' && own.accountStatus !== 'pending') {
                    console.log('[Auth] authorize: verified existing DB account allowed —', email);
                  } else {
                    console.log('[Auth] authorize: NOT ALLOWED — redirecting to request-access for', email);
                    return {
                      id: decoded.sub || email,
                      email,
                      name: credentials.name || decoded.name || email.split('@')[0],
                      image: credentials.image || decoded.picture || null,
                    } as any;
                  }
                } catch {
                  return {
                    id: decoded.sub || email,
                    email,
                    name: credentials.name || decoded.name || email.split('@')[0],
                    image: credentials.image || decoded.picture || null,
                  } as any;
                }
              } else {
                console.log('[Auth] authorize: NOT ALLOWED — redirecting to request-access for', email);
                return {
                  id: decoded.sub || email,
                  email,
                  name: credentials.name || decoded.name || email.split('@')[0],
                  image: credentials.image || decoded.picture || null,
                } as any;
              }
            }
          } else {
            const { isDeletedEmail } = await import('@/lib/deleted-emails');
            if (await isDeletedEmail(email)) { console.log('[Auth] authorize: blocklisted (deleted) email', email); return null; }
          }

          // A deleted blocklisted email can never sign in — even a linked one.
          try {
            const { isDeletedEmail } = await import('@/lib/deleted-emails');
            if (await isDeletedEmail(email)) { console.log('[Auth] authorize: blocklisted (deleted) email', email); return null; }
          } catch {}

          // Email-verification enforcement. A LINKED (secondary) identity is
          // exempt: ownership is already proven by the primary account that
          // linked it (or by completing a one-time sign-in link), and its very
          // presence in an authorized profile's linkedEmails means it was
          // deliberately allowed. Requiring emailVerified here makes linked
          // logins fail with a 401 even though the account is fully allowed.
          const isLinked = !isIiucEmail(rawSignInEmail) &&
            !!(await import('@/lib/linked-accounts').then(m => m.isLinkedIdentity(rawSignInEmail)));
          if (decoded.email_verified === false && !isLinked) {
            // An unverified non-linked account. Do NOT return null here — that
            // surfaces a confusing "admin must accept" CredentialsSignin error.
            // Instead route through the request-access gate (honest UI). A gmail
            // that exists in our DB with an active/banned-else status, or is the
            // exact account the user is signing into, is allowed to proceed.
            try {
              const { prisma } = await import('@/lib/prisma');
              const own = await prisma.profile.findUnique({
                where: { userId: email },
                select: { accountStatus: true, isBanned: true },
              });
              const real = own && own.accountStatus !== 'rejected' && own.accountStatus !== 'banned' && own.accountStatus !== 'pending';
              if (!real) {
                console.log('[Auth] authorize: email not verified (unknown profile) — routing to gate for', email);
                return {
                  id: decoded.sub || email,
                  email,
                  name: credentials.name || decoded.name || email.split('@')[0],
                  image: credentials.image || decoded.picture || null,
                } as any;
              }
            } catch {
              return {
                id: decoded.sub || email,
                email,
                name: credentials.name || decoded.name || email.split('@')[0],
                image: credentials.image || decoded.picture || null,
              } as any;
            }
          }
          try {
            const { prisma } = await import('@/lib/prisma');
            const profile = await prisma.profile.findUnique({ where: { userId: email } });
            if (profile?.isBanned) return null;
            if (profile?.accountStatus === 'rejected') return null;
          } catch {}
          // DB-first: record/refresh this account in our database on every
          // authenticate, so a Firebase identity not yet in the DB is auto-saved
          // on first sign-in and the DB stays the source of truth.
          try {
            const { persistAuthProfile } = await import('@/lib/auth-persist');
            await persistAuthProfile({
              email,
              name: credentials.name || decoded.name || email.split('@')[0],
              image: credentials.image || decoded.picture || null,
            });
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
          const rawSignInEmail = email;
          if (!isIiucEmail(email)) {
            const { resolved, allowed } = await resolveAndAllow(email);
            email = resolved;
            if (!allowed) return null;
          }
          const { isDeletedEmail } = await import('@/lib/deleted-emails');
          if (await isDeletedEmail(email)) { console.log('[Auth] authorize: blocklisted (deleted) email', email); return null; }
          const fallbackLinked = !isIiucEmail(rawSignInEmail) && !!(await import('@/lib/linked-accounts').then(m => m.isLinkedIdentity(rawSignInEmail)));
          if (payload.email_verified === false && !fallbackLinked) return null;
          try {
            const { prisma } = await import('@/lib/prisma');
            const profile = await prisma.profile.findUnique({ where: { userId: email } });
            if (profile?.isBanned) return null;
          } catch {}
          try {
            const { persistAuthProfile } = await import('@/lib/auth-persist');
            await persistAuthProfile({
              email,
              name: credentials.name || payload.name || email.split('@')[0],
              image: credentials.image || payload.picture || null,
            });
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
        const rawEmail = (user.email || (profile as any)?.email || '').toLowerCase();
        let email = rawEmail;
        let allowed = isAllowedEmail(email);
        if (!allowed && email) {
          const r = await resolveAndAllow(email);
          email = r.resolved;
          allowed = r.allowed;
          if (!allowed && !isIiucEmail(rawEmail)) {
            // A linked (secondary) identity is allowed as itself via its active
            // mirror profile, even when primary resolution fails. Never gate it.
            const { isLinkedIdentity } = await import('@/lib/linked-accounts');
            if (await isLinkedIdentity(rawEmail)) {
              email = rawEmail;
              allowed = true;
            }
          }
        }
        console.log('[Auth] signIn callback — email:', email, 'provider:', account?.provider, 'allowed:', allowed);
        if (!email) { console.log('[Auth] signIn: no email, rejecting'); return absolutePath('/auth/error?error=invalid-email'); }

        // A deleted blocklisted email can never sign in.
        const { isDeletedEmail } = await import('@/lib/deleted-emails');
        if (await isDeletedEmail(email)) { console.log('[Auth] signIn: blocklisted (deleted) email', email); return absolutePath('/auth/error?error=account-deleted'); }

        // Allow if it's a standard IIUC email OR if the (possibly linked/resolved)
        // account is admin-approved. Approved / linked accounts never hit the gate.
        if (!allowed) {
          return absolutePath(`/auth/request-access?email=${encodeURIComponent(email)}`);
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

        // Keep a linked (secondary) identity's mirror in sync with its primary on
        // every login: the linked email inherits the SAME role / CR / ACR / status
        // as the account it's linked to, so a freshly-linked email (or one whose
        // primary role changed since linking) always logs in with the right
        // privileges and is never treated as an unapproved standalone address.
        try {
          const { upsertLinkedMirror, isLinkedIdentity } = await import('@/lib/linked-accounts');
          const { prisma } = await import('@/lib/prisma');
          if (rawEmail !== email && await isLinkedIdentity(rawEmail)) {
            await upsertLinkedMirror(prisma, email, rawEmail);
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

        // DB-first safety net: ensure the authenticated account exists/refreshed
        // in our database (catches any provider that didn't reach the persist in
        // authorize). Never changes roles/status — existence + identity only.
        try {
          const { persistAuthProfile } = await import('@/lib/auth-persist');
          await persistAuthProfile({
            email,
            name: user.name || email.split('@')[0],
            image: user.image || null,
            githubLogin: (profile as any)?.login || undefined,
          });
        } catch {}

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
