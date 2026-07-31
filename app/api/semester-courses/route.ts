import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;
  const semester = req.nextUrl.searchParams.get('semester');
  try {
    const { prisma } = await import('@/lib/prisma');
    const where: any = {};
    if (semester) where.semester = semester;
    const courses = await prisma.semesterCourse.findMany({ where, orderBy: [{ semester: 'asc' }, { code: 'asc' }] });
    return NextResponse.json({ success: true, courses });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to load courses' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;

  try {
    const session = await getServerSession(authOptions as any);
    const email = (session as any)?.user?.email;
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const body = await req.json();
    const { semester, courses } = body as { semester: string; courses: { code: string; title: string; teacher?: string; room?: string }[] };
    if (!semester || !Array.isArray(courses)) {
      return NextResponse.json({ error: 'semester and courses[] required' }, { status: 400 });
    }

    const ops = courses.map(c =>
      prisma.semesterCourse.upsert({
        where: { semester_code: { semester, code: c.code } },
        update: { title: c.title, teacher: c.teacher || null, room: c.room || null },
        create: { semester, code: c.code, title: c.title, teacher: c.teacher || null, room: c.room || null },
      })
    );
    await prisma.$transaction(ops);

    const codes = courses.map(c => c.code);
    await prisma.semesterCourse.deleteMany({ where: { semester, code: { notIn: codes } } });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to save courses' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;

  try {
    const session = await getServerSession(authOptions as any);
    const email = (session as any)?.user?.email;
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const id = req.nextUrl.searchParams.get('id');
    const semester = req.nextUrl.searchParams.get('semester');
    if (id) {
      await prisma.semesterCourse.delete({ where: { id } });
    } else if (semester) {
      await prisma.semesterCourse.deleteMany({ where: { semester } });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
