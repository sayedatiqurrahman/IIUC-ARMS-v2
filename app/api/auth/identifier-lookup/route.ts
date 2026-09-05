import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { normalizeUniversityId } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// Resolves a login identifier to the canonical account email for sign-in.
// Accepts either an email address (returned as-is) or a university/versity ID
// (looked up in our DB via the profile's universityId field). This lets users
// sign in with their versity ID instead of an email — the DB is the source of
// truth for identity. Returns nothing sensitive (no password/role/status).
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;

  try {
    const body = await req.json();
    const id = (body?.identifier || '').toString().toLowerCase().trim();
    if (!id) return NextResponse.json({ email: null }, { status: 200 });

    const looksLikeEmail = id.includes('@');

    // If it's an email, return it as-is (normalise to lowercase).
    if (looksLikeEmail) return NextResponse.json({ email: id }, { status: 200 });

    // Otherwise treat it as a versity ID and look it up in our DB.
    const { prisma } = await import('@/lib/prisma');
    const matches = await prisma.profile.findMany({
      where: {
        universityId: { not: null },
        accountStatus: { notIn: ['rejected', 'banned'] },
      },
      select: { userId: true, universityId: true },
    }).catch(() => [] as any[]);

    const hit = matches.find(
      (p: any) =>
        normalizeUniversityId((p.universityId || '').toString()).toLowerCase() === normalizeUniversityId(id).toLowerCase()
    );
    if (hit?.userId) {
      // The account's canonical login email is its userId (or email field).
      return NextResponse.json({ email: hit.userId, versityId: true }, { status: 200 });
    }
    return NextResponse.json({ email: null }, { status: 200 });
  } catch {
    return NextResponse.json({ email: null }, { status: 200 });
  }
}
