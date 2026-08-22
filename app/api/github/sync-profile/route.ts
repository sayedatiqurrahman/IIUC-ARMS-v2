import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { withDbRetry } from '@/lib/prisma';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.profile);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const profile = await withDbRetry(() =>
      prisma.profile.findUnique({ where: { userId: email } })
    );
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    const token = profile.githubToken;
    if (!token) return NextResponse.json({ error: 'No GitHub token connected' }, { status: 400 });

    const ghRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
    });
    if (!ghRes.ok) {
      return NextResponse.json({ error: 'GitHub token invalid or expired', valid: false }, { status: 400 });
    }
    const ghUser = await ghRes.json();

    const updateData: Record<string, any> = {};
    if (ghUser.login) updateData.githubLogin = ghUser.login;
    if (ghUser.avatar_url) updateData.githubAvatar = ghUser.avatar_url;
    if (ghUser.name && !profile.name) updateData.name = ghUser.name;

    const updated = await withDbRetry(() =>
      prisma.profile.update({ where: { userId: email }, data: updateData })
    );

    return NextResponse.json({
      success: true,
      valid: true,
      githubLogin: ghUser.login,
      githubAvatar: ghUser.avatar_url,
      name: updated.name,
      bio: ghUser.bio || '',
      public_repos: ghUser.public_repos || 0,
      followers: ghUser.followers || 0,
      following: ghUser.following || 0,
      location: ghUser.location || '',
      created_at: ghUser.created_at || '',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Sync failed' }, { status: 500 });
  }
}
