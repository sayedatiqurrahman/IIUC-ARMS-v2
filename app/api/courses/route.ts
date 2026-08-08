import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { getDepartmentFolder, getDepartmentIdByFolder } from '@/lib/departments';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { hasPermission, canAddCourseToSemester } from '@/lib/permissions';
import { getDeptFullName, sendMessageWithButton, sendMessageWithButtons, buildBrowseLink, buildCourseLink, courseDeleteConfirmData, courseDeleteRejectData, resolveGithubToken } from '@/lib/telegram';
import { getAllFilesInFolder, deleteCourseFolder, findCourseFolderPathInRepo } from '@/lib/course-delete';

const COURSE_SUBFOLDERS = ['Mid/NOTES', 'Mid/Previous Questions', 'Final/NOTES', 'Final/Previous Questions', 'sheet', 'Syllabus', 'Other'];

// Keep Unicode letters (e.g. Arabic) in titles — only strip path-unsafe characters.
function cleanCourseTitle(title: string): string {
  return String(title)
    .replace(/[\\/:*?"<>|\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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

// Rename a course folder on GitHub by remapping every blob under the old
// prefix to the new prefix (single tree commit). Returns '' on success or a
// short reason string on failure so callers can fall back to the bot token.
async function renameCourseFolderOnGithub(token: string, oldPath: string, newPath: string): Promise<string> {
  const refRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`, { headers: ghHeaders(token) });
  if (!refRes.ok) return `ref:${refRes.status}`;
  const baseCommitSha = (await refRes.json()).object.sha;

  const commitRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/commits/${baseCommitSha}`, { headers: ghHeaders(token) });
  if (!commitRes.ok) return `commit:${commitRes.status}`;
  const baseTreeSha = (await commitRes.json()).tree.sha;

  const treeRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/trees/${baseTreeSha}?recursive=1`, { headers: ghHeaders(token) });
  if (!treeRes.ok) return `tree:${treeRes.status}`;
  const fullTree = (await treeRes.json()).tree || [];

  const oldPrefix = oldPath + '/';
  const newPrefix = newPath + '/';

  // A Map keyed by path guarantees the submitted tree never contains duplicate
  // paths (one of the main causes of "createtree:422").
  const treeMap = new Map<string, any>();

  let moved = 0;
  for (const item of fullTree) {
    const p = String(item.path || '');
    if (item.type !== 'blob' || !p.startsWith(oldPrefix)) continue;
    const rel = p.slice(oldPrefix.length);
    if (!rel) continue;
    treeMap.set(`${newPrefix}${rel}`, { path: `${newPrefix}${rel}`, mode: item.mode, type: 'blob', sha: item.sha });
    treeMap.set(p, { path: p, sha: null, mode: item.mode, type: 'blob' }); // remove the old path
    moved++;
  }
  // Truly empty folder (only empty subdirectories, nothing tracked in git) —
  // recreate the standard skeleton under the new name so it still exists.
  if (moved === 0) {
    for (const sf of COURSE_SUBFOLDERS) {
      treeMap.set(`${newPath}/${sf}/.gitkeep`, { path: `${newPath}/${sf}/.gitkeep`, mode: '100644', type: 'blob', content: '' });
    }
  }

  // If the destination folder already exists (e.g. from a previous partial
  // rename), prune its existing entries first so the moved content replaces it
  // cleanly instead of colliding with inherited base-tree entries.
  for (const item of fullTree) {
    const p = String(item.path || '');
    if ((p === newPath || p.startsWith(newPrefix)) && !treeMap.has(p)) {
      treeMap.set(p, { path: p, sha: null, mode: item.mode, type: item.type });
    }
  }

  const treeItems = Array.from(treeMap.values());
  const createTreeRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/trees`, {
    method: 'POST', headers: ghHeaders(token),
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
  });
  if (!createTreeRes.ok) {
    const detail = await createTreeRes.text().catch(() => '');
    const trimmed = detail.replace(/\s+/g, ' ').trim().slice(0, 300);
    return `createtree:${createTreeRes.status}${trimmed ? ` — ${trimmed}` : ''}`;
  }
  const newTreeSha = (await createTreeRes.json()).sha;

  const newCommitRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/commits`, {
    method: 'POST', headers: ghHeaders(token),
    body: JSON.stringify({ message: `Rename course: ${oldPath} → ${newPath}`, tree: newTreeSha, parents: [baseCommitSha] }),
  });
  if (!newCommitRes.ok) return `commit2:${newCommitRes.status}`;
  const newCommitSha = (await newCommitRes.json()).sha;

  const refUpdateRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`, {
    method: 'PATCH', headers: ghHeaders(token),
    body: JSON.stringify({ sha: newCommitSha, force: true }),
  });
  return refUpdateRes.ok ? '' : `refupdate:${refUpdateRes.status}`;
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

// POST — create course folders on GitHub (source of truth) + keep logs.
// The browse list is derived from the GitHub tree, so courses are NOT stored
// in the DB anymore — this keeps the browse list exactly in sync with GitHub.
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

    const botToken = await resolveGithubToken();
    if (!botToken) {
      return NextResponse.json({ error: 'GitHub uploader is not connected. Please contact an admin.' }, { status: 400 });
    }

    const cleanTitle = cleanCourseTitle(courseTitle);
    const courseFolder = `${code.toUpperCase()} - ${cleanTitle}`;
    const basePath = `${config.uploadPath}/${getDepartmentFolder(department)}/${semester}/${courseFolder}`;

    // GitHub is the source of truth — check if the course folder already exists.
    // A targeted contents check is much cheaper than a full recursive tree fetch.
    let alreadyExisted = false;
    try {
      const probePath = `${basePath}/Mid/NOTES/.gitkeep`;
      const probeEncoded = probePath.split('/').map(encodeURIComponent).join('/');
      const probeRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/contents/${probeEncoded}`, { headers: ghHeaders(botToken) });
      alreadyExisted = probeRes.ok;
    } catch {}

    if (!alreadyExisted) {
      const allPaths = COURSE_SUBFOLDERS.map(sf => `${basePath}/${sf}`);
      const created = await batchCreateGitkeepFiles(botToken, basePath, allPaths);
      if (created === 0) {
        // Tree cache may be stale — re-check GitHub directly before failing
        try {
          const encoded = basePath.split('/').map(encodeURIComponent).join('/');
          const checkRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/contents/${encoded}`, { headers: ghHeaders(botToken) });
          alreadyExisted = checkRes.ok;
        } catch {}
        if (!alreadyExisted) {
          return NextResponse.json({ error: 'Failed to create course folders on GitHub' }, { status: 500 });
        }
      }
    }

    // Maintain course-creation logs
    try {
      await prisma.activityLog.create({
        data: {
          action: 'course_create',
          userId: email,
          userName: profile?.name || email.split('@')[0],
          details: JSON.stringify({ code: code.toUpperCase(), title: courseTitle, department, semester, folderPath: basePath, alreadyExisted }),
        },
      });
    } catch {}

    try {
      const deptFullName = getDeptFullName(department);
      const semLabel = config.semesters.find(s => s.id === semester)?.label || semester;
      const tgMsg = [
        `📚 <b>${alreadyExisted ? 'Course Re-selected' : 'New Course Added'}</b>`,
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

    return NextResponse.json({
      success: true,
      course: { code: code.toUpperCase(), title: cleanTitle, department, semester },
      alreadyExisted,
    }, { status: alreadyExisted ? 200 : 201 });
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to create course' }, { status: 500 });
  }
}

