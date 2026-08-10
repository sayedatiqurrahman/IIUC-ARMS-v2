import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { deleteRepoEntries } from '@/lib/file-delete';
import { editMessageText, sendMessage, buildBrowseLink } from '@/lib/telegram';

// Admin panel: list pending file delete requests and approve/reject them.
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

// GET /api/github/file-delete-requests — list pending requests
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
      where: { action: 'file_delete_request' },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    const requests = logs
      .map((log: any) => ({ id: log.id, createdAt: log.createdAt, details: parseDetails(log), userName: log.userName, userId: log.userId }))
      .filter((r: any) => r.details.status === 'pending_approval');

    return NextResponse.json({ success: true, requests });
  } catch {
    return NextResponse.json({ error: 'Failed to load file delete requests' }, { status: 500 });
  }
}

// POST /api/github/file-delete-requests — { id, action: 'approve' | 'reject' }
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
    if (!log || log.action !== 'file_delete_request') {
      return NextResponse.json({ error: 'Delete request not found' }, { status: 404 });
    }

    const details = parseDetails(log);
    if (details.status !== 'pending_approval') {
      return NextResponse.json({ error: `Request already ${details.status || 'processed'}` }, { status: 409 });
    }

    let githubDeleted = 0;
    if (action === 'approve') {
      if (details.path) {
        githubDeleted = await deleteRepoEntries([details.path]).catch(() => 0);
      }
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
        action: action === 'approve' ? 'file_delete_approved' : 'file_delete_rejected',
        details: JSON.stringify(resolved),
      },
    });

    // Sync the Telegram notification messages (if any were sent)
    const isFolder = !!details.isFolder;
    const browseLink = buildBrowseLink({
      dept: details.department || '',
      sem: details.semester || '',
      course: details.courseCode || '',
      cat: details.category || '',
    });
    for (const m of details.messages || []) {
      try {
        await editMessageText(m.chatId, m.messageId, action === 'approve'
          ? [
              `✅ <b>Delete Approved</b>`, ``,
              `<b>Kind:</b> ${isFolder ? '📁 Folder' : '📄 File'}`,
              `<b>Name:</b> <code>${details.name || ''}</code>`,
              `<b>Path:</b> <code>${details.path || ''}</code>`,
              `<b>Entries removed:</b> ${githubDeleted}`, ``,
              `<i>Approved from the admin panel by ${email}</i>`,
            ].join('\n')
          : [
              `❌ <b>Delete Rejected</b>`, ``,
              `<b>Name:</b> <code>${details.name || ''}</code>`,
              `<b>Path:</b> <code>${details.path || ''}</code>`, ``,
              `<i>Rejected from the admin panel by ${email}</i>`,
            ].join('\n'), {
          reply_markup: { inline_keyboard: browseLink ? [[{ text: `📂 Open in web app`, url: browseLink }]] : [] },
        });
      } catch {}
    }

    // Notify the requester via Telegram if connected
    try {
      const requesterProfile = await prisma.profile.findUnique({ where: { userId: log.userId } });
      const requesterChatId = (requesterProfile as any)?.telegramChatId;
      if (requesterChatId) {
        await sendMessage(Number(requesterChatId), action === 'approve'
          ? `✅ <b>Delete approved</b>\n\n<b>Name:</b> <code>${details.name || ''}</code>\n<b>Path:</b> <code>${details.path || ''}</code>\n\nYour delete request has been <b>approved</b> by an admin. ${githubDeleted} entry(ies) removed.`
          : `❌ <b>Delete rejected</b>\n\n<b>Name:</b> <code>${details.name || ''}</code>\n<b>Path:</b> <code>${details.path || ''}</code>\n\nYour delete request was <b>rejected</b> by an admin.`);
      }
    } catch {}

    return NextResponse.json({ success: true, action, githubDeleted });
  } catch {
    return NextResponse.json({ error: 'Failed to process file delete request' }, { status: 500 });
  }
}
