import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { getUserEmail } from '@/lib/get-user';
import { getRepoBotToken } from '@/lib/github-app';
import { decrypt, isEncrypted } from '@/lib/crypto';
import { hasPermission } from '@/lib/permissions';
import { ghFetch } from '@/lib/github-commit';
import { mergePullRequest } from '@/lib/github-merge';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export const maxDuration = 60;

const GITHUB_API = 'https://api.github.com';

// Auto-merges a contributor PR created via the app. The merge runs with the
// GitHub App bot (or server GITHUB_TOKEN) because a contributor's PAT has no
// write access to the upstream repo. Only the PR author (or an owner) may
// trigger the merge for a given PR.
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.upload);
  if (!rl.success) return rl.response!;

  try {
    const email = await getUserEmail(req);
    if (!email) {
      return NextResponse.json({ error: 'Unauthorized — please login', status: 401 }, { status: 401 });
    }

    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    if (profile?.isBanned) {
      return NextResponse.json({ error: 'Account banned' }, { status: 403 });
    }

    const canUpload = await hasPermission('uploadFile', config.getEffectiveRole(email), false, email);
    const isOwner = config.ownerEmails.includes(email) || profile?.githubLogin === config.owner;
    if (!canUpload && !isOwner) {
      return NextResponse.json({ error: 'No upload permission' }, { status: 403 });
    }

    const { prNumber } = await req.json().catch(() => ({}));
    if (!prNumber || typeof prNumber !== 'number') {
      return NextResponse.json({ error: 'prNumber is required' }, { status: 400 });
    }

    // ── Ownership check: only the PR author (or an owner) may merge it ──
    const botToken = (await getRepoBotToken(config.owner, config.repo)) || process.env.GITHUB_TOKEN || '';
    if (!botToken) {
      return NextResponse.json(
        { error: 'Merge unavailable — no bot token configured', merged: false, prUrl: `https://github.com/${config.owner}/${config.repo}/pull/${prNumber}` },
        { status: 200 }
      );
    }

    const prRes = await ghFetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/pulls/${prNumber}`, botToken);
    if (!prRes.ok) {
      return NextResponse.json({ error: 'Pull request not found' }, { status: 404 });
    }
    const prData = await prRes.json();
    if (prData.state !== 'open') {
      return NextResponse.json({ error: 'Pull request is not open', merged: false, prUrl: prData.html_url }, { status: 200 });
    }

    if (!isOwner) {
      const authorLogin = await resolveRequesterLogin(email, profile);
      if (!authorLogin || prData.head?.user?.login !== authorLogin) {
        return NextResponse.json({ error: 'You can only merge your own pull requests' }, { status: 403 });
      }
    }

    const { merged, url, error } = await mergePullRequest(prNumber);
    return NextResponse.json({ merged, prUrl: url, error: error || undefined });
  } catch (e: any) {
    console.error('[merge-pr] error:', e?.message || e);
    return NextResponse.json({ error: 'Failed to merge pull request' }, { status: 500 });
  }
}

// Resolve the authenticated user's GitHub login: stored PAT → NextAuth session
// → stored githubLogin. Used to confirm the PR belongs to the requester.
async function resolveRequesterLogin(email: string, profile: any): Promise<string | null> {
  let token = '';
  if (profile?.githubToken) {
    const decrypted = isEncrypted(profile.githubToken) ? decrypt(profile.githubToken) : profile.githubToken;
    if (decrypted.startsWith('ghp_') || decrypted.startsWith('github_pat_')) token = decrypted;
  }
  if (!token) {
    try {
      const session = await getServerSession(authOptions);
      token = session?.accessToken || '';
    } catch {}
  }
  if (token) {
    try {
      const res = await ghFetch(`${GITHUB_API}/user`, token);
      if (res.ok) {
        const u = await res.json();
        if (u?.login) return u.login;
      }
    } catch {}
  }
  return profile?.githubLogin || null;
}