// PUT — rename a course title AND its GitHub folder (source of truth).
// The GitHub folder is renamed using the caller's personal PAT (githubToken),
// falling back to the app's bot token when the user hasn't connected one.
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
    let { code, semester, department, title, githubToken, folderPath: bodyFolderPath } = body;

    // Legacy callers send { id, title } — resolve folder info from the DB.
    if (!code && body.id) {
      try {
        const course = await prisma.course.findUnique({ where: { id: body.id }, select: { code: true, semester: true, department: true } });
        if (course) { code = course.code; semester = course.semester; department = course.department; }
      } catch {}
    }

    if (!code || !semester || !department || !title) {
      return NextResponse.json({ error: 'code, semester, department, title are required' }, { status: 400 });
    }
    const courseTitle = String(title).trim();
    if (!courseTitle) return NextResponse.json({ error: 'title is required' }, { status: 400 });

    if (!config.allDepartmentIds.has(department)) {
      return NextResponse.json({ error: 'Invalid department' }, { status: 400 });
    }

    // Permission: role-based editCourse, or the DB course owner.
    const hasRolePermission = await hasPermission('editCourse', role, isCR, email);
    if (!hasRolePermission) {
      let owner = '';
      try {
        const course = await prisma.course.findFirst({
          where: { code: code.toUpperCase(), semester, department: getDepartmentIdByFolder(department) },
          select: { addedBy: true },
        });
        owner = course?.addedBy || '';
      } catch {}
      if (owner.toLowerCase() !== email.toLowerCase()) {
        return NextResponse.json({ error: 'You do not have permission to edit this course' }, { status: 403 });
      }
    }

    const botToken = await resolveGithubToken();
    const candidateTokens = [githubToken, botToken].filter((t): t is string => typeof t === 'string' && t.length > 0);
    const tokens = candidateTokens.filter((t, i) => candidateTokens.indexOf(t) === i);
    if (tokens.length === 0) {
      return NextResponse.json({ error: 'GitHub is not connected. Please try again or contact an admin.' }, { status: 400 });
    }

    const cleanTitle = cleanCourseTitle(courseTitle);
    const deptFolder = getDepartmentFolder(department);
    const baseDir = `${config.uploadPath}/${deptFolder}/${semester}`;
    const newFolderPath = `${baseDir}/${code.toUpperCase()} - ${cleanTitle}`;

    // Find the real folder. The client sends the course's full GitHub path
    // (taken from the GitHub tree, the source of truth) as the unique ID, so
    // prefer it verbatim; only fall back to searching GitHub by code when it's
    // missing (legacy callers).
    let oldFolderPath: string | null = null;
    if (typeof bodyFolderPath === 'string' && bodyFolderPath.startsWith(config.uploadPath + '/') && bodyFolderPath.length > config.uploadPath.length + 1) {
      oldFolderPath = bodyFolderPath;
    }
    if (!oldFolderPath) {
      for (const t of tokens) {
        oldFolderPath = await findCourseFolderPathInRepo(t, baseDir, code);
        if (oldFolderPath) break;
      }
    }
    if (!oldFolderPath) {
      return NextResponse.json({ error: 'Course folder not found on GitHub' }, { status: 404 });
    }
    const codeUpper = code.toUpperCase();
    const oldTitle = (oldFolderPath.split('/').pop() || '').replace(new RegExp(`^${codeUpper.replace(/-/g, '\\s*-\\s*')}\\s*-\\s*`), '').trim();

    // Rename with the user's PAT first; if it can't write, the bot does it.
    if (oldFolderPath !== newFolderPath) {
      let reason = 'no write token';
      let renamed = false;
      for (const t of tokens) {
        reason = await renameCourseFolderOnGithub(t, oldFolderPath, newFolderPath);
        if (!reason) { renamed = true; break; }
      }
      if (!renamed) {
        console.error(`[course-rename] failed ${code}: ${reason}`);
        return NextResponse.json({ error: `Failed to rename the course folder on GitHub (${reason}). Our bot could not move it — please try again or contact an admin.` }, { status: 500 });
      }
    }

    // Update the DB log if a record still exists
    try {
      const existing = await prisma.course.findFirst({
        where: { code: code.toUpperCase(), semester, department: getDepartmentIdByFolder(department) },
      });
      if (existing) {
        await prisma.course.update({ where: { id: existing.id }, data: { title: courseTitle } });
      }
    } catch {}

    try {
      await prisma.activityLog.create({
        data: {
          action: 'course_edit',
          userId: email,
          userName: profile?.name || email.split('@')[0],
          details: JSON.stringify({ code: code.toUpperCase(), oldTitle, newTitle: courseTitle, department, semester, oldFolderPath, newFolderPath }),
        },
      });
    } catch {}

    try {
      const deptFullName = getDeptFullName(department);
      const semLabel = config.semesters.find(s => s.id === semester)?.label || semester;
      const tgMsg = [
        `✏️ <b>Course Renamed</b>`,
        ``,
        `<b>Code:</b> <code>${code.toUpperCase()}</code>`,
        `<b>Title:</b> ${oldTitle} → ${courseTitle}`,
        `<b>Department:</b> ${deptFullName} (${department})`,
        `<b>Semester:</b> ${semLabel}`,
        `<b>By:</b> ${email}`,
      ].join('\n');
      const pageLink = buildBrowseLink({ dept: department, sem: semester });
      await sendMessageWithButton(OWNER_CHAT_ID, tgMsg, `📂 View ${code.toUpperCase()}`, pageLink);
    } catch {}

    return NextResponse.json({
      success: true,
      renamed: oldFolderPath !== newFolderPath,
      course: { code: code.toUpperCase(), title: courseTitle, department, semester },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to rename course' }, { status: 500 });
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

    // Build folder path — try rawFolderPath first, then reconstruct. Existing
    // folders may use different spacing or Arabic titles, so search GitHub by
    // dept → semester → course code to find the real folder.
    let folderPath = rawFolderPath;
    if (!folderPath) {
      const cleanTitle = cleanCourseTitle(courseTitle);
      folderPath = `${config.uploadPath}/${getDepartmentFolder(courseDept)}/${courseSem}/${courseCode} - ${cleanTitle}`;
      try {
        const searchToken = await resolveGithubToken();
        if (searchToken) {
          const baseDir = `${config.uploadPath}/${getDepartmentFolder(courseDept)}/${courseSem}`;
          const found = await findCourseFolderPathInRepo(searchToken, baseDir, courseCode);
          if (found) folderPath = found;
        }
      } catch {}
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
