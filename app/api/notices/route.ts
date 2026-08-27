import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { hasPermission } from '@/lib/permissions';
import { readNoticesIndex, writeNoticesIndex, uploadNoticeAttachment, isNoticeExpired, renameNoticeAttachment, deleteNoticeAttachments, type Notice, type NoticeCategory } from '@/lib/notices';

/** Default auto-delete TTL in days (≈6 months). */
const DEFAULT_NOTICE_TTL_DAYS = 183;

export async function GET() {
  let notices = await readNoticesIndex();
  // Filter out expired and scheduled (not yet published) notices
  notices = notices.filter(n => !isNoticeExpired(n) && n.status !== 'scheduled');
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
      const { notice, scheduledAt, telegramTargets } = body as { notice: Omit<Notice, 'id' | 'publishedAt'> & { id?: string; ttlDays?: number | null }; scheduledAt?: string; telegramTargets?: ('channel' | 'group' | 'personal')[] };
      if (!notice?.title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 });

      const notices = await readNoticesIndex();
      const now = new Date().toISOString();
      const author = { name: profile?.name || email.split('@')[0], email };

      // Compute expiresAt: null = never expire, number = days from now, default = 6 months
      let expiresAt: string | undefined;
      if (notice.ttlDays === null) {
        expiresAt = undefined; // never expires
      } else if (typeof notice.ttlDays === 'number' && notice.ttlDays > 0) {
        const d = new Date();
        d.setDate(d.getDate() + notice.ttlDays);
        expiresAt = d.toISOString();
      } else {
        const d = new Date();
        d.setDate(d.getDate() + DEFAULT_NOTICE_TTL_DAYS);
        expiresAt = d.toISOString();
      }

      if (action === 'create') {
        // Determine if this is a scheduled or immediate publish
        const isScheduled = scheduledAt && new Date(scheduledAt) > new Date();
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
          expiresAt,
          scheduledAt: isScheduled ? scheduledAt : undefined,
          status: isScheduled ? 'scheduled' : 'published',
          telegramTargets: telegramTargets && telegramTargets.length > 0 ? telegramTargets : undefined,
        };
        notices.unshift(newNotice);

        await writeNoticesIndex(notices, (await getToken(email))!, `notice: ${isScheduled ? 'schedule' : 'publish'} "${newNotice.title}"`, author);

        // Rename attachment to canonical name (title + category + date)
        if (newNotice.attachmentUrl) {
          const renameToken = (await getToken(email))!;
          renameNoticeAttachment(newNotice.attachmentUrl, newNotice.title, newNotice.category, newNotice.date, renameToken, author)
            .then(result => {
              if (result) {
                const idx2 = notices.findIndex(n => n.id === newNotice.id);
                if (idx2 !== -1) {
                  notices[idx2].attachmentUrl = result.url;
                  notices[idx2].attachmentName = result.name;
                  writeNoticesIndex(notices, renameToken, `notice: rename attachment → ${result.name}`, author).catch(() => {});
                }
              }
            }).catch(() => {});
        }

        // Only broadcast immediately if not scheduled
        if (!isScheduled) {
          broadcastNotice(newNotice, telegramTargets).catch(() => {});
        }

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
        expiresAt,
      };

      await writeNoticesIndex(notices, (await getToken(email))!, `notice: update "${notices[idx].title}"`, author);

      // Rename attachment to canonical name if it exists and title/category/date changed
      if (notices[idx].attachmentUrl) {
        const renameToken = (await getToken(email))!;
        renameNoticeAttachment(notices[idx].attachmentUrl!, notices[idx].title, notices[idx].category, notices[idx].date, renameToken, author)
          .then(result => {
            if (result) {
              const idx2 = notices.findIndex(n => n.id === notices[idx].id);
              if (idx2 !== -1) {
                notices[idx2].attachmentUrl = result.url;
                notices[idx2].attachmentName = result.name;
                writeNoticesIndex(notices, renameToken, `notice: rename attachment → ${result.name}`, author).catch(() => {});
              }
            }
          }).catch(() => {});
      }

      return NextResponse.json({ success: true, notice: notices[idx] });
    }

    if (action === 'delete') {
      const { id } = body as { id: string };
      const notices = await readNoticesIndex();
      const target = notices.find(n => n.id === id);
      if (!target) {
        return NextResponse.json({ error: 'Notice not found' }, { status: 404 });
      }
      const author = { name: profile?.name || email.split('@')[0], email };
      const token = (await getToken(email))!;

      // Delete attachment from GitHub if present
      await deleteNoticeAttachments(target, token, author);

      // Remove from JSON index
      const filtered = notices.filter(n => n.id !== id);
      await writeNoticesIndex(filtered, token, `notice: delete "${target.title}"`, author);
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

async function broadcastNotice(notice: Notice, targetTypes?: ('channel' | 'group' | 'personal')[]) {
  try {
    const { sendMessage, sendDocument, CHANNEL_ID, GROUP_ID, SITE_URL } = await import('@/lib/telegram/api');

    // Determine which target types to send to (default: all if not specified)
    const sendToChannel = !targetTypes || targetTypes.includes('channel');
    const sendToGroup = !targetTypes || targetTypes.includes('group');
    const sendToPersonal = !targetTypes || targetTypes.includes('personal');

    // Load dynamic broadcast targets from DB (unifies both postingChannels and
    // broadcastTargets so channels configured from either UI are honoured).
    let dynamicTargets: { chatId: string; type: string; enabled: boolean }[] = [];
    try {
      const { getEffectiveBroadcastTargets } = await import('@/lib/telegram/api');
      dynamicTargets = await getEffectiveBroadcastTargets();
    } catch {}

    const catLabel = notice.category === 'academic-calendar' ? 'Academic Calendar'
      : notice.category === 'bus-schedule' ? 'Bus Schedule' : 'Notice';
    const emoji = notice.category === 'academic-calendar' ? '📅'
      : notice.category === 'bus-schedule' ? '🚌' : '📢';

    const hasAttachment = !!notice.attachmentUrl;
    const isImage = hasAttachment && /\.(jpg|jpeg|png|gif|webp)$/i.test(notice.attachmentUrl!);
    const isPdf = hasAttachment && /\.pdf$/i.test(notice.attachmentUrl!);

    // --- Promotional footer ---
    const footer = [
      '',
      '━━━━━━━━━━━━━━━━━━',
      `🏛️ <b>Published by IIUC-ARMS</b>`,
      `📅 ${notice.date || new Date().toISOString().split('T')[0]}`,
      '',
      '🔗 <b>Follow us:</b>',
      `• 📢 Telegram Channel: <a href="https://t.me/iiuc_arms">t.me/iiuc_arms</a>`,
      `• 💬 Telegram Group: <a href="https://t.me/iiuc_arms_chat">t.me/iiuc_arms_chat</a>`,
      `• 🤖 Talk to Bot: <a href="https://t.me/${process.env.TELEGRAM_BOT_USERNAME || 'iiuc_arms_bot'}">@${process.env.TELEGRAM_BOT_USERNAME || 'iiuc_arms_bot'}</a>`,
      `• 🌐 Open App: <a href="${SITE_URL}">IIUC-ARMS</a>`,
      '',
      `📋 <a href="${SITE_URL}/notices/${notice.id}">View this Notice →</a>`,
      `📋 <a href="${SITE_URL}/notices">View All Notices →</a>`,
    ].filter(Boolean).join('\n');

    // --- Main message body ---
    let body = `${emoji} <b>${catLabel}</b>\n`;
    body += `<b>${notice.title}</b>\n`;
    if (notice.description) body += `\n${notice.description}\n`;
    if (notice.link) body += `\n🔗 <a href="${notice.link}">Open Link</a>`;
    if (hasAttachment && !isImage && !isPdf) {
      body += `\n📎 <a href="${notice.attachmentUrl}">Download: ${notice.attachmentName || 'Attachment'}</a>`;
    }

    const fullText = body + footer;

    // --- Send to dynamic targets (DB-configured) ---
    const sentChatIds = new Set<string>();

    for (const target of dynamicTargets) {
      if (target.type === 'channel' && !sendToChannel) continue;
      if (target.type === 'group' && !sendToGroup) continue;
      if (target.type === 'personal' && !sendToPersonal) continue;
      if (!target.chatId) continue;

      try {
        if (target.type === 'personal') {
          // Skip individual DMs in dynamic targets — handled below
          continue;
        }
        if (hasAttachment && (isImage || isPdf)) {
          await sendDocument(target.chatId, notice.attachmentUrl!, fullText);
        } else {
          await sendMessage(target.chatId, fullText, { disable_web_page_preview: !hasAttachment });
        }
        sentChatIds.add(target.chatId);
        console.log(`[TG] Broadcast to ${target.type} ${target.chatId} OK`);
      } catch (e) { console.error(`[TG] Broadcast to ${target.type} ${target.chatId} failed:`, e); }
    }

    // --- Fallback: send to env-var targets if not already sent via dynamic targets ---
    // Channel fallback
    if (sendToChannel && CHANNEL_ID && !sentChatIds.has(CHANNEL_ID)) {
      try {
        if (hasAttachment && (isImage || isPdf)) {
          await sendDocument(CHANNEL_ID, notice.attachmentUrl!, fullText);
        } else {
          await sendMessage(CHANNEL_ID, fullText, { disable_web_page_preview: !hasAttachment });
        }
      } catch (e) { console.error('[TG] Channel send failed:', e); }
    }

    // Group fallback
    if (sendToGroup && GROUP_ID && !sentChatIds.has(GROUP_ID)) {
      try {
        if (hasAttachment && (isImage || isPdf)) {
          await sendDocument(GROUP_ID, notice.attachmentUrl!, fullText);
        } else {
          await sendMessage(GROUP_ID, fullText, { disable_web_page_preview: !hasAttachment });
        }
      } catch (e) { console.error('[TG] Group send failed:', e); }
    }

    // --- Send to individual users (bot DM) ---
    if (sendToPersonal) {
      const hasPersonalTargets = dynamicTargets.some(t => t.type === 'personal');
      if (!hasPersonalTargets) {
        // Fallback to department notifications
        const { sendDepartmentNotifications } = await import('@/lib/telegram/notifications');
        await sendDepartmentNotifications(['ALL'], fullText, {
          type: 'notice', title: `${catLabel}: ${notice.title}`,
        }).catch(() => {});
      }
    }
  } catch (e) { console.error('[TG] broadcastNotice failed:', e); }
}
