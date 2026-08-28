import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { getDepartmentFolder } from '@/lib/departments';
import { SEMESTERS } from '@/components/routine/types';

const normCode = (code: string) => String(code || '').toUpperCase().replace(/\s+/g, '');

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;
  const dept = req.nextUrl.searchParams.get('department');
  const semester = req.nextUrl.searchParams.get('semester');
  if (!dept || !semester) {
    return NextResponse.json({ success: false, error: 'department and semester required' }, { status: 400 });
  }
  try {
    const { fetchCoursesFromGitHub, semesterToGitHubFolder, fetchCloudTeacherMapping } = await import('@/lib/github-folders');
    const deptFolder = getDepartmentFolder(dept);

    // 1) Course list derived from the cloud folder structure.
    const folderCourses = await fetchCoursesFromGitHub(dept, semesterToGitHubFolder(semester));

    // 2) Saved course → teacher mapping (remembers which course takes which teacher).
    const mapping = await fetchCloudTeacherMapping();
    const mapList = mapping.departments?.[deptFolder]?.[semester] || [];

    const mapByCode = new Map<string, { code: string; title?: string; teacher?: string; room?: string }>();
    for (const m of mapList) {
      if (m?.code) mapByCode.set(normCode(m.code), m);
    }

    const merged = new Map<string, { code: string; title: string; teacher: string; room: string; mapped: boolean }>();
    for (const fc of folderCourses) {
      const key = normCode(fc.code);
      const m = mapByCode.get(key);
      merged.set(key, {
        code: fc.code,
        title: fc.title,
        teacher: m?.teacher || '',
        room: m?.room || '',
        mapped: !!m,
      });
    }
    // Include mapping entries not yet found as folders (so saved teachers survive).
    for (const m of mapList) {
      if (!m?.code) continue;
      const key = normCode(m.code);
      if (!merged.has(key)) {
        merged.set(key, { code: m.code, title: m.title || '', teacher: m.teacher || '', room: m.room || '', mapped: true });
      }
    }

    const courses = Array.from(merged.values()).sort((a, b) => a.code.localeCompare(b.code));

    return NextResponse.json({ success: true, courses, deptFolder, semester, savedCount: mapList.length });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Failed to load courses from cloud' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { fetchCloudTeacherMapping, saveTeacherMapping } = await import('@/lib/github-folders');
    const body = await req.json();
    const { department, semester, courses } = body as {
      department: string;
      semester: string;
      courses: { code: string; title?: string; teacher?: string; room?: string }[];
    };
    if (!department || !semester || !Array.isArray(courses)) {
      return NextResponse.json({ error: 'department, semester and courses[] required' }, { status: 400 });
    }
    if (!SEMESTERS.includes(semester)) {
      return NextResponse.json({ error: 'Invalid semester' }, { status: 400 });
    }

    const deptFolder = getDepartmentFolder(department);
    const mapping = await fetchCloudTeacherMapping(true);
    if (!mapping.departments) mapping.departments = {};
    if (!mapping.departments[deptFolder]) mapping.departments[deptFolder] = {};

    const cleaned = courses
      .filter(c => c && c.code)
      .map(c => ({
        code: normCode(c.code),
        title: c.title || '',
        teacher: c.teacher || '',
        room: c.room || '',
      }))
      .filter(c => c.code);

    mapping.departments[deptFolder][semester] = cleaned;
    const res = await saveTeacherMapping(mapping, email);
    if (!res.success) return NextResponse.json({ error: res.error || 'Failed to save' }, { status: 500 });

    return NextResponse.json({ success: true, count: cleaned.length });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to save' }, { status: 500 });
  }
}