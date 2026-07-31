import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { getAppInstallations, getInstallationAccessToken } from '@/lib/github-app';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { hasPermission, canAddCourseToSemester } from '@/lib/permissions';
import { getDeptFullName, sendMessageWithButton, sendMessageWithButtons, buildBrowseLink, deleteConfirmData, deleteRejectData } from '@/lib/telegram';

const GITHUB_API = 'https://api.github.com';
const OWNER_CHAT_ID = parseInt(process.env.TELEGRAM_OWNER_CHAT_ID || '0');

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
    return await getInstallationAccessToken(installations[0].id);
  } catch { return null; }
}

async function batchCreateGitkeepFiles(token: string, folderPath: string, paths: string[]): Promise<number> {
  if (paths.length === 0) return 0;
  const refRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`, { headers: ghHeaders(token) });
  if (!refRes.ok) return 0;
  const refData = await refRes.json();
  const baseCommitSha = refData.object.sha;

  const commitRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/commits/${baseCommitSha}`, { headers: ghHeaders(token) });
  if (!commitRes.ok) return 0;
  const commitData = await commitRes.json();
  const baseTreeSha = commitData.tree.sha;

  const treeItems = paths.map(p => ({ path: `${p}/.gitkeep`, mode: '100644', type: 'blob' as const, content: '' }));

  const treeRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/trees`, {
    method: 'POST', headers: ghHeaders(token),
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
  });
  if (!treeRes.ok) return 0;
  const treeData = await treeRes.json();

  const newCommitRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/commits`, {
    method: 'POST', headers: ghHeaders(token),
    body: JSON.stringify({ message: `Create course folders: ${folderPath}`, tree: treeData.sha, parents: [baseCommitSha] }),
  });
  if (!newCommitRes.ok) return 0;
  const newCommitData = await newCommitRes.json();

  await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`, {
    method: 'PATCH', headers: ghHeaders(token),
    body: JSON.stringify({ sha: newCommitData.sha, force: true }),
  });
  return paths.length;
}

async function batchDeleteFiles(token: string, files: { path: string; sha: string }[]): Promise<number> {
  if (files.length === 0) return 0;
  const refRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`, { headers: ghHeaders(token) });
  if (!refRes.ok) return 0;
  const refData = await refRes.json();
  const baseCommitSha = refData.object.sha;

  const commitRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/commits/${baseCommitSha}`, { headers: ghHeaders(token) });
  if (!commitRes.ok) return 0;
  const commitData = await commitRes.json();
  const baseTreeSha = commitData.tree.sha;

  const fullTreeRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/trees/${baseTreeSha}?recursive=1`, { headers: ghHeaders(token) });
  if (!fullTreeRes.ok) return 0;
  const fullTreeData = await fullTreeRes.json();

  const deletePaths = new Set(files.map(f => f.path));
  const keepItems = (fullTreeData.tree || []).filter((item: any) => !deletePaths.has(item.path));
  if (keepItems.length === 0) return 0;

  const treeItems = keepItems.map((item: any) => ({
    path: item.path, mode: item.mode, type: item.type,
    sha: item.type === 'blob' ? item.sha : undefined,
  }));

  const treeRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/trees`, {
    method: 'POST', headers: ghHeaders(token),
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
  });
  if (!treeRes.ok) return 0;
  const treeData = await treeRes.json();

  const newCommitRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/commits`, {
    method: 'POST', headers: ghHeaders(token),
    body: JSON.stringify({ message: `Delete course: ${files.length} files removed`, tree: treeData.sha, parents: [baseCommitSha] }),
  });
  if (!newCommitRes.ok) return 0;
  const newCommitData = await newCommitRes.json();

  await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`, {
    method: 'PATCH', headers: ghHeaders(token),
    body: JSON.stringify({ sha: newCommitData.sha, force: true }),
  });
  return files.length;
}

async function getAllFilesInFolder(token: string, folderPath: string): Promise<{ path: string; sha: string }[]> {
  const url = `${GITHUB_API}/repos/${config.owner}/${config.repo}/contents/${folderPath}`;
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (!res.ok) return [];
  const items = await res.json();
  if (!Array.isArray(items)) return [];
  const files: { path: string; sha: string }[] = [];
  for (const item of items) {
    if (item.type === 'file') files.push({ path: item.path, sha: item.sha });
    else if (item.type === 'dir') {
      const sub = await getAllFilesInFolder(token, item.path);
      files.push(...sub);
    }
  }
  return files;
}

// GET — fast DB read
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;

  const department = req.nextUrl.searchParams.get('department');
  const semester = req.nextUrl.searchParams.get('semester');

  try {
    const { prisma } = await import('@/lib/prisma');
    const where: any = {};
    if (department) where.department = department;
    if (semester) where.semester = semester;
    const courses = await prisma.course.findMany({ where, orderBy: [{ department: 'asc' }, { semester: 'asc' }, { code: 'asc' }] });
    return NextResponse.json({ success: true, courses: courses.map(c => ({ code: c.code, title: c.title, department: c.department, semester: c.semester, addedBy: c.addedBy, createdAt: c.createdAt })) });
  } catch {
    return NextResponse.json({ error: 'Failed to load courses' }, { status: 500 });
  }
}

// POST — write DB + create GitHub folders + Telegram
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;

  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized — please login' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    const role = config.getEffectiveRole(email, profile?.role);
    const isCR = profile?.isCR || false;
    const isACR = profile?.isACR || false;

    if (!(await hasPermission('addCourse', role, isCR))) {
      return NextResponse.json({ error: 'You do not have permission to add courses. Please contact your CR, ACR, teacher, manager, or admin.' }, { status: 403 });
    }

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
      profile?.semester || null, profile?.department || null,
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
      const allPaths: string[] = [];
      for (const mf of ['Mid', 'Final']) {
        for (const cat of ['NOTES', 'Previous Questions']) allPaths.push(`${basePath}/${mf}/${cat}`);
      }
      for (const cat of ['sheet', 'Syllabus', 'Other']) allPaths.push(`${basePath}/${cat}`);
      await batchCreateGitkeepFiles(botToken, basePath, allPaths);
    }

    try {
      const deptFullName = getDeptFullName(department);
      const semLabel = config.semesters.find(s => s.id === semester)?.label || semester;
      const tgMsg = [
        `📚 <b>New Course Added</b>`,
        ``,
        `<b>Code:</b> <code>${code.toUpperCase()}</code>`,
        `<b>Title:</b> ${title}`,
        `<b>Department:</b> ${deptFullName} (${department})`,
        `<b>Semester:</b> ${semLabel}`,
        `<b>Added by:</b> ${email}`,
      ].join('\n');
      const pageLink = buildBrowseLink({ dept: department, sem: semester });
      await sendMessageWithButton(OWNER_CHAT_ID, tgMsg, `📂 View ${code.toUpperCase()} in ${semLabel}`, pageLink);
    } catch {}

    return NextResponse.json({ success: true, course }, { status: 201 });
  } catch (e: any) {
    if (e?.code === 'P2002') return NextResponse.json({ error: 'Course already exists in this semester' }, { status: 409 });
    return NextResponse.json({ error: 'Failed to create course' }, { status: 500 });
  }
}

// PUT — update DB title + rename GitHub folder
export async function PUT(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;

  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    const role = config.getEffectiveRole(email, profile?.role);
    const isCR = profile?.isCR || false;

    if (!await hasPermission('editCourse', role, isCR)) {
      return NextResponse.json({ error: 'You do not have permission to edit courses' }, { status: 403 });
    }

    const body = await req.json();
    const { id, title } = body;
    if (!id || !title) return NextResponse.json({ error: 'id and title are required' }, { status: 400 });

    const course = await prisma.course.update({ where: { id }, data: { title } });
    return NextResponse.json({ success: true, course });
  } catch {
    return NextResponse.json({ error: 'Failed to update course' }, { status: 500 });
  }
}

// DELETE — owner direct, non-owner Telegram confirm/reject
export async function DELETE(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;

  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    const role = config.getEffectiveRole(email, profile?.role);
    const isCR = profile?.isCR || false;

    const body = await req.json().catch(() => ({}));
    const { code, semester, department } = body;

    if (!code || !semester || !department) {
      return NextResponse.json({ error: 'code, semester, department required' }, { status: 400 });
    }

    const course = await prisma.course.findFirst({
      where: { code: code.toUpperCase(), semester, department },
    });
    if (!course) return NextResponse.json({ error: 'Course not found in database' }, { status: 404 });

    const isAdder = course.addedBy?.toLowerCase() === email.toLowerCase();
    const canDeleteByRole = ['admin', 'manager', 'teacher'].includes(role) || isCR;
    if (!isAdder && !canDeleteByRole) {
      return NextResponse.json({ error: 'Only the person who added this course, or admin/manager/teacher/CR can delete it.' }, { status: 403 });
    }

    const courseDept = course.department;
    const courseSem = course.semester;
    const courseCode = course.code;
    const courseTitle = course.title;
    const isOwner = config.ownerEmails.includes(email.toLowerCase());

    if (isOwner) {
      let githubDeleted = 0;
      try {
        const botToken = await getAppBotToken();
        if (botToken) {
          const cleanTitle = courseTitle.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
          const folderPath = `${config.uploadPath}/${courseDept}/${courseSem}/${courseCode} - ${cleanTitle}`;
          const allFiles = await getAllFilesInFolder(botToken, folderPath);
          githubDeleted = await batchDeleteFiles(botToken, allFiles);
        }
      } catch {}
      await prisma.course.delete({ where: { id: course.id } });

      try {
        const semLabel = config.semesters.find(s => s.id === courseSem)?.label || courseSem;
        const tgMsg = [
          `🗑 <b>Course Deleted</b>`, ``,
          `<b>Code:</b> <code>${courseCode}</code>`,
          `<b>Title:</b> ${courseTitle}`,
          `<b>Deleted by:</b> ${email} (owner)`,
          `<b>GitHub files removed:</b> ${githubDeleted}`,
        ].join('\n');
        const pageLink = buildBrowseLink({ dept: courseDept, sem: courseSem });
        await sendMessageWithButton(OWNER_CHAT_ID, tgMsg, `📂 View ${courseCode} in ${semLabel}`, pageLink);
      } catch {}
      return NextResponse.json({ success: true, githubDeleted });
    }

    // NON-OWNER: Telegram confirm/reject
    try {
      const semLabel = config.semesters.find(s => s.id === courseSem)?.label || courseSem;
      const requesterName = profile?.name || email.split('@')[0];
      const tgMsg = [
        `⚠️ <b>Course Delete Request</b>`, ``,
        `<b>Code:</b> <code>${courseCode}</code>`,
        `<b>Title:</b> ${courseTitle}`,
        `<b>Department:</b> ${getDeptFullName(courseDept)} (${courseDept})`,
        `<b>Semester:</b> ${semLabel}`,
        `<b>Requested by:</b> ${requesterName} (${email})`, ``,
        `Do you want to delete this course?`,
      ].join('\n');
      const pageLink = buildBrowseLink({ dept: courseDept, sem: courseSem });
      await sendMessageWithButtons(OWNER_CHAT_ID, tgMsg, [
        [
          { text: '✅ Confirm Delete', callback_data: deleteConfirmData(`${courseDept}/${courseSem}/${courseCode}`) },
          { text: '❌ Reject', callback_data: deleteRejectData(`${courseDept}/${courseSem}/${courseCode}`) },
        ],
        [{ text: `📂 View ${courseCode}`, url: pageLink }],
      ]);
    } catch {}

    return NextResponse.json({ success: false, pendingApproval: true, message: 'Delete request sent to owner for approval.' });
  } catch {
    return NextResponse.json({ error: 'Failed to delete course' }, { status: 500 });
  }
}
