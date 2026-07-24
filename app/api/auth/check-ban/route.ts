import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ banned: false });

    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({ where: { userId: email.toLowerCase() } });

    return NextResponse.json({ banned: !!profile?.isBanned });
  } catch {
    return NextResponse.json({ banned: false });
  }
}
