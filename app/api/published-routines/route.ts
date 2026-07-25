import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';

const ROUTINE_TTL_MONTHS = 7;
const ACTIVITY_TTL_MONTHS = 3;

async function cleanupOldRoutines(prisma: any) {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - ROUTINE_TTL_MONTHS);
  const deleted = await prisma.publishedRoutine.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return deleted.count;
}

async function cleanupOldActivityLogs(prisma: any) {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - ACTIVITY_TTL_MONTHS);
  const deleted = await prisma.activityLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return deleted.count;
}

export async function GET(req: NextRequest) {
  try {
    const { prisma } = await import('@/lib/prisma');

    // Auto-cleanup on every load
    const [removedRoutines, removedLogs] = await Promise.all([
      cleanupOldRoutines(prisma),
      cleanupOldActivityLogs(prisma),
    ]);

    const routines = await prisma.publishedRoutine.findMany({
      orderBy: { publishedAt: 'desc' },
    });

    const result = routines.map((r: any) => ({
      id: r.routineId,
      semester: r.semester,
      session: r.session,
      branch: r.branch,
      gender: r.gender,
      academicYear: r.academicYear,
      department: r.department,
      university: r.university,
      room: r.room,
      periods: r.periods,
      days: r.days,
      courses: r.courses,
      slots: r.slots,
      malePeriods: r.malePeriods,
      femalePeriods: r.femalePeriods,
      maleSlots: r.maleSlots,
      femaleSlots: r.femaleSlots,
      publishedBy: r.publishedBy ? { name: r.publishedBy } : undefined,
      publishedAt: r.publishedAt.getTime(),
      createdAt: r.publishedAt.getTime(),
      published: true,
      isDraft: false,
    }));

    return NextResponse.json({
      success: true,
      routines: result,
      cleaned: { routines: removedRoutines, logs: removedLogs },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'Failed to load routines' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const effectiveRole = config.getEffectiveRole(email);
    if (!config.canPublishRoutine(email, { role: effectiveRole } as any)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { prisma } = await import('@/lib/prisma');
    const body = await req.json();
    const { routines } = body as { routines: any[] };

    if (!Array.isArray(routines) || routines.length === 0) {
      return NextResponse.json({ error: 'No routines provided' }, { status: 400 });
    }

    // Set expiry 7 months from now
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + ROUTINE_TTL_MONTHS);

    // Delete existing published routines for same semester+gender+branch before re-publishing
    for (const r of routines) {
      await prisma.publishedRoutine.deleteMany({
        where: {
          semester: r.semester,
          gender: r.gender || null,
          branch: r.branch || null,
        },
      });
    }

    // Insert new routines
    for (const r of routines) {
      const publisherName = r.publishedBy?.name || email.split('@')[0];
      await prisma.publishedRoutine.create({
        data: {
          routineId: r.id || `pub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          semester: r.semester,
          session: r.session || null,
          branch: r.branch || null,
          gender: r.gender || null,
          academicYear: r.academicYear || null,
          department: r.department || null,
          university: r.university || null,
          room: r.room || null,
          periods: JSON.stringify(r.periods || []),
          days: JSON.stringify(r.days || []),
          courses: JSON.stringify(r.courses || []),
          slots: JSON.stringify(r.slots || []),
          malePeriods: r.malePeriods ? JSON.stringify(r.malePeriods) : null,
          femalePeriods: r.femalePeriods ? JSON.stringify(r.femalePeriods) : null,
          maleSlots: r.maleSlots ? JSON.stringify(r.maleSlots) : null,
          femaleSlots: r.femaleSlots ? JSON.stringify(r.femaleSlots) : null,
          publishedBy: publisherName,
          publishedAt: new Date(),
          expiresAt,
        },
      });
    }

    // Log activity
    try {
      const profile = await prisma.profile.findUnique({ where: { userId: email } });
      await prisma.activityLog.create({
        data: {
          action: 'routine_publish',
          userId: email,
          userName: profile?.name || email.split('@')[0],
          details: JSON.stringify({ count: routines.length }),
        },
      });
    } catch {}

    return NextResponse.json({ success: true, count: routines.length });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to publish' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const effectiveRole = config.getEffectiveRole(email);
    if (!config.canPublishRoutine(email, { role: effectiveRole } as any)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { prisma } = await import('@/lib/prisma');
    const url = new URL(req.url);
    const routineId = url.searchParams.get('id');

    if (routineId) {
      await prisma.publishedRoutine.deleteMany({ where: { routineId } });
    } else {
      // Unpublish all
      await prisma.publishedRoutine.deleteMany();
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
