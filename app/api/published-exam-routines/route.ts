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
