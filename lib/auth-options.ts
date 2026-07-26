import GitHubProvider from 'next-auth/providers/github';
import CredentialsProvider from 'next-auth/providers/credentials';
import type { NextAuthOptions } from 'next-auth';

const IIUC_STUDENT_REGEX = /^[^@]+@ugrad\.iiuc\.ac\.bd$/i;
const IIUC_TEACHER_REGEX = /^[^@]+@iiuc\.ac\.bd$/i;
const OWNER_EMAILS = [
  'quranicsciencesclub@gmail.com',
  's.atiqurrahman2003@gmail.com',
];

function isAllowedEmail(email: string): boolean {
  return IIUC_STUDENT_REGEX.test(email) || IIUC_TEACHER_REGEX.test(email) || OWNER_EMAILS.includes(email);
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
        if (!credentials?.idToken) {
          console.error('[AUTH] No idToken provided');
          return null;
        }

        // Verify Turnstile token
        if (credentials.turnstileToken) {
          try {
            const { verifyTurnstile } = await import('@/lib/verifyTurnstile');
            const turnstileValid = await verifyTurnstile(credentials.turnstileToken);
            if (!turnstileValid) {
              console.error('[AUTH] Turnstile verification failed');
              return null;
            }
          } catch (err) {
            console.warn('Turnstile verification skipped');
          }
        }

        // Try Firebase Admin verification first
        const decoded = await verifyFirebaseToken(credentials.idToken);
        if (decoded) {
          const email = decoded.email || credentials.email;
          console.log('[AUTH] Firebase verified, email:', email, 'email_verified:', decoded.email_verified);
          if (!email || !isAllowedEmail(email)) {
            console.error('[AUTH] Email not allowed:', email);
            return null;
          }
          if (decoded.email_verified === false) {
            console.error('[AUTH] Email not verified');
            return null;
          }
          // Check if user is banned
          try {
            const { prisma } = await import('@/lib/prisma');
            const profile = await prisma.profile.findUnique({ where: { userId: email } });
            if (profile?.isBanned) {
              console.error('[AUTH] User is banned:', email);
              return null;
            }
          } catch {}
          console.log('[AUTH] Auth successful for:', email);
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
          if (parts.length !== 3) {
            console.error('[AUTH] Invalid JWT format, parts:', parts.length);
            return null;
          }
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
          const email = credentials.email || payload.email;
          console.log('[AUTH] JWT fallback, email:', email, 'email_verified:', payload.email_verified);
          if (!email || !isAllowedEmail(email)) {
            console.error('[AUTH] JWT: Email not allowed:', email);
            return null;
          }
          if (payload.email_verified === false) {
            console.error('[AUTH] JWT: Email not verified');
            return null;
          }
          // Check if user is banned
          try {
            const { prisma } = await import('@/lib/prisma');
            const profile = await prisma.profile.findUnique({ where: { userId: email } });
            if (profile?.isBanned) {
              console.error('[AUTH] JWT: User is banned:', email);
              return null;
            }
          } catch {}
          console.log('[AUTH] JWT fallback successful for:', email);
          return {
            id: payload.sub || email,
            email,
            name: credentials.name || payload.name || email.split('@')[0],
            image: credentials.image || payload.picture || null,
          };
        } catch (e) {
          console.error('[AUTH] JWT fallback error:', e);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      const email = user.email || (profile as any)?.email;
      if (!email || !isAllowedEmail(email)) return '/auth/error?error=invalid-email';

      // Check if user is banned
      try {
        const { prisma } = await import('@/lib/prisma');
        const existing = await prisma.profile.findUnique({ where: { userId: email } });
        if (existing?.isBanned) return '/auth/error?error=account-banned';
      } catch {}

      if (account?.provider === 'github') {
        try {
          const token = account.access_token;
          const emailRes = await fetch('https://api.github.com/user/emails', {
            headers: { Authorization: `token ${token}` },
          });
          if (emailRes.ok) {
            const emails = await emailRes.json();
            const allowedEmail = emails.find((e: any) => e.primary && isAllowedEmail(e.email));
            if (allowedEmail) {
              user.email = allowedEmail.email;
            } else {
              return '/auth/error?error=invalid-email';
            }
          }

          const githubLogin = (profile as any)?.login || user.name || '';
          if (githubLogin && user.email) {
            try {
              const { prisma } = await import('@/lib/prisma');
              const existing = await prisma.profile.findUnique({ where: { userId: user.email } });
              await prisma.profile.upsert({
                where: { userId: user.email },
                update: {
                  githubLogin,
                  email: user.email,
                },
                create: { userId: user.email, email: user.email, githubLogin },
              });
            } catch {}
          }
        } catch {}
      }

      return true;
    },
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token;
      }
      if (profile) {
        token.email = profile.email;
        token.name = profile.name;
        token.picture = (profile as any).picture;
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).accessToken = token.accessToken;
      if (session.user) {
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.image = token.picture as string;
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
};
