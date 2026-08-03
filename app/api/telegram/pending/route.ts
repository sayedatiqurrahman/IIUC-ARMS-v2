import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';

export async function GET(req: NextRequest) {
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({
      where: { userId: email },
      select: { telegramChatId: true, telegramVerified: true, telegramId: true },
    });

    if (!profile?.telegramChatId) {
      return NextResponse.json({ connected: false, pending: false });
    }

    if (profile.telegramVerified) {
      return NextResponse.json({ connected: true, pending: false, telegramId: profile.telegramId });
    }

    return NextResponse.json({ connected: false, pending: true, telegramId: profile.telegramId });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
