import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { getUserEmail } from '@/lib/get-user';
import { getRepoBotToken } from '@/lib/github-app';
import { decrypt, isEncrypted } from '@/lib/crypto';
import { STUDIO_REPO } from '@/lib/studio-apps';

export const maxDuration = 60;

// Returns a browser-safe GitHub token so the Studio "Contribute an app" flow
// can commit apps/<id>/ + studio-apps.json DIRECTLY from the browser to GitHub.
// No app bytes ever touch this server — only this tiny token hand-off.
//
// Priority: the uploader's OWN GitHub credential (stored PAT or one pasted in
// the modal) so they push with their account → a freshly-minted, repo-scoped
// GitHub App installation token (expires in ~1h) → server GITHUB_TOKEN, which
// NEVER leaves the server (we return needsServer and the client shows a retry
// message instead of falling back to a server-side commit).
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.upload);
  if (!rl.success) return rl.response!;

  try {
    const email = await getUserEmail(req);
    if (!email) {
      return NextResponse.json({ error: 'Sign in first to contribute an app.' }, { status: 401 });
    }

    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    if (profile?.isBanned) {
      return NextResponse.json({ error: 'Account banned — publishing not allowed' }, { status: 403 });
    }

    let storedPat = '';
    if (profile?.githubToken) {
      const decrypted = isEncrypted(profile.githubToken) ? decrypt(profile.githubToken) : profile.githubToken;
      if (decrypted.startsWith('ghp_') || decrypted.startsWith('github_pat_')) storedPat = decrypted;
    }
    const body = await req.json().catch(() => ({}));
    const bodyToken =
      typeof body.githubToken === 'string' && (body.githubToken.startsWith('ghp_') || body.githubToken.startsWith('github_pat_'))
        ? body.githubToken
        : '';

    if (storedPat || bodyToken) {
      return NextResponse.json({ tokenKind: 'pat', token: storedPat || bodyToken });
    }

    const botToken = await getRepoBotToken(STUDIO_REPO.owner, STUDIO_REPO.repo);
    if (botToken) {
      return NextResponse.json({ tokenKind: 'bot', token: botToken });
    }

    if (process.env.GITHUB_TOKEN) {
      return NextResponse.json({ tokenKind: 'env', needsServer: true });
    }

    return NextResponse.json(
      { error: 'Publishing is temporarily unavailable. Please try again in a minute, or ask the admin to check the GitHub App setup.', code: 'NO_SERVER_TOKEN' },
      { status: 503 }
    );
  } catch (e: any) {
    console.error('[studio publish-token] error:', e?.message || e);
    return NextResponse.json({ error: 'Failed to prepare publish' }, { status: 500 });
  }
}
