/**
 * Job metadata only — safe to import in client components.
 * No server-side imports (prisma, fs, etc.).
 */

export interface CronJobMeta {
  id: string;
  label: string;
  description: string;
  icon: string;
  color: string;
  schedule: string;
  group: 'cleanup' | 'scheduled-publish' | 'maintenance';
}

export const CRON_JOBS_META: CronJobMeta[] = [
  {
    id: 'notice-cleanup',
    label: 'Notice Cleanup',
    description: 'Delete expired notices from the GitHub repository index based on their TTL setting.',
    icon: 'fas fa-bell-slash',
    color: 'text-amber-400',
    schedule: 'Daily at 3:00 AM',
    group: 'cleanup',
  },
  {
    id: 'routine-cleanup',
    label: 'Routine Cleanup',
    description: 'Delete published class routines that have passed their expiration date from the database.',
    icon: 'fas fa-calendar-xmark',
    color: 'text-blue-400',
    schedule: 'Daily at 3:00 AM',
    group: 'cleanup',
  },
  {
    id: 'exam-routine-cleanup',
    label: 'Exam Routine Cleanup',
    description: 'Delete published exam routines that have passed their expiration date from the database.',
    icon: 'fas fa-file-lines',
    color: 'text-purple-400',
    schedule: 'Daily at 3:00 AM',
    group: 'cleanup',
  },
  {
    id: 'activity-log-cleanup',
    label: 'Activity Log Cleanup',
    description: 'Delete activity log entries older than 3 months to keep the audit trail manageable.',
    icon: 'fas fa-clock-rotate-left',
    color: 'text-cyan-400',
    schedule: 'Weekly (Sundays at 4:00 AM)',
    group: 'cleanup',
  },
  {
    id: 'upload-chunk-cleanup',
    label: 'Upload Chunk Cleanup',
    description: 'Delete stale upload chunks older than 24 hours that were not finalized (e.g. from failed uploads).',
    icon: 'fas fa-database',
    color: 'text-green-400',
    schedule: 'Daily at 3:00 AM',
    group: 'cleanup',
  },
  {
    id: 'telegram-log-cleanup',
    label: 'Telegram Log Cleanup',
    description: 'Delete Telegram notification delivery logs older than 6 months.',
    icon: 'fab fa-telegram',
    color: 'text-sky-400',
    schedule: 'Weekly (Sundays at 4:00 AM)',
    group: 'cleanup',
  },
  {
    id: 'publish-class-routines',
    label: 'Publish Class Routines',
    description: 'Auto-publish class routines that have been scheduled for a future date/time.',
    icon: 'fas fa-calendar-check',
    color: 'text-blue-400',
    schedule: 'Every 5 min (client poll)',
    group: 'scheduled-publish',
  },
  {
    id: 'publish-exam-routines',
    label: 'Publish Exam Routines',
    description: 'Auto-publish exam routines that have been scheduled for a future date/time.',
    icon: 'fas fa-file-circle-check',
    color: 'text-purple-400',
    schedule: 'Every 5 min (client poll)',
    group: 'scheduled-publish',
  },
  {
    id: 'publish-seat-plans',
    label: 'Publish Seat Plans',
    description: 'Auto-publish seat plans that have been scheduled for a future date/time.',
    icon: 'fas fa-chair',
    color: 'text-pink-400',
    schedule: 'Every 5 min (client poll)',
    group: 'scheduled-publish',
  },
  {
    id: 'publish-notices',
    label: 'Publish Notices',
    description: 'Auto-publish scheduled notices from GitHub index when their scheduled time arrives.',
    icon: 'fas fa-bell',
    color: 'text-amber-400',
    schedule: 'Every 5 min (client poll)',
    group: 'scheduled-publish',
  },
  {
    id: 'github-profile-sync',
    label: 'GitHub Profile Sync',
    description: 'Re-sync GitHub profile data (name, avatar) for all connected users to keep contributor cards up to date.',
    icon: 'fab fa-github',
    color: 'text-gray-400',
    schedule: 'Weekly (Sundays at 5:00 AM)',
    group: 'maintenance',
  },
];
