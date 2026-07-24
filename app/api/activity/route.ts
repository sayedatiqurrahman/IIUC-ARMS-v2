import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';

export async function GET(req: NextRequest) {
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const role = config.detectRole(email);
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { prisma } = await import('@/lib/prisma');

    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const [activities, total, userStats, uploadStats] = await Promise.all([
      prisma.activityLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.activityLog.count(),
      prisma.profile.groupBy({
        by: ['role'],
        _count: true,
      }),
      prisma.profile.aggregate({
        _count: {
          githubLogin: true,
          universityId: true,
        },
      }),
    ]);

    const totalUsers = await prisma.profile.count();
    const githubConnected = await prisma.profile.count({ where: { githubLogin: { not: null } } });
    const profileComplete = await prisma.profile.count({ where: { universityId: { not: null }, name: { not: null } } });

    return NextResponse.json({
      activities,
      total,
      stats: {
        totalUsers,
        githubConnected,
        profileComplete,
        byRole: userStats.map(r => ({ role: r.role || 'user', count: r._count })),
      },
    });
  } catch (err: any) {
    console.error('[Activity] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action, details } = body;

    if (!action) return NextResponse.json({ error: 'Action required' }, { status: 400 });

    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({ where: { userId: email } });

    const log = await prisma.activityLog.create({
      data: {
        action,
        userId: email,
        userName: profile?.name || email.split('@')[0],
        details: details || null,
      },
    });

    return NextResponse.json({ success: true, log });
  } catch (err: any) {
    console.error('[Activity] Log error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
