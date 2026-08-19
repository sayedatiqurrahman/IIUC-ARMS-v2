import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/cron/logs?type=activity|telegram|upload&page=1&limit=20
 * Lists log entries with pagination for the admin log viewer.
 *
 * DELETE /api/cron/logs  { ids: string[], type: 'activity'|'telegram'|'upload' }
 * Deletes specific log entries by ID.
 */

async function authCheck(req: NextRequest) {
  const { getUserEmail } = await import('@/lib/get-user');
  const email = await getUserEmail(req);
  if (!email) return null;

  const { config } = await import('@/lib/config');
  const { prisma } = await import('@/lib/prisma');
  const { hasPermission } = await import('@/lib/permissions');
  const profile = await prisma.profile.findUnique({ where: { userId: email } });
  const role = config.getEffectiveRole(email, profile?.role);
  if (!(await hasPermission('manageCronJobs', role, profile?.isCR || false, email))) return null;
  return email;
}

export async function GET(req: NextRequest) {
  const user = await authCheck(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const type = req.nextUrl.searchParams.get('type') || 'activity';
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(5, parseInt(req.nextUrl.searchParams.get('limit') || '20', 10)));
  const search = req.nextUrl.searchParams.get('q') || '';
  const skip = (page - 1) * limit;

  const { prisma } = await import('@/lib/prisma');

  try {
    if (type === 'activity') {
      const where = search
        ? { OR: [{ action: { contains: search, mode: 'insensitive' as const } }, { userId: { contains: search, mode: 'insensitive' as const } }, { userName: { contains: search, mode: 'insensitive' as const } }, { details: { contains: search, mode: 'insensitive' as const } }] }
        : {};
      const [items, total] = await Promise.all([
        prisma.activityLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
        prisma.activityLog.count({ where }),
      ]);
      return NextResponse.json({ items, total, page, limit, totalPages: Math.ceil(total / limit) });
    }

    if (type === 'telegram') {
      const where = search
        ? { OR: [{ title: { contains: search, mode: 'insensitive' as const } }, { department: { contains: search, mode: 'insensitive' as const } }, { type: { contains: search, mode: 'insensitive' as const } }, { sentBy: { contains: search, mode: 'insensitive' as const } }] }
        : {};
      const [items, total] = await Promise.all([
        prisma.telegramNotification.findMany({ where, orderBy: { sentAt: 'desc' }, skip, take: limit }),
        prisma.telegramNotification.count({ where }),
      ]);
      return NextResponse.json({ items, total, page, limit, totalPages: Math.ceil(total / limit) });
    }

    if (type === 'upload') {
      const where = search
        ? { OR: [{ userId: { contains: search, mode: 'insensitive' as const } }, { path: { contains: search, mode: 'insensitive' as const } }, { sessionId: { contains: search, mode: 'insensitive' as const } }] }
        : {};
      const [items, total] = await Promise.all([
        prisma.uploadChunk.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit, select: { id: true, sessionId: true, userId: true, path: true, index: true, total: true, createdAt: true } }),
        prisma.uploadChunk.count({ where }),
      ]);
      return NextResponse.json({ items, total, page, limit, totalPages: Math.ceil(total / limit) });
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await authCheck(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { ids, type, filter, filterType } = body as { ids?: string[]; type?: string; filter?: string; filterType?: string };

    // Bulk delete by filter (all matching user/email across all pages)
    if (filter && filterType && type) {
      const { prisma } = await import('@/lib/prisma');
      let where: any = {};

      if (type === 'activity') {
        if (filterType === 'userId') where = { userId: { contains: filter, mode: 'insensitive' } };
        else if (filterType === 'action') where = { action: { contains: filter, mode: 'insensitive' } };
      } else if (type === 'telegram') {
        if (filterType === 'sentBy') where = { sentBy: { contains: filter, mode: 'insensitive' } };
        else if (filterType === 'department') where = { department: { contains: filter, mode: 'insensitive' } };
        else if (filterType === 'type') where = { type: { contains: filter, mode: 'insensitive' } };
      } else if (type === 'upload') {
        if (filterType === 'userId') where = { userId: { contains: filter, mode: 'insensitive' } };
      }

      let deleted = 0;
      if (type === 'activity') {
        const r = await prisma.activityLog.deleteMany({ where });
        deleted = r.count;
      } else if (type === 'telegram') {
        const r = await prisma.telegramNotification.deleteMany({ where });
        deleted = r.count;
      } else if (type === 'upload') {
        const r = await prisma.uploadChunk.deleteMany({ where });
        deleted = r.count;
      }
      return NextResponse.json({ success: true, deleted, message: `Deleted ${deleted} logs matching "${filter}"` });
    }

    // Delete specific IDs
    if (!ids?.length || !type) {
      return NextResponse.json({ error: 'Missing ids/type or filter/filterType' }, { status: 400 });
    }

    const { prisma } = await import('@/lib/prisma');
    let deleted = 0;

    if (type === 'activity') {
      const r = await prisma.activityLog.deleteMany({ where: { id: { in: ids } } });
      deleted = r.count;
    } else if (type === 'telegram') {
      const r = await prisma.telegramNotification.deleteMany({ where: { id: { in: ids } } });
      deleted = r.count;
    } else if (type === 'upload') {
      const r = await prisma.uploadChunk.deleteMany({ where: { id: { in: ids } } });
      deleted = r.count;
    } else {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    return NextResponse.json({ success: true, deleted });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}
