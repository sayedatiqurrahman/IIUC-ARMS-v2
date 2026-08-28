import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const callerEmail = await getUserEmail(req);
    if (!callerEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const callerProfile = await prisma.profile.findUnique({ where: { userId: callerEmail } });
    if (config.getEffectiveRole(callerEmail, callerProfile?.role || undefined) !== 'admin') {
      return NextResponse.json({ error: 'Only admins can import ETE members' }, { status: 403 });
    }

    const { importEteMembers } = await import('@/lib/ete-seed');
    const result = await importEteMembers(prisma);
    return NextResponse.json({ success: true, ...result });
  } catch {
    return NextResponse.json({ error: 'Failed to import ETE members' }, { status: 500 });
  }
}