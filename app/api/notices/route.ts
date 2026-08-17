import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { hasPermission } from '@/lib/permissions';
import { readNoticesIndex, writeNoticesIndex, uploadNoticeAttachment, type Notice, type NoticeCategory } from '@/lib/notices';

export async function GET() {
  const notices = await readNoticesIndex();
  return NextResponse.json({ success: true, notices });
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;

  const email = await getUserEmail(req);
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await (await import('@/lib/prisma')).prisma.profile.findUnique({ where: { userId: email } });
  const effectiveRole = config.getEffectiveRole(email, profile?.role);
  if (!(await hasPermission('publishNotice', effectiveRole, profile?.isCR || false, email))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'create' || action === 'update') {
      const { notice } = body as { notice: Omit<Notice, 'id' | 'publishedAt'> & { id?: string } };
      if (!notice?.title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 });

      const notices = await readNoticesIndex();
      const now = new Date().toISOString();
      const author = { name: profile?.name || email.split('@')[0], email };

      if (action === 'create') {
        const newNotice: Notice = {
          id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          title: notice.title.trim(),
          description: (notice.description || '').trim(),
          category: (notice.category as NoticeCategory) || 'notice',
          date: notice.date || now.split('T')[0],
          pinned: !!notice.pinned,
          attachmentUrl: notice.attachmentUrl,
          attachmentName: notice.attachmentName,
          link: notice.link?.trim() || undefined,
          publishedBy: email,
          publishedByName: profile?.name || email.split('@')[0],
          publishedAt: now,
        };
        notices.unshift(newNotice);

        await writeNoticesIndex(notices, (await getToken(email))!, `notice: publish "${newNotice.title}"`, author);

        // Auto-post to Telegram/WhatsApp
        broadcastNotice(newNotice).catch(() => {});

        return NextResponse.json({ success: true, notice: newNotice });
      }

      // Update
      const idx = notices.findIndex(n => n.id === notice.id);
      if (idx === -1) return NextResponse.json({ error: 'Notice not found' }, { status: 404 });

      notices[idx] = {
        ...notices[idx],
        title: notice.title.trim(),
        description: (notice.description || '').trim(),
        category: (notice.category as NoticeCategory) || notices[idx].category,
        date: notice.date || notices[idx].date,
        pinned: !!notice.pinned,
        attachmentUrl: notice.attachmentUrl ?? notices[idx].attachmentUrl,
        attachmentName: notice.attachmentName ?? notices[idx].attachmentName,
        link: notice.link?.trim() || undefined,
      };

      await writeNoticesIndex(notices, (await getToken(email))!, `notice: update "${notices[idx].title}"`, author);
      return NextResponse.json({ success: true, notice: notices[idx] });
    }

    if (action === 'delete') {
      const { id } = body as { id: string };
      const notices = await readNoticesIndex();
      const filtered = notices.filter(n => n.id !== id);
      if (filtered.length === notices.length) {
        return NextResponse.json({ error: 'Notice not found' }, { status: 404 });
      }
      const author = { name: profile?.name || email.split('@')[0], email };
      await writeNoticesIndex(filtered, (await getToken(email))!, `notice: delete`, author);
      return NextResponse.json({ success: true });
    }

    if (action === 'upload') {
      const { fileBase64, fileName } = body as { fileBase64: string; fileName: string };
      if (!fileBase64 || !fileName) {
        return NextResponse.json({ error: 'File required' }, { status: 400 });
      }
      const author = { name: profile?.name || email.split('@')[0], email };
      const url = await uploadNoticeAttachment(fileBase64, fileName, (await getToken(email))!, author);
      return NextResponse.json({ success: true, url, fileName });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}

async function getToken(email: string): Promise<string> {
  // Try bot token first, then user token from profile
  try {
    const { getRepoBotToken } = await import('@/lib/github-app');
    const bot = await getRepoBotToken(config.owner, config.repo);
    if (bot) return bot;
  } catch {}
  const profile = await (await import('@/lib/prisma')).prisma.profile.findUnique({ where: { userId: email } });
  if (profile?.githubToken) return profile.githubToken;
  return process.env.GITHUB_TOKEN || '';
}

async function broadcastNotice(notice: Notice) {
  try {
    const { sendMessage } = await import('@/lib/telegram/api');
    const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://iiuc-arms.vercel.app';
    const catLabel = notice.category === 'academic-calendar' ? 'Academic Calendar'
      : notice.category === 'bus-schedule' ? 'Bus Schedule' : 'Notice';
    const emoji = notice.category === 'academic-calendar' ? '📅'
      : notice.category === 'bus-schedule' ? '🚌' : '📢';

    let text = `${emoji} <b>${catLabel}: ${notice.title}</b>\n`;
    if (notice.description) text += `\n${notice.description}\n`;
    if (notice.link) text += `\n🔗 <a href="${notice.link}">Open Link</a>`;
    text += `\n\n📅 ${notice.date || new Date().toISOString().split('T')[0]}`;
    text += `\n🏛️ Published by <b>IIUC-ARMS</b>`;
    text += `\n\n<a href="${SITE_URL}/notices">View All Notices →</a>`;

    const { sendDepartmentNotifications } = await import('@/lib/telegram/notifications');
    await sendDepartmentNotifications(['ALL'], text, { type: 'notice', title: `${catLabel}: ${notice.title}` }).catch(() => {});
  } catch {}
}
