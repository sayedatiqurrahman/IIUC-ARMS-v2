import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;

  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ banned: false });

    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({
      where: { userId: email.toLowerCase() },
      select: { isBanned: true, banReason: true },
    });

    if (!profile?.isBanned) {
      return NextResponse.json({ banned: false });
    }

    return NextResponse.json({
      banned: true,
      banReason: profile.banReason || null,
    });
  } catch {
    return NextResponse.json({ banned: false });
  }
}
