import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state') || '';

  if (!code) {
    return new Response('<script>window.close()</script>', { headers: { 'Content-Type': 'text/html' } });
  }

  try {
    // Exchange code for token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_ID,
        client_secret: process.env.GITHUB_SECRET,
        code,
      }),
    });
    const tokenData = await tokenRes.json();

    if (tokenData.access_token) {
      // Get GitHub user info
      const userRes = await fetch('https://api.github.com/user', {
        headers: { Authorization: `token ${tokenData.access_token}` },
      });
      const githubUser = await userRes.json();

      // Save to profile DB
      const email = state;
      if (email && githubUser.login) {
        try {
          const { prisma } = await import('@/lib/prisma');
          const existing = await prisma.profile.findUnique({ where: { userId: email } });
          await prisma.profile.upsert({
            where: { userId: email },
            update: {
              githubLogin: githubUser.login,
              image: existing?.image ? existing.image : (githubUser.avatar_url || null),
            },
            create: {
              userId: email,
              email,
              githubLogin: githubUser.login,
              image: githubUser.avatar_url || null,
            },
          });
          await prisma.$disconnect();
        } catch {}
      }
    }
  } catch {}

  // Close popup and notify parent
  return new Response(
    `<script>
      if (window.opener) {
        window.opener.postMessage({ type: 'github-connected' }, '*');
        window.close();
      } else {
        window.location.href = '/dashboard';
      }
    </script>`,
    { headers: { 'Content-Type': 'text/html' } }
  );
}
