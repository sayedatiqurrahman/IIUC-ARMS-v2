import { NextRequest } from 'next/server';
import { config } from '@/lib/config';
import { encrypt } from '@/lib/crypto';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state') || '';

  if (!code) {
    return new Response('<script>window.close()</script>', { headers: { 'Content-Type': 'text/html' } });
  }

  let connected = false;
  let accessToken = '';

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
    accessToken = tokenData.access_token || '';

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
          const encryptedToken = encrypt(tokenData.access_token);
          await prisma.profile.upsert({
            where: { userId: email },
            update: {
              githubLogin: githubUser.login,
              githubToken: encryptedToken,
              image: existing?.image ? existing.image : (githubUser.avatar_url || null),
            },
            create: {
              userId: email,
              email,
              githubLogin: githubUser.login,
              githubToken: encryptedToken,
              image: githubUser.avatar_url || null,
            },
          });
          connected = true;

          // Auto-star both repos
          for (const { owner, repo } of config.githubStarRepos) {
            try {
              await fetch(`https://api.github.com/user/starred/${owner}/${repo}`, {
                method: 'PUT',
                headers: {
                  Authorization: `token ${tokenData.access_token}`,
                  Accept: 'application/vnd.github.v3+json',
                  'Content-Length': '0',
                },
              });
            } catch {}
          }
        } catch (err) {
          // DB save failed
        }
      }
    }
  } catch {
    // GitHub OAuth error
  }

  return new Response(
    `<script>
      if (window.opener) {
        window.opener.postMessage({ type: 'github-connected', connected: ${connected}, token: ${JSON.stringify(accessToken)} }, ${JSON.stringify(process.env.NEXTAUTH_URL || 'http://localhost:3000')});
        window.close();
      } else {
        window.location.href = '/dashboard';
      }
    </script>`,
    { headers: { 'Content-Type': 'text/html' } }
  );
}
