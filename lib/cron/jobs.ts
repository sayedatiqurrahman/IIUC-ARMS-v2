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
    schedule: 'Every 5 minutes',
    group: 'scheduled-publish',
    run: runScheduledClassRoutines,
  },
  {
    id: 'publish-exam-routines',
    label: 'Publish Exam Routines',
    description: 'Auto-publish exam routines that have been scheduled for a future date/time.',
    icon: 'fas fa-file-circle-check',
    color: 'text-purple-400',
    schedule: 'Every 5 minutes',
    group: 'scheduled-publish',
    run: runScheduledExamRoutines,
  },
  {
    id: 'publish-seat-plans',
    label: 'Publish Seat Plans',
    description: 'Auto-publish seat plans that have been scheduled for a future date/time.',
    icon: 'fas fa-chair',
    color: 'text-pink-400',
    schedule: 'Every 5 minutes',
    group: 'scheduled-publish',
    run: runScheduledSeatPlans,
  },
];

export function getJobById(id: string): CronJob | undefined {
  return CRON_JOBS.find(j => j.id === id);
}
