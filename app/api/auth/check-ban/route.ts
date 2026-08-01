import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ banned: false });

    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({ where: { userId: email.toLowerCase() } });

    if (!profile?.isBanned) {
      return NextResponse.json({ banned: false });
    }

    return NextResponse.json({
      banned: true,
      banReason: (profile as any).banReason || null,
      bannedBy: (profile as any).bannedBy || null,
    });
  } catch {
    return NextResponse.json({ banned: false });
  }
}
