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

    // Auto-cleanup: delete activity logs older than 3 months
    const activityCutoff = new Date();
    activityCutoff.setMonth(activityCutoff.getMonth() - 3);
    await prisma.activityLog.deleteMany({ where: { createdAt: { lt: activityCutoff } } });

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
    const bannedUsers = await prisma.profile.count({ where: { isBanned: true } });
    const githubConnected = await prisma.profile.count({ where: { githubLogin: { not: null } } });

    const roleMap: Record<string, number> = {};
    for (const r of userStats) {
      roleMap[r.role || 'user'] = r._count;
    }

    return NextResponse.json({
      activities,
      total,
      stats: {
        total: totalUsers,
        admins: roleMap['admin'] || 0,
        teachers: roleMap['teacher'] || 0,
        students: roleMap['student'] || 0,
        managers: roleMap['manager'] || 0,
        users: (roleMap['user'] || 0) + (roleMap['student'] || 0),
        banned: bannedUsers,
        githubConnected,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load activity' }, { status: 500 });
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
  } catch {
    return NextResponse.json({ error: 'Failed to log activity' }, { status: 500 });
  }
}
