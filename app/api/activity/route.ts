import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;
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

    const [activities, total] = await Promise.all([
      prisma.activityLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.activityLog.count(),
    ]);

    // Build merged user list from Firebase + Prisma (same logic as /api/admin/users)
    let firebaseUsers: any[] = [];
    try {
      const { getAdminAuth } = await import('@/lib/firebase-admin');
      const auth = getAdminAuth();
      if (auth) {
        const listResult = await auth.listUsers(1000);
        firebaseUsers = Array.isArray(listResult?.users) ? listResult.users : [];
      }
    } catch {}

    const profiles = await prisma.profile.findMany({
      select: { email: true, role: true, githubLogin: true, isBanned: true, department: true },
    });
    const profileMap = new Map(profiles.map(p => [p.email?.toLowerCase(), p]));

    // Merge Firebase + Prisma
    const mergedUsers: { email: string; role: string; isBanned: boolean; department: string | null }[] = [];
    const seen = new Set<string>();

    for (const fu of firebaseUsers) {
      const userEmail = fu.email?.toLowerCase();
      if (!userEmail || seen.has(userEmail)) continue;
      seen.add(userEmail);
      const profile = profileMap.get(userEmail);
      mergedUsers.push({
        email: userEmail,
        role: profile?.role || config.detectRole(userEmail),
        isBanned: profile?.isBanned || false,
        department: profile?.department || null,
      });
    }
    for (const [emailKey, profile] of Array.from(profileMap.entries())) {
      if (!seen.has(emailKey)) {
        seen.add(emailKey);
        mergedUsers.push({
          email: emailKey,
          role: profile.role || 'user',
          isBanned: profile.isBanned || false,
          department: profile.department || null,
        });
      }
    }

    // Count from merged list
    let studentCount = 0;
    let teacherCount = 0;
    let specialCount = 0;
    let externalCount = 0;
    let adminCount = 0;
    let managerCount = 0;
    let bannedCount = 0;

    for (const u of mergedUsers) {
      if (u.isBanned) bannedCount++;
      if (u.role === 'admin') adminCount++;
      else if (u.role === 'manager') managerCount++;
      else if (u.role === 'teacher') teacherCount++;
      else {
        const e = u.email;
        if (/@ugrad\.iiuc\.ac\.bd$/i.test(e)) studentCount++;
        else if (/@iiuc\.ac\.bd$/i.test(e)) teacherCount++;
        else externalCount++;
      }
    }

    const githubConnected = profiles.filter(p => p.githubLogin).length;

    return NextResponse.json({
      activities,
      total,
      stats: {
        total: mergedUsers.length,
        admins: adminCount,
        managers: managerCount,
        teachers: teacherCount,
        students: studentCount,
        users: externalCount,
        external: externalCount,
        banned: bannedCount,
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
