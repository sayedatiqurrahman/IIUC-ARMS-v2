import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { deleteCourseFolder } from '@/lib/course-delete';
import { editMessageText, sendMessage, buildCourseLink } from '@/lib/telegram';

// Admin panel: list pending course delete requests and approve/reject them.
// The same requests are also resolved from the Telegram bot buttons.

async function canAct(prisma: any, email: string): Promise<boolean> {
  const profile = await prisma.profile.findUnique({ where: { userId: email } });
  const role = config.getEffectiveRole(email, profile?.role);
  return config.ownerEmails.includes(email.toLowerCase())
    || role === 'admin' || role === 'manager' || role === 'teacher'
    || !!profile?.isCR;
}

function parseDetails(d: any): any {
  try { return JSON.parse(d?.details || '{}'); } catch { return {}; }
}

// GET /api/courses/delete-requests — list pending requests
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;

  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    if (!(await canAct(prisma, email))) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const logs = await prisma.activityLog.findMany({
      where: { action: 'course_delete_request' },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    const requests = logs
      .map((log: any) => ({ id: log.id, createdAt: log.createdAt, details: parseDetails(log), userName: log.userName, userId: log.userId }))
      .filter((r: any) => r.details.status === 'pending_approval');

    return NextResponse.json({ success: true, requests });
  } catch {
    return NextResponse.json({ error: 'Failed to load delete requests' }, { status: 500 });
  }
}

// POST /api/courses/delete-requests — { id, action: 'approve' | 'reject' }
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.admin);
  if (!rl.success) return rl.response!;

  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    if (!(await canAct(prisma, email))) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { id, action } = body;
    if (!id || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'id and action (approve/reject) are required' }, { status: 400 });
    }

    const log = await prisma.activityLog.findUnique({ where: { id } });
    if (!log || log.action !== 'course_delete_request') {
      return NextResponse.json({ error: 'Delete request not found' }, { status: 404 });
    }

    const details = parseDetails(log);
    if (details.status !== 'pending_approval') {
      return NextResponse.json({ error: `Request already ${details.status || 'processed'}` }, { status: 409 });
    }

    let githubDeleted = 0;
    if (action === 'approve') {
      if (details.folderPath) {
        githubDeleted = await deleteCourseFolder(details.folderPath).catch(() => 0);
      }
      // Remove the DB row if it exists
      try {
        const course = await prisma.course.findFirst({
          where: { code: String(details.code || '').toUpperCase(), semester: details.semester, department: details.department },
        });
        if (course) await prisma.course.delete({ where: { id: course.id } });
      } catch {}
    }

    const resolved = {
      ...details,
      status: action === 'approve' ? 'approved' : 'rejected',
      resolvedBy: email,
      resolvedAt: new Date().toISOString(),
      githubDeleted,
    };
    await prisma.activityLog.update({
      where: { id },
      data: {
        action: action === 'approve' ? 'course_delete_approved' : 'course_delete_rejected',
        details: JSON.stringify(resolved),
      },
    });

    // Sync the Telegram notification messages (if any were sent)
    const pageLink = buildCourseLink(details.code || '', details.department, details.semester);
    for (const m of details.messages || []) {
      try {
        await editMessageText(m.chatId, m.messageId, action === 'approve'
          ? [
              `✅ <b>Course Deleted</b>`, ``,
              `<b>Code:</b> <code>${details.code || ''}</code>`,
              `<b>Title:</b> ${details.title || ''}`,
              `<b>Path:</b> <code>${details.folderPath || ''}</code>`,
              `<b>GitHub files removed:</b> ${githubDeleted}`, ``,
              `<i>Approved from the admin panel by ${email}</i>`,
            ].join('\n')
          : [
              `❌ <b>Delete Rejected</b>`, ``,
              `<b>Code:</b> <code>${details.code || ''}</code>`,
              `<b>Title:</b> ${details.title || ''}`, ``,
              `<i>Rejected from the admin panel by ${email}</i>`,
            ].join('\n'), {
          reply_markup: { inline_keyboard: pageLink ? [[{ text: `📂 Open course in web app`, url: pageLink }]] : [] },
        });
      } catch {}
    }

    // Notify the requester via Telegram if connected
    try {
      const requesterProfile = await prisma.profile.findUnique({ where: { userId: log.userId } });
      const requesterChatId = (requesterProfile as any)?.telegramChatId;
      if (requesterChatId) {
        await sendMessage(Number(requesterChatId), action === 'approve'
          ? `✅ <b>Delete approved</b>\n\n<b>Course:</b> <code>${details.code || ''}</code> — ${details.title || ''}\n<b>Path:</b> <code>${details.folderPath || ''}</code>\n\nYour delete request has been <b>approved</b> by an admin.`
          : `❌ <b>Delete rejected</b>\n\n<b>Course:</b> <code>${details.code || ''}</code> — ${details.title || ''}\nYour delete request was <b>rejected</b> by an admin.`);
      }
    } catch {}

    return NextResponse.json({ success: true, action, githubDeleted });
  } catch {
    return NextResponse.json({ error: 'Failed to process delete request' }, { status: 500 });
  }
}
