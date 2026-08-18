export interface CronJob {
  id: string;
  label: string;
  description: string;
  icon: string;
  color: string;
  /** Schedule hint for display (not enforced here) */
  schedule: string;
  /** Group for categorization in the UI */
  group: 'cleanup' | 'scheduled-publish' | 'maintenance';
  /** Execute the job. Returns a result summary string. */
  run: () => Promise<{ success: boolean; message: string; details?: string }>;
}

// ─── Job implementations ─────────────────────────────────────────

async function runNoticeCleanup() {
  const { removeExpiredNotices } = await import('@/lib/notices');
  const token = process.env.GITHUB_TOKEN || '';
  if (!token) return { success: false, message: 'No GitHub token configured' };
  const removed = await removeExpiredNotices(token, { name: 'IIUC-ARMS Cron', email: 'cron@iiuc-arms.eu.cc' });
  return { success: true, message: `Removed ${removed} expired notice(s)`, details: removed > 0 ? undefined : 'No expired notices found' };
}

async function runRoutineCleanup() {
  const { prisma } = await import('@/lib/prisma');
  const now = new Date();
  const result = await prisma.publishedRoutine.deleteMany({ where: { expiresAt: { lt: now } } });
  return { success: true, message: `Removed ${result.count} expired routine(s)`, details: result.count > 0 ? undefined : 'No expired routines found' };
}

async function runExamRoutineCleanup() {
  const { prisma } = await import('@/lib/prisma');
  const now = new Date();
  const result = await prisma.publishedExamRoutine.deleteMany({ where: { expiresAt: { lt: now } } });
  return { success: true, message: `Removed ${result.count} expired exam routine(s)`, details: result.count > 0 ? undefined : 'No expired exam routines found' };
}

async function runActivityLogCleanup() {
  const { prisma } = await import('@/lib/prisma');
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 3);
  const result = await prisma.activityLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return { success: true, message: `Removed ${result.count} old activity log(s)`, details: result.count > 0 ? undefined : 'No old logs found' };
}

async function runUploadChunkCleanup() {
  const { prisma } = await import('@/lib/prisma');
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 24);
  const result = await prisma.uploadChunk.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return { success: true, message: `Removed ${result.count} stale upload chunk(s)`, details: result.count > 0 ? undefined : 'No stale chunks found' };
}

async function runTelegramNotificationCleanup() {
  const { prisma } = await import('@/lib/prisma');
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 6);
  const result = await prisma.telegramNotification.deleteMany({ where: { sentAt: { lt: cutoff } } });
  return { success: true, message: `Removed ${result.count} old Telegram notification log(s)`, details: result.count > 0 ? undefined : 'No old logs found' };
}

// ─── Scheduled Publish Jobs ──────────────────────────────────────

async function runScheduledClassRoutines() {
  const { prisma } = await import('@/lib/prisma');
  const now = new Date();
  const scheduled = await prisma.publishedRoutine.findMany({
    where: { status: 'scheduled', scheduledAt: { lte: now } },
  });
  if (scheduled.length === 0) return { success: true, message: 'No scheduled class routines to publish', details: 'All clear' };

  const result = await prisma.publishedRoutine.updateMany({
    where: { status: 'scheduled', scheduledAt: { lte: now } },
    data: { status: 'published', publishedAt: now },
  });
  return { success: true, message: `Auto-published ${result.count} class routine(s)`, details: scheduled.map(r => `${r.semester} (${r.department || 'all'})`).join(', ') };
}

async function runScheduledExamRoutines() {
  const { prisma } = await import('@/lib/prisma');
  const now = new Date();
  const scheduled = await prisma.publishedExamRoutine.findMany({
    where: { status: 'scheduled', scheduledAt: { lte: now }, type: null },
  });
  if (scheduled.length === 0) return { success: true, message: 'No scheduled exam routines to publish', details: 'All clear' };

  const result = await prisma.publishedExamRoutine.updateMany({
    where: { status: 'scheduled', scheduledAt: { lte: now }, type: null },
    data: { status: 'published', publishedAt: now },
  });
  return { success: true, message: `Auto-published ${result.count} exam routine(s)`, details: scheduled.map(r => `${r.semester} - ${r.examType || 'exam'} (${r.department || 'all'})`).join(', ') };
}

async function runScheduledSeatPlans() {
  const { prisma } = await import('@/lib/prisma');
  const now = new Date();
  const scheduled = await prisma.publishedExamRoutine.findMany({
    where: { status: 'scheduled', scheduledAt: { lte: now }, type: 'seatplan' },
  });
  if (scheduled.length === 0) return { success: true, message: 'No scheduled seat plans to publish', details: 'All clear' };

  const result = await prisma.publishedExamRoutine.updateMany({
    where: { status: 'scheduled', scheduledAt: { lte: now }, type: 'seatplan' },
    data: { status: 'published', publishedAt: now },
  });
  return { success: true, message: `Auto-published ${result.count} seat plan(s)`, details: scheduled.map(r => `${r.department || 'all'} - ${r.examType || 'exam'}`).join(', ') };
}

