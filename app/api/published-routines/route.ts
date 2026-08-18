import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { hasPermission } from '@/lib/permissions';

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
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;
  try {
    const { prisma } = await import('@/lib/prisma');

    // Auto-cleanup on every load
    const [removedRoutines, removedLogs] = await Promise.all([
      cleanupOldRoutines(prisma),
      cleanupOldActivityLogs(prisma),
    ]);

    const routines = await prisma.publishedRoutine.findMany({
      where: { status: 'published' },
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
      periods: typeof r.periods === 'string' ? JSON.parse(r.periods || '[]') : (r.periods || []),
      days: typeof r.days === 'string' ? JSON.parse(r.days || '[]') : (r.days || []),
      courses: typeof r.courses === 'string' ? JSON.parse(r.courses || '[]') : (r.courses || []),
      slots: typeof r.slots === 'string' ? JSON.parse(r.slots || '[]') : (r.slots || []),
      malePeriods: r.malePeriods ? (typeof r.malePeriods === 'string' ? JSON.parse(r.malePeriods) : r.malePeriods) : undefined,
      femalePeriods: r.femalePeriods ? (typeof r.femalePeriods === 'string' ? JSON.parse(r.femalePeriods) : r.femalePeriods) : undefined,
      maleSlots: r.maleSlots ? (typeof r.maleSlots === 'string' ? JSON.parse(r.maleSlots) : r.maleSlots) : undefined,
      femaleSlots: r.femaleSlots ? (typeof r.femaleSlots === 'string' ? JSON.parse(r.femaleSlots) : r.femaleSlots) : undefined,
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
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;

  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const callerProfile = await prisma.profile.findUnique({ where: { userId: email } });
    const effectiveRole = config.getEffectiveRole(email, callerProfile?.role);
    if (!(await hasPermission('publishRoutine', effectiveRole, callerProfile?.isCR || false, email))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { routines, scheduledAt } = body as { routines: any[]; scheduledAt?: string };

    if (!Array.isArray(routines) || routines.length === 0) {
      return NextResponse.json({ error: 'No routines provided' }, { status: 400 });
    }

    // Determine if this is a scheduled publish
    const scheduleDate = scheduledAt ? new Date(scheduledAt) : null;
    const isScheduled = scheduleDate && scheduleDate > new Date();
    const routineStatus = isScheduled ? 'scheduled' : 'published';

    // Teacher can only publish routines for their own department
    if (effectiveRole === 'teacher') {
      const callerProfile = await prisma.profile.findUnique({ where: { userId: email } });
      const teacherDept = callerProfile?.department;
      if (teacherDept) {
        for (const r of routines) {
          if (r.department && r.department !== teacherDept) {
            return NextResponse.json({ error: `Teachers can only publish routines for their own department (${teacherDept})` }, { status: 403 });
          }
        }
      }
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
          periods: r.periods || [],
          days: r.days || [],
          courses: r.courses || [],
          slots: r.slots || [],
          malePeriods: r.malePeriods || null,
          femalePeriods: r.femalePeriods || null,
          maleSlots: r.maleSlots || null,
          femaleSlots: r.femaleSlots || null,
          publishedBy: publisherName,
          publishedAt: isScheduled ? scheduleDate! : new Date(),
          expiresAt,
          status: routineStatus,
          scheduledAt: isScheduled ? scheduleDate : null,
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

    // Send Telegram notifications — only students of the affected department(s)
    // and specific semester(s) get notified, plus teachers assigned in the routine.
    try {
      const { sendDepartmentNotifications, sendTeacherNotifications, semesterLabelToId, semesterLabel, getDeptName } = await import('@/lib/telegram');
      const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://iiuc-arms.eu.cc';
      const ROUTINE_URL = `${SITE}/routine?tab=class`;
      const TEACHER_URL = `${SITE}/routine?tab=teacher`;

      for (const r of routines) {
        const dept = r.department;
        if (!dept) continue;

        const semId = semesterLabelToId(r.semester || '');
        const semLabel = semesterLabel(r.semester || '');
        const msg = `📢 <b>${routines.length > 1 ? 'Routines' : 'Routine'} Updated!</b>\n\n` +
          `🏢 Department: <b>${getDeptName(dept)}</b>\n` +
          `📅 Semester: <b>${semLabel || ''}</b>\n` +
          (r.session ? `📆 Session: ${r.session}\n` : '') +
          `\n🔗 View now: <a href="${ROUTINE_URL}">Open IIUC-ARMS</a>`;

        const result = await sendDepartmentNotifications([dept], msg, {
          type: 'routine_publish',
          title: `Routine: ${getDeptName(dept)}`,
          sentBy: email,
          semesters: semId ? [semId] : undefined,
        });
        console.log(`[Routine] ${getDeptName(dept)}${semId ? ' / ' + semLabel : ''} notifications sent: ${result.sent}, failed: ${result.failed}`);
      }

      // Notify teachers who have classes in this routine
      const teacherNames = Array.from(new Set(
        routines.flatMap(r => (r.courses || [])
          .map((c: any) => (c?.teacher || '').trim())
          .filter(Boolean))
      ));
      if (teacherNames.length > 0) {
        const deptNames = Array.from(new Set(routines.map(r => r.department).filter(Boolean))).map(d => getDeptName(d || '')).join(', ');
        const teacherMsg = `👨‍🏫 <b>Your Class Routine is Published</b>\n\n` +
          `Dear Teacher,\n` +
          `A class routine has been published for <b>${deptNames}</b> (${routines[0]?.semester || ''})${routines[0]?.session ? ` — ${routines[0].session}` : ''}.\n` +
          `You have class(es) assigned to you in this routine.\n\n` +
          `🔗 <a href="${TEACHER_URL}">View Your Routine →</a>`;
        const tRes = await sendTeacherNotifications(teacherNames, teacherMsg, {
          type: 'routine_teacher',
          title: `Your Routine: ${deptNames}`,
          sentBy: email,
        });
        console.log(`[Routine] Teacher notifications sent: ${tRes.sent}, failed: ${tRes.failed}, matched: ${tRes.matched}`);
      }
    } catch {}

    return NextResponse.json({ success: true, count: routines.length });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to publish' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const callerProfile = await prisma.profile.findUnique({ where: { userId: email } });
    const effectiveRole = config.getEffectiveRole(email, callerProfile?.role);
    if (!(await hasPermission('publishRoutine', effectiveRole, callerProfile?.isCR || false, email))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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
