import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { getAppInstallations, getInstallationAccessToken } from '@/lib/github-app';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { hasPermission, canAddCourseToSemester } from '@/lib/permissions';

const GITHUB_API = 'https://api.github.com';

function ghHeaders(token: string) {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

async function getAppBotToken(): Promise<string | null> {
  try {
    const installations = await getAppInstallations();
    if (!Array.isArray(installations) || installations.length === 0) return null;
    const installation = installations[0];
    return await getInstallationAccessToken(installation.id);
  } catch { return null; }
}

async function createGithubFolder(token: string, path: string) {
  const url = `${GITHUB_API}/repos/${config.owner}/${config.repo}/contents/${path}/.gitkeep`;
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: ghHeaders(token),
      body: JSON.stringify({ message: `Create course folder: ${path}`, content: btoa('') }),
    });
    if (res.ok) return true;
    if (res.status === 422) return true;
    const data = await res.json();
    if (data?.sha) return true;
    return false;
  } catch { return false; }
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;

  const department = req.nextUrl.searchParams.get('department');
  const semester = req.nextUrl.searchParams.get('semester');

  try {
    const where: any = {};
    if (department) where.department = department;
    if (semester) where.semester = semester;
    const courses = await prisma.course.findMany({ where, orderBy: [{ department: 'asc' }, { semester: 'asc' }, { code: 'asc' }] });
    return NextResponse.json({ success: true, courses });
  } catch {
    return NextResponse.json({ error: 'Failed to load courses' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;

  const email = await getUserEmail(req);
  if (!email) return NextResponse.json({ error: 'Unauthorized — please login' }, { status: 401 });

  const profile = await prisma.profile.findUnique({ where: { userId: email } });
  const role = config.getEffectiveRole(email, profile?.role);
  const isCR = profile?.isCR || false;
  const isACR = profile?.isACR || false;

  if (!(await hasPermission('addCourse', role, isCR))) {
    return NextResponse.json({ error: 'You do not have permission to add courses. Please contact your CR, ACR, teacher, manager, or admin.' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { department, semester, code, title } = body;
    if (!department || !semester || !code || !title) {
      return NextResponse.json({ error: 'department, semester, code, title are required' }, { status: 400 });
    }

    if (!config.allDepartmentIds.has(department)) {
      return NextResponse.json({ error: 'Invalid department' }, { status: 400 });
    }

    const semesterCheck = await canAddCourseToSemester(
      email, role, isCR, isACR,
      profile?.semester || null,
      profile?.department || null,
      semester, department
    );
    if (!semesterCheck.allowed) {
      return NextResponse.json({ error: semesterCheck.reason }, { status: 403 });
    }

    const course = await prisma.course.create({
      data: { department, semester, code: code.toUpperCase(), title, addedBy: email },
    });

    const botToken = await getAppBotToken();
    if (botToken) {
      const cleanTitle = title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
      const courseFolder = `${code.toUpperCase()} - ${cleanTitle}`;
      const basePath = `${config.uploadPath}/${department}/${semester}/${courseFolder}`;

      const allFolders: string[] = [];
      for (const mf of ['Mid', 'Final']) {
        for (const cat of ['NOTES', 'Previous Questions']) {
          allFolders.push(`${basePath}/${mf}/${cat}`);
        }
      }
      for (const cat of ['sheet', 'Syllabus', 'Other']) {
        allFolders.push(`${basePath}/${cat}`);
      }

      for (const f of allFolders) {
        await createGithubFolder(botToken, f);
      }
    }

    return NextResponse.json({ success: true, course }, { status: 201 });
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return NextResponse.json({ error: 'Course already exists in this semester' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create course' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;

  const email = await getUserEmail(req);
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await prisma.profile.findUnique({ where: { userId: email } });
  const role = config.getEffectiveRole(email, profile?.role);
  const isCR = profile?.isCR || false;

  if (!await hasPermission('editCourse', role, isCR)) {
    return NextResponse.json({ error: 'You do not have permission to edit courses' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { id, title } = body;
    if (!id || !title) {
      return NextResponse.json({ error: 'id and title are required' }, { status: 400 });
    }

    const course = await prisma.course.update({ where: { id }, data: { title } });
    return NextResponse.json({ success: true, course });
  } catch {
    return NextResponse.json({ error: 'Failed to update course' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;

  const email = await getUserEmail(req);
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await prisma.profile.findUnique({ where: { userId: email } });
  const role = config.getEffectiveRole(email, profile?.role);
  const isCR = profile?.isCR || false;

  if (!await hasPermission('deleteCourse', role, isCR)) {
    return NextResponse.json({ error: 'You do not have permission to delete courses' }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  try {
    await prisma.course.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete course' }, { status: 500 });
  }
}
