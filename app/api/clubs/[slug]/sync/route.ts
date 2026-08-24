import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { config } from '@/lib/config';
import { syncClubFromDB } from '@/lib/club-data';

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    const role = config.getEffectiveRole(email, profile?.role);
    if (!config.isAdminOrAbove(email, profile?.role) && !config.isManager(email, profile?.role)) {
      return NextResponse.json({ error: 'Only admins/managers can sync' }, { status: 403 });
    }

    const { slug } = await params;
    const result = await syncClubFromDB(slug);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