async function runScheduledNotices() {
  const { readNoticesIndex, writeNoticesIndex, isNoticeExpired } = await import('@/lib/notices');
  const now = new Date();
  const notices = await readNoticesIndex();
  const scheduled = notices.filter(n => n.status === 'scheduled' && n.scheduledAt && new Date(n.scheduledAt) <= now && !isNoticeExpired(n));
  if (scheduled.length === 0) return { success: true, message: 'No scheduled notices to publish', details: 'All clear' };

  // Update scheduled notices to published
  for (const n of scheduled) {
    n.status = 'published';
    n.publishedAt = now.toISOString();
    delete n.scheduledAt;
  }

  // Get token for commit + broadcast
  let token = '';
  try {
    const { getRepoBotToken } = await import('@/lib/github-app');
    const { config } = await import('@/lib/config');
    const bot = await getRepoBotToken(config.owner, config.repo);
    if (bot) token = bot;
  } catch {}
  if (!token) token = process.env.GITHUB_TOKEN || '';

  if (token) {
    await writeNoticesIndex(notices, token, `notice: auto-publish ${scheduled.length} scheduled notice(s)`);

    // Broadcast each published notice to Telegram
    const { sendMessage, sendDocument, CHANNEL_ID, GROUP_ID, SITE_URL } = await import('@/lib/telegram/api');
    for (const notice of scheduled) {
      try {
        const targets = notice.telegramTargets;
        const sendToChannel = !targets || targets.includes('channel');
        const sendToGroup = !targets || targets.includes('group');
        const sendToPersonal = !targets || targets.includes('personal');

        const catLabel = notice.category === 'academic-calendar' ? 'Academic Calendar'
          : notice.category === 'bus-schedule' ? 'Bus Schedule' : 'Notice';
        const emoji = notice.category === 'academic-calendar' ? '📅'
          : notice.category === 'bus-schedule' ? '🚌' : '📢';

        const hasAttachment = !!notice.attachmentUrl;
        const isImage = hasAttachment && /\.(jpg|jpeg|png|gif|webp)$/i.test(notice.attachmentUrl!);
        const isPdf = hasAttachment && /\.pdf$/i.test(notice.attachmentUrl!);

        let body = `${emoji} <b>${catLabel}</b>\n`;
        body += `<b>${notice.title}</b>\n`;
        if (notice.description) body += `\n${notice.description}\n`;
        if (notice.link) body += `\n🔗 <a href="${notice.link}">Open Link</a>`;

        const footer = [
          '', '━━━━━━━━━━━━━━━━━━',
          `🏛️ <b>Published by IIUC-ARMS</b>`,
          `📅 ${notice.date || now.toISOString().split('T')[0]}`,
          '', '🔗 <b>Follow us:</b>',
          sendToChannel ? `• 📢 Telegram Channel: <a href="https://t.me/iiuc_arms">t.me/iiuc_arms</a>` : '',
          sendToGroup ? `• 💬 Telegram Group: <a href="https://t.me/iiuc_arms_chat">t.me/iiuc_arms_chat</a>` : '',
          `• 🤖 Talk to Bot: <a href="https://t.me/${process.env.TELEGRAM_BOT_USERNAME || 'iiuc_arms_bot'}">@${process.env.TELEGRAM_BOT_USERNAME || 'iiuc_arms_bot'}</a>`,
          `• 🌐 Open App: <a href="${SITE_URL}">IIUC-ARMS</a>`,
          '', `📋 <a href="${SITE_URL}/notices/${notice.id}">View this Notice →</a>`,
          `📋 <a href="${SITE_URL}/notices">View All Notices →</a>`,
        ].filter(Boolean).join('\n');

        const fullText = body + footer;

        if (sendToChannel && CHANNEL_ID) {
          if (hasAttachment && (isImage || isPdf)) await sendDocument(CHANNEL_ID, notice.attachmentUrl!, fullText);
          else await sendMessage(CHANNEL_ID, fullText, { disable_web_page_preview: !hasAttachment });
        }
        if (sendToGroup && GROUP_ID) {
          if (hasAttachment && (isImage || isPdf)) await sendDocument(GROUP_ID, notice.attachmentUrl!, fullText);
          else await sendMessage(GROUP_ID, fullText, { disable_web_page_preview: !hasAttachment });
        }
        if (sendToPersonal) {
          const { sendDepartmentNotifications } = await import('@/lib/telegram/notifications');
          await sendDepartmentNotifications(['ALL'], fullText, { type: 'notice', title: `${catLabel}: ${notice.title}` }).catch(() => {});
        }
      } catch (e) { console.error(`[TG] broadcast scheduled notice failed: ${notice.title}`, e); }
    }
  }

  return { success: true, message: `Auto-published ${scheduled.length} notice(s)`, details: scheduled.map(n => n.title).join(', ') };
}

