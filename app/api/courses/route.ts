import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { hasPermission, canAddCourseToSemester } from '@/lib/permissions';
import { getDeptFullName, sendMessageWithButton, sendMessageWithButtons, buildBrowseLink, buildCourseLink, courseDeleteConfirmData, courseDeleteRejectData, resolveGithubToken } from '@/lib/telegram';
import { getAllFilesInFolder, deleteCourseFolder } from '@/lib/course-delete';

const GITHUB_API = 'https://api.github.com';
const OWNER_CHAT_ID = parseInt(process.env.TELEGRAM_OWNER_CHAT_ID || '0');

function ghHeaders(token: string) {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
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

    if (!(await hasPermission('addCourse', role, isCR, email))) {
      return NextResponse.json({ error: 'You do not have permission to add courses. Please contact your CR, ACR, teacher, manager, or admin.' }, { status: 403 });
    }

    const body = await req.json();
    const { department, semester, code, title } = body;
    if (!department || !semester || !code || !title) {
      return NextResponse.json({ error: 'department, semester, code, title are required' }, { status: 400 });
    }
    const courseTitle = title.trim();

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
      data: { department, semester, code: code.toUpperCase(), title: courseTitle, addedBy: email },
    });

    const botToken = await resolveGithubToken();
    if (botToken) {
      const cleanTitle = courseTitle.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
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
        `<b>Title:</b> ${courseTitle}`,
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

    const body = await req.json();
    const { id, title } = body;
    if (!id || !title) return NextResponse.json({ error: 'id and title are required' }, { status: 400 });

    const hasRolePermission = await hasPermission('editCourse', role, isCR, email);

    if (!hasRolePermission) {
      const course = await prisma.course.findUnique({ where: { id }, select: { addedBy: true } });
      if (!course || course.addedBy?.toLowerCase() !== email.toLowerCase()) {
        return NextResponse.json({ error: 'You do not have permission to edit this course' }, { status: 403 });
      }
    }

    const updated = await prisma.course.update({ where: { id }, data: { title } });
    return NextResponse.json({ success: true, course: updated });
  } catch {
    return NextResponse.json({ error: 'Failed to update course' }, { status: 500 });
  }
}

