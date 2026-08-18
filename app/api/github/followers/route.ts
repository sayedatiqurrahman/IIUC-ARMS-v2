import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { decrypt, isEncrypted } from '@/lib/crypto';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;

  try {
    const email = await getUserEmail(req);
    if (!email || !config.ownerEmails.includes(email.toLowerCase())) {
      return NextResponse.json({ error: 'Only the owner can run this' }, { status: 403 });
    }

    const { prisma } = await import('@/lib/prisma');
    const profiles = await prisma.profile.findMany({
      where: { githubToken: { not: null }, githubLogin: { not: null } },
      select: { userId: true, githubLogin: true, githubToken: true },
    });

    let followed = 0;
    let skipped = 0;

    for (const p of profiles) {
      if (!p.githubToken) {
        skipped++;
        continue;
      }
      let token = p.githubToken;
      try {
        if (isEncrypted(token)) token = decrypt(token);
        if (!token) {
          skipped++;
          continue;
        }
        const res = await fetch(`https://api.github.com/user/following/${config.owner}`, {
          method: 'PUT',
          headers: {
            Authorization: `token ${token}`,
            Accept: 'application/vnd.github.v3+json',
          },
        });
        if (res.ok) followed++;
        else skipped++;
      } catch {
        skipped++;
      }
    }

    return NextResponse.json({ success: true, total: profiles.length, followed, skipped });
  } catch (err: any) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }
}
