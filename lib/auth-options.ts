import GitHubProvider from 'next-auth/providers/github';
import CredentialsProvider from 'next-auth/providers/credentials';
import type { NextAuthOptions } from 'next-auth';

const IIUC_EMAIL_REGEX = /^q\d{5,8}@ugrad\.iiuc\.ac\.bd$/i;
const OWNER_EMAILS = [
  'quranicsciencesclub@gmail.com',
  's.atiqurrahman2003@gmail.com',
];

function isAllowedEmail(email: string): boolean {
  return IIUC_EMAIL_REGEX.test(email) || OWNER_EMAILS.includes(email);
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
      },
      async authorize(credentials) {
        if (!credentials?.idToken) return null;

        try {
          const parts = credentials.idToken.split('.');
          if (parts.length !== 3) return null;
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
          const email = credentials.email || payload.email;

          if (!email || !isAllowedEmail(email)) return null;

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
      // For Google sign-in, validate email domain
      if (account?.provider === 'google' && profile?.email) {
        if (!isAllowedEmail(profile.email)) {
          return '/auth/error?error=invalid-email';
        }
      }

      // For GitHub, save githubLogin to profile DB
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

          // Save GitHub login to profile DB
          const githubLogin = (profile as any)?.login || user.name || '';
          if (githubLogin && user.email) {
            try {
              const { PrismaClient } = await import('@prisma/client');
              const prisma = new PrismaClient();
              await prisma.profile.upsert({
                where: { userId: user.email },
                update: { githubLogin },
                create: { userId: user.email, email: user.email, githubLogin },
              });
              await prisma.$disconnect();
            } catch {}
          }
        } catch {
          // Allow sign-in if we can't verify (fallback)
        }
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