// DELETE — role holders delete directly; a regular user deleting their own
// upload goes through a pending approval that admins confirm from the panel
// or the Telegram bot.
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
    const isOwner = config.ownerEmails.includes(email.toLowerCase());
    const canDeleteByRole = isOwner || ['admin', 'manager', 'teacher'].includes(role) || isCR;

    const body = await req.json().catch(() => ({}));
    const { code, semester, department, folderPath: rawFolderPath, title } = body;

    if (!code || !semester || !department) {
      return NextResponse.json({ error: 'code, semester, department required' }, { status: 400 });
    }

    // Try DB first, but don't require it
    let course: any = null;
    try {
      course = await prisma.course.findFirst({
        where: { code: code.toUpperCase(), semester, department },
      });
    } catch {}

    const isCourseOwner = course?.addedBy?.toLowerCase() === email.toLowerCase();

    if (!canDeleteByRole && !isCourseOwner) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const courseTitle = course?.title || title || code;
    const courseDept = course?.department || department;
    const courseSem = course?.semester || semester;
    const courseCode = course?.code || code.toUpperCase();

    // Build folder path — try rawFolderPath first, then reconstruct
    let folderPath = rawFolderPath;
    if (!folderPath) {
      const cleanTitle = courseTitle.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
      folderPath = `${config.uploadPath}/${courseDept}/${courseSem}/${courseCode} - ${cleanTitle}`;
    }

    // Admin/owner/manager/teacher/CR → direct delete, no confirmation
    if (canDeleteByRole) {
      const githubDeleted = await deleteCourseFolder(folderPath).catch(() => 0);

      // Delete from DB if exists
      if (course) {
        try { await prisma.course.delete({ where: { id: course.id } }); } catch {}
      }
      try {
        await prisma.activityLog.create({
          data: {
            action: 'course_delete',
            userId: email,
            userName: profile?.name || email.split('@')[0],
            details: JSON.stringify({ code: courseCode, title: courseTitle, department: courseDept, semester: courseSem, folderPath }),
          },
        });
      } catch {}

      return NextResponse.json({ success: true, githubDeleted, directDelete: true });
    }

    // Regular user deleting their own upload → pending admin approval
    const semLabel = config.semesters.find(s => s.id === courseSem)?.label || courseSem;
    const requesterName = profile?.name || email.split('@')[0];

    // Get file list for the notification
    let fileList = '';
    let fileCount = 0;
    try {
      const botToken = await resolveGithubToken();
      if (botToken) {
        const allFiles = await getAllFilesInFolder(botToken, folderPath);
        fileCount = allFiles.length;
        const categories: Record<string, string[]> = {};
        for (const f of allFiles) {
          const parts = f.path.split('/');
          const cat = parts[parts.length - 2] || 'Other';
          if (!categories[cat]) categories[cat] = [];
          categories[cat].push(parts[parts.length - 1]);
        }
        fileList = Object.entries(categories).map(([cat, files]) =>
          `📁 <b>${cat}/</b>\n${files.map(f => `  · ${f}`).join('\n')}`
        ).join('\n');
      }
    } catch {}

    // Persist the pending request so admins can also approve it from the panel
    let activityId = '';
    try {
      const logEntry = await prisma.activityLog.create({
        data: {
          action: 'course_delete_request',
          userId: email,
          userName: requesterName,
          details: JSON.stringify({
            code: courseCode, title: courseTitle, department: courseDept, semester: courseSem,
            folderPath, fileCount, fileList, status: 'pending_approval',
          }),
        },
      });
      activityId = logEntry.id;
    } catch {}

    // Send to all configured approvers (owner + admins with telegramChatId)
    const approverChatIds: number[] = [];
    if (OWNER_CHAT_ID) approverChatIds.push(OWNER_CHAT_ID);

    try {
      const adminProfiles = await prisma.profile.findMany({
        where: { role: 'admin' },
        select: { telegramChatId: true },
      });
      for (const ap of adminProfiles) {
        const chatId = (ap as any).telegramChatId;
        if (chatId && !approverChatIds.includes(chatId)) {
          approverChatIds.push(chatId);
        }
      }
    } catch {}

    const pageLink = buildCourseLink(courseCode, courseDept, courseSem);
    const tgMsg = [
      `⚠️ <b>Course Delete Request</b>`, ``,
      `<b>Code:</b> <code>${courseCode}</code>`,
      `<b>Title:</b> ${courseTitle}`,
      `<b>Department:</b> ${getDeptFullName(courseDept)} (${courseDept})`,
      `<b>Semester:</b> ${semLabel}`,
      `<b>Web app path:</b> <code>${folderPath}</code>`,
      `<b>Files:</b> ${fileCount} file(s)`,
      `<b>Requested by:</b> ${requesterName} (${email})`,
      fileList ? `` : ``,
      fileList ? `<b>File structure:</b>\n<pre>${fileList}</pre>` : ``,
      `Approve or reject this deletion:`,
    ].join('\n');

    // Store the sent message ids so panel approvals can update them too
    const messages: { chatId: number; messageId: number }[] = [];
    for (const chatId of approverChatIds) {
      try {
        const sent = await sendMessageWithButtons(chatId, tgMsg, [
          [
            ...(activityId ? [{ text: '✅ Confirm Delete', callback_data: courseDeleteConfirmData(activityId) }] : []),
            ...(activityId ? [{ text: '❌ Reject', callback_data: courseDeleteRejectData(activityId) }] : []),
          ],
          [{ text: `📂 Open course in web app`, url: pageLink }],
        ]);
        const result = await sent.json().catch(() => null);
        if (result?.ok && result.result?.message_id) {
          messages.push({ chatId, messageId: result.result.message_id });
        }
      } catch {}
    }

    if (messages.length > 0 && activityId) {
      try {
        const existing = await prisma.activityLog.findUnique({ where: { id: activityId } });
        const details = JSON.parse(existing?.details || '{}');
        details.messages = messages;
        await prisma.activityLog.update({ where: { id: activityId }, data: { details: JSON.stringify(details) } });
      } catch {}
    }

    return NextResponse.json({ success: false, pendingApproval: true, activityId, message: 'Delete request sent to admins for approval.' });
  } catch {
    return NextResponse.json({ error: 'Failed to delete course' }, { status: 500 });
  }
}
