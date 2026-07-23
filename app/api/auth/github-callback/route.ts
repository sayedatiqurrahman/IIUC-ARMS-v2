import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state') || '';

  if (!code) {
    return new Response('<script>window.close()</script>', { headers: { 'Content-Type': 'text/html' } });
  }

  let connected = false;

  try {
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
      const userRes = await fetch('https://api.github.com/user', {
        headers: { Authorization: `token ${tokenData.access_token}` },
      });
      const githubUser = await userRes.json();

      const email = state;
      if (email && githubUser.login) {
        try {
          const { prisma } = await import('@/lib/prisma');
          const existing = await prisma.profile.findUnique({ where: { userId: email } });
          await prisma.profile.upsert({
            where: { userId: email },
            update: {
              githubLogin: githubUser.login,
              githubToken: tokenData.access_token,
              image: existing?.image ? existing.image : (githubUser.avatar_url || null),
            },
            create: {
              userId: email,
              email,
              githubLogin: githubUser.login,
              githubToken: tokenData.access_token,
              image: githubUser.avatar_url || null,
            },
          });
          await prisma.$disconnect();
          connected = true;
          console.log('[GitHub Callback] Saved githubLogin:', githubUser.login, 'for', email);
        } catch (err) {
          console.error('[GitHub Callback] DB save failed:', err);
        }
      }
    } else {
      console.error('[GitHub Callback] No access_token:', tokenData);
    }
  } catch (err) {
    console.error('[GitHub Callback] Error:', err);
  }

  return new Response(
    `<script>
      if (window.opener) {
        window.opener.postMessage({ type: 'github-connected', connected: ${connected} }, '*');
        window.close();
      } else {
        window.location.href = '/dashboard';
      }
    </script>`,
    { headers: { 'Content-Type': 'text/html' } }
  );
}
