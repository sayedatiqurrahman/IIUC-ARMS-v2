import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { decrypt, isEncrypted } from '@/lib/crypto';

/**
 * GET /api/github/user-info — Server-side proxy for GitHub user profile + stats.
 * Reads the stored PAT from DB, fetches GitHub API, returns public user info.
 * Never exposes the token to the client.
 */
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.profile);
  if (!rl.success) return rl.response!;

  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    if (!profile?.githubToken) return NextResponse.json({ user: null });

    const token = isEncrypted(profile.githubToken) ? decrypt(profile.githubToken) : profile.githubToken;
    if (!token.startsWith('ghp_') && !token.startsWith('github_pat_') && !token.startsWith('ghs_')) {
      return NextResponse.json({ user: null });
    }

    const headers = { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' };

    // Fetch user profile + stats in parallel
    const [userRes, statsRes] = await Promise.all([
      fetch('https://api.github.com/user', { headers }),
      fetch(`https://api.github.com/users/${profile.githubLogin || ''}`, { headers }),
    ]);

    if (!userRes.ok) return NextResponse.json({ user: null });

    const userData = await userRes.json();
    const statsData = statsRes.ok ? await statsRes.json() : null;

    return NextResponse.json({
      user: {
        login: userData.login,
        name: userData.name,
        avatar_url: userData.avatar_url,
        bio: userData.bio,
        public_repos: statsData?.public_repos,
        followers: statsData?.followers,
        following: statsData?.following,
        created_at: statsData?.created_at,
        location: statsData?.location,
      },
      hasValidToken: true,
    });
  } catch {
    return NextResponse.json({ user: null });
  }
}
