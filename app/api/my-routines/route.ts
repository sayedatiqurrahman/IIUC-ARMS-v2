import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ routines: [] });

    const { prisma } = await import('@/lib/prisma');
    const rows = await prisma.publishedRoutine.findMany({
      where: { routineId: { startsWith: 'my-' } },
      orderBy: { publishedAt: 'desc' },
    });

    const routines = rows.map((r: any) => ({
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
      publishedBy: r.publishedBy ? { name: r.publishedBy, email } : undefined,
      publishedAt: r.publishedAt.getTime(),
      createdAt: r.publishedAt.getTime(),
      published: false,
      isDraft: true,
    }));

    return NextResponse.json({ success: true, routines });
  } catch {
    return NextResponse.json({ success: false, routines: [] });
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const body = await req.json();
    const { routines } = body as { routines: any[] };

    if (!Array.isArray(routines) || routines.length === 0) {
      return NextResponse.json({ error: 'No routines provided' }, { status: 400 });
    }

    // Full replace: delete all existing my-routines, then insert the new list
    await prisma.publishedRoutine.deleteMany({ where: { routineId: { startsWith: 'my-' } } });

    // Insert each routine
    for (const r of routines) {
      await prisma.publishedRoutine.create({
        data: {
          routineId: r.id,
          semester: r.semester || '',
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
          publishedBy: email,
          publishedAt: new Date(),
          expiresAt: new Date(Date.now() + 7 * 30 * 24 * 60 * 60 * 1000), // 7 months
        },
      });
    }

    return NextResponse.json({ success: true, count: routines.length });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to save' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const url = new URL(req.url);
    const routineId = url.searchParams.get('id');

    if (routineId) {
      await prisma.publishedRoutine.deleteMany({ where: { routineId } });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
