import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const body = await req.json();
    const { department, semester, code, title } = body as { department: string; semester: string; code: string; title: string };
    if (!department || !semester || !code || !title) {
      return NextResponse.json({ error: 'department, semester, code, title required' }, { status: 400 });
    }

    const upserted = await prisma.semesterCourse.upsert({
      where: { semester_code: { semester, code } },
      update: { title },
      create: { semester, code, title },
    });

    let githubResult: { success: boolean; error?: string } = { success: false, error: 'Skipped' };
    try {
      const { createCourseFolder } = await import('@/lib/github-folders');
      githubResult = await createCourseFolder(department, semester, code, title);
    } catch {}

    return NextResponse.json({ success: true, course: upserted, github: githubResult });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to create course' }, { status: 500 });
  }
}