// ─── Job registry ────────────────────────────────────────────────

export const CRON_JOBS: CronJob[] = [
  {
    id: 'notice-cleanup',
    label: 'Notice Cleanup',
    description: 'Delete expired notices from the GitHub repository index based on their TTL setting.',
    icon: 'fas fa-bell-slash',
    color: 'text-amber-400',
    schedule: 'Daily at 3:00 AM',
    group: 'cleanup',
    run: runNoticeCleanup,
  },
  {
    id: 'routine-cleanup',
    label: 'Routine Cleanup',
    description: 'Delete published class routines that have passed their expiration date from the database.',
    icon: 'fas fa-calendar-xmark',
    color: 'text-blue-400',
    schedule: 'Daily at 3:15 AM',
    group: 'cleanup',
    run: runRoutineCleanup,
  },
  {
    id: 'exam-routine-cleanup',
    label: 'Exam Routine Cleanup',
    description: 'Delete published exam routines that have passed their expiration date from the database.',
    icon: 'fas fa-file-lines',
    color: 'text-purple-400',
    schedule: 'Daily at 3:30 AM',
    group: 'cleanup',
    run: runExamRoutineCleanup,
  },
  {
    id: 'activity-log-cleanup',
    label: 'Activity Log Cleanup',
    description: 'Delete activity log entries older than 3 months to keep the audit trail manageable.',
    icon: 'fas fa-clock-rotate-left',
    color: 'text-cyan-400',
    schedule: 'Weekly (Sundays at 4:00 AM)',
    group: 'cleanup',
    run: runActivityLogCleanup,
  },
  {
    id: 'upload-chunk-cleanup',
    label: 'Upload Chunk Cleanup',
    description: 'Delete stale upload chunks older than 24 hours that were not finalized (e.g. from failed uploads).',
    icon: 'fas fa-database',
    color: 'text-green-400',
    schedule: 'Every 6 hours',
    group: 'cleanup',
    run: runUploadChunkCleanup,
  },
  {
    id: 'telegram-log-cleanup',
    label: 'Telegram Log Cleanup',
    description: 'Delete Telegram notification delivery logs older than 6 months.',
    icon: 'fab fa-telegram',
    color: 'text-sky-400',
    schedule: 'Weekly (Sundays at 4:30 AM)',
    group: 'cleanup',
    run: runTelegramNotificationCleanup,
  },
  // ─── Scheduled Publish Jobs ───────────────────────────────────
  {
    id: 'publish-class-routines',
    label: 'Publish Class Routines',
    description: 'Auto-publish class routines that have been scheduled for a future date/time. Publishes when the scheduled time arrives.',
    icon: 'fas fa-calendar-check',
    color: 'text-blue-400',
    schedule: 'Every 5 min (client poll)',
    group: 'scheduled-publish',
    run: runScheduledClassRoutines,
  },
  {
    id: 'publish-exam-routines',
    label: 'Publish Exam Routines',
    description: 'Auto-publish exam routines that have been scheduled for a future date/time.',
    icon: 'fas fa-file-circle-check',
    color: 'text-purple-400',
    schedule: 'Every 5 min (client poll)',
    group: 'scheduled-publish',
    run: runScheduledExamRoutines,
  },
  {
    id: 'publish-seat-plans',
    label: 'Publish Seat Plans',
    description: 'Auto-publish seat plans that have been scheduled for a future date/time.',
    icon: 'fas fa-chair',
    color: 'text-pink-400',
    schedule: 'Every 5 min (client poll)',
    group: 'scheduled-publish',
    run: runScheduledSeatPlans,
  },
  {
    id: 'publish-notices',
    label: 'Publish Notices',
    description: 'Auto-publish scheduled notices from GitHub index when their scheduled time arrives.',
    icon: 'fas fa-bell',
    color: 'text-amber-400',
    schedule: 'Every 5 min (client poll)',
    group: 'scheduled-publish',
    run: runScheduledNotices,
  },
];

export function getJobById(id: string): CronJob | undefined {
  return CRON_JOBS.find(j => j.id === id);
}

// Exported for client-polling endpoint (/api/publish-scheduled)
export { runScheduledClassRoutines, runScheduledExamRoutines, runScheduledSeatPlans, runScheduledNotices };
