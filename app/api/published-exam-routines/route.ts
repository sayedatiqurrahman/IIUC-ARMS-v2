import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

const EXAM_ROUTINE_TTL_MONTHS = 3;
const SEATPLAN_TTL_MONTHS = 1;

async function cleanupOldExamRoutines(prisma: any) {
  const deleted = await prisma.publishedExamRoutine.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return deleted.count;
}

function splitTeachers(teacher?: string): string[] {
  return (teacher || '')
    .split(/[,，;、]/)
    .map(t => t.trim())
    .filter(Boolean);
}

function fmtDate(date: string): string {
  if (!date) return '';
  try {
    return new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch {
    return date;
  }
}

async function sendPublishedNotifications(routines: any[], sentBy: string) {
  const {
    sendDepartmentNotifications,
    sendTeacherNotifications,
    sendRoomAssignmentNotifications,
    semesterLabelToId,
    semesterLabel,
    getDeptName,
  } = await import('@/lib/telegram');

  const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://iiuc-arms.eu.cc';
  const EXAM_URL = `${SITE}/routine?tab=exam`;
  const SEAT_URL = `${SITE}/routine?tab=seatplan`;
  const TEACHER_URL = `${SITE}/routine?tab=teacher`;
  const delayMs = 80;

  for (const r of routines) {
    const dept = r.department;
    if (!dept) continue;
    const deptName = getDeptName(dept);
    const isSeatPlan = r.type === 'seatplan';

    if (isSeatPlan) {
      const entries: any[] = Array.isArray(r.entries) ? r.entries : Array.isArray(r.rows) ? r.rows : [];
      const withRoom = entries.filter((e: any) => e && e.room);

      // 1) Students assigned to rooms (roll-range matching)
      const roomAssignments = withRoom.map((e: any) => ({
        department: dept,
        semester: e.semester,
        room: e.room,
        rollFrom: e.rollFrom || '',
        rollTo: e.rollTo || '',
        date: e.date,
        slot: e.slotId,
        examType: r.examType,
      }));
      if (roomAssignments.length > 0) {
        const roomRes = await sendRoomAssignmentNotifications(
          roomAssignments,
          (mine, profile) => {
            const lines = mine.map(a =>
              `📅 ${fmtDate(a.date)} • 🚪 Room <b>${a.room}</b>` +
              (a.slot ? ` (${a.slot})` : '') +
              (a.examType ? ` — ${a.examType}` : '')
            );
            return `🪑 <b>Your Exam Rooms</b>\n\n` +
              `👤 ${profile.name || profile.universityId || 'Student'}\n` +
              `🏢 ${deptName}\n\n` +
              lines.join('\n') +
              `\n\n🔗 <a href="${SEAT_URL}">View Seat Plan →</a>`;
          },
          { type: 'seat_assignment', title: `Seat Plan: ${deptName}`, sentBy, delayMs }
        );
        console.log(`[SeatPlan] Room notifications: sent ${roomRes.sent}, failed ${roomRes.failed}, matched ${roomRes.matched}`);
      }

      // 2) Teachers assigned as invigilators in this seat plan
      const teacherNames = Array.from(new Set(withRoom.map((e: any) => splitTeachers(e.teacher)).flat()));
      if (teacherNames.length > 0) {
        const teacherMsg = `🪑 <b>Invigilation Assignment</b>\n\n` +
          `Dear Teacher,\n` +
          `You are assigned as invigilator in the <b>${r.examType || 'Exam'}</b> seat plan of <b>${deptName}</b>.\n\n` +
          withRoom.slice(0, 10).map((e: any) =>
            `🚪 Room <b>${e.room}</b> — ${fmtDate(e.date)}${e.semester ? ` (${semesterLabel(e.semester)})` : ''}`
          ).join('\n') +
          (withRoom.length > 10 ? `\n...and ${withRoom.length - 10} more` : '') +
          `\n\n🔗 <a href="${TEACHER_URL}">View My Invigilation Schedule →</a>`;
        const tRes = await sendTeacherNotifications(teacherNames, teacherMsg, {
          type: 'seatplan_teacher',
          title: `Invigilation: ${deptName}`,
          sentBy,
          delayMs,
        });
        console.log(`[SeatPlan] Teacher notifications: sent ${tRes.sent}, failed ${tRes.failed}, matched ${tRes.matched}`);
      }
      continue;
    }

    // ─── Exam routine (not seat plan) ───
    const semId = semesterLabelToId(r.semester || '');
    const semLabel = semesterLabel(r.semester || '');

    // 1) Students of the department + semester
    const studentMsg = `📝 <b>${r.examType || 'Exam'} Routine Published!</b>\n\n` +
      `🏢 Department: <b>${deptName}</b>\n` +
      `📅 Semester: <b>${semLabel || ''}</b>\n` +
      (r.session ? `📆 Session: ${r.session}\n` : '') +
      `\n🔗 View now: <a href="${EXAM_URL}">Open Exam Routine →</a>`;
    const sRes = await sendDepartmentNotifications([dept], studentMsg, {
      type: 'exam_routine_publish',
      title: `Exam Routine: ${deptName}`,
      sentBy,
      semesters: semId ? [semId] : undefined,
      delayMs,
    });
    console.log(`[ExamRoutine] Student notifications: sent ${sRes.sent}, failed ${sRes.failed}`);

    // 2) Teachers + students assigned to specific rooms/rolls
    const rows: any[] = Array.isArray(r.rows) ? r.rows : [];
    const teacherNames = new Set<string>();
    const roomAssignments: any[] = [];

    for (const row of rows) {
      if (!row || !row.courses || typeof row.courses !== 'object') continue;
      for (const [slotId, cell] of Object.entries<any>(row.courses)) {
        if (!cell || !cell.code) continue;
        splitTeachers(cell.teacher).forEach(t => teacherNames.add(t));
        if (cell.room && cell.rollRange) {
          const parts = (cell.rollRange || '').split('-').map((s: string) => s.trim());
          roomAssignments.push({
            department: dept,
            semester: semId || undefined,
            room: cell.room,
            rollFrom: parts[0] || '',
            rollTo: parts[1] || '',
            date: row.date,
            slot: slotId,
            examType: r.examType,
            course: cell.code,
          });
        }
      }
    }

    if (roomAssignments.length > 0) {
      const roomRes = await sendRoomAssignmentNotifications(
        roomAssignments,
        (mine, profile) => {
          const lines = mine.map(a =>
            `📅 ${fmtDate(a.date)} • 🚪 Room <b>${a.room}</b>` +
            (a.course ? ` (${a.course})` : '')
          );
          return `📝 <b>Your Exam Room</b>\n\n` +
            `👤 ${profile.name || profile.universityId || 'Student'}\n` +
            `🏢 ${deptName} — ${semLabel || ''}\n` +
            `📄 ${mine[0]?.examType || 'Exam'}\n\n` +
            lines.join('\n') +
            `\n\n🔗 <a href="${EXAM_URL}">View Exam Routine →</a>`;
        },
        { type: 'exam_room', title: `Exam Rooms: ${deptName}`, sentBy, delayMs }
      );
      console.log(`[ExamRoutine] Room notifications: sent ${roomRes.sent}, failed ${roomRes.failed}, matched ${roomRes.matched}`);
    }

    if (teacherNames.size > 0) {
      const teacherMsg = `📝 <b>Exam Duty Assignment</b>\n\n` +
        `Dear Teacher,\n` +
        `You have exam duty in the <b>${r.examType || 'Exam'}</b> routine of <b>${deptName}</b> (${semLabel || ''}).\n\n` +
        `🔗 <a href="${TEACHER_URL}">View My Exam Duty →</a>`;
      const tRes = await sendTeacherNotifications(Array.from(teacherNames), teacherMsg, {
        type: 'exam_teacher',
        title: `Exam Duty: ${deptName}`,
        sentBy,
        delayMs,
      });
      console.log(`[ExamRoutine] Teacher notifications: sent ${tRes.sent}, failed ${tRes.failed}, matched ${tRes.matched}`);
    }
  }
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;
  try {
    const { prisma } = await import('@/lib/prisma');
    const url = new URL(req.url);
    const dept = url.searchParams.get('department');
    const sem = url.searchParams.get('semester');

    const cleaned = await cleanupOldExamRoutines(prisma);

    const where: any = {};
    if (dept) where.department = dept;
    if (sem) where.semester = sem;

    const routines = await prisma.publishedExamRoutine.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
    });

    const result = routines.map((r: any) => {
      const parseJson = (val: any) => {
        if (Array.isArray(val)) return val;
        if (typeof val === 'string') { try { return JSON.parse(val); } catch { return []; } }
        return [];
      };
      return {
        id: r.examId,
        semester: r.semester,
        session: r.session,
        department: r.department,
        examType: r.examType,
        type: r.type || undefined,
        rows: parseJson(r.rows),
        entries: r.type === 'seatplan' ? parseJson(r.rows) : undefined,
        slots: parseJson(r.slots),
        status: r.status || 'published',
        publishedBy: r.publishedBy ? { name: r.publishedBy, title: undefined, email: r.publishedByEmail || undefined } : undefined,
        publishedAt: r.publishedAt.getTime(),
        createdAt: r.publishedAt.getTime(),
        published: (r.status || 'published') === 'published',
        isDraft: false,
      };
    });

    return NextResponse.json({ success: true, routines: result, cleaned });
  } catch (err: any) {
    console.error('Published exam routines GET error:', err?.message || err);
    return NextResponse.json({ success: false, error: 'Failed to load exam routines', detail: err?.message || String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const effectiveRole = config.getEffectiveRole(email);
    if (!config.canPublishRoutine(email, { role: effectiveRole } as any)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { prisma } = await import('@/lib/prisma');
    const body = await req.json();
    const { routines, status } = body as { routines: any[]; status?: string };

    if (!Array.isArray(routines) || routines.length === 0) {
      return NextResponse.json({ error: 'No routines provided' }, { status: 400 });
    }

    const saveStatus = status === 'saved' ? 'saved' : 'published';

    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    const publisherName = profile?.name || email.split('@')[0];

    for (const r of routines) {
      const examId = r.id || `exam-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const isSeatPlan = r.type === 'seatplan';

      // For seat plans: delete all existing seat plans for same dept+examType
      // For exam routines: delete existing for same semester+dept+examType
      if (isSeatPlan) {
        await prisma.publishedExamRoutine.deleteMany({
          where: {
            type: 'seatplan',
            department: r.department || null,
            examType: r.examType || null,
          },
        });
      } else {
        await prisma.publishedExamRoutine.deleteMany({
          where: {
            semester: r.semester,
            department: r.department || null,
            examType: r.examType || null,
            type: null,
          },
        });
      }

      const ttlMonths = isSeatPlan ? SEATPLAN_TTL_MONTHS : EXAM_ROUTINE_TTL_MONTHS;
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + ttlMonths);

      await prisma.publishedExamRoutine.create({
        data: {
          examId,
          semester: r.semester,
          session: r.session || null,
          department: r.department || null,
          examType: r.examType || null,
          type: isSeatPlan ? 'seatplan' : null,
          rows: isSeatPlan ? (r.entries || []) : (r.rows || []),
          slots: r.slots || [],
          status: saveStatus,
          publishedBy: publisherName,
          publishedByEmail: email,
          publishedAt: new Date(),
          expiresAt,
        },
      });
    }

    try {
      await prisma.activityLog.create({
        data: {
          action: saveStatus === 'saved' ? 'exam_routine_save' : 'exam_routine_publish',
          userId: email,
          userName: publisherName,
          details: JSON.stringify({ count: routines.length, status: saveStatus }),
        },
      });
    } catch {}

    // ─── Telegram notifications (only on actual publish, not draft/save) ───
    if (saveStatus === 'published') {
      try {
        await sendPublishedNotifications(routines, email);
      } catch (err: any) {
        console.error('[ExamRoutine] Telegram notification error:', err?.message);
      }
    }

    return NextResponse.json({ success: true, count: routines.length, status: saveStatus });
  } catch (err: any) {
    console.error('Published exam routines POST error:', err?.message || err);
    return NextResponse.json({ error: 'Failed to save', detail: err?.message || String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const effectiveRole = config.getEffectiveRole(email);
    if (!config.canPublishRoutine(email, { role: effectiveRole } as any)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { prisma } = await import('@/lib/prisma');
    const url = new URL(req.url);
    const examId = url.searchParams.get('id');

    if (examId) {
      await prisma.publishedExamRoutine.deleteMany({ where: { examId } });
    } else {
      await prisma.publishedExamRoutine.deleteMany();
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
