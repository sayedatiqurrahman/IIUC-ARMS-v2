import { sendMessage } from './api';

// ─── Department-wise Notification Helpers ─────────────────────────

export interface NotificationLogEntry {
  department: string;
  type: string;
  title: string;
  message: string;
  sentBy?: string;
  recipientCount: number;
}

export async function sendDepartmentNotifications(
  departments: string[],
  message: string,
  options?: { type?: string; title?: string; sentBy?: string; delayMs?: number; semester?: string }
): Promise<{ sent: number; failed: number; skipped: number }> {
  const { prisma } = await import('@/lib/prisma');
  const type = options?.type || 'routine_update';
  const title = options?.title || 'Notification';
  const delayMs = options?.delayMs ?? 100;

  const where: any = { telegramChatId: { not: null } };

  if (!departments.includes('ALL')) {
    where.department = { in: departments };
  }

  if (options?.semester) {
    where.semester = options.semester;
  }

  const profiles = await prisma.profile.findMany({
    where,
    select: { telegramChatId: true, name: true, department: true, userId: true },
  });

  if (profiles.length === 0) return { sent: 0, failed: 0, skipped: 0 };

  let sent = 0;
  let failed = 0;

  for (const p of profiles) {
    if (!p.telegramChatId) continue;
    try {
      const chatId = Number(p.telegramChatId);
      if (isNaN(chatId)) continue;
      await sendMessage(chatId, message, { disable_web_page_preview: true });
      sent++;
    } catch {
      failed++;
    }
    // Rate limit: 100ms between sends to avoid Telegram API limits
    if (delayMs > 0) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  // Log to database
  try {
    await prisma.telegramNotification.create({
      data: {
        department: departments.join(','),
        type,
        title,
        message: message.substring(0, 2000),
        sentBy: options?.sentBy || null,
        recipientCount: sent,
      },
    });
  } catch (err: any) {
    console.error('[TG] Failed to log notification:', err?.message);
  }

  return { sent, failed, skipped: profiles.length - sent - failed };
}

export async function getNotificationHistory(options?: { department?: string; type?: string; limit?: number }) {
  const { prisma } = await import('@/lib/prisma');
  const where: any = {};
  if (options?.department) where.department = options.department;
  if (options?.type) where.type = options.type;

  return prisma.telegramNotification.findMany({
    where,
    orderBy: { sentAt: 'desc' },
    take: options?.limit || 50,
  });
}

export async function getConnectedUsersCount(): Promise<number> {
  const { prisma } = await import('@/lib/prisma');
  return prisma.profile.count({
    where: { telegramChatId: { not: null } },
  });
}

// ─── Pending Account Admin Notification ───────────────────────────

export async function notifyAdminsPendingAccount(email: string, name?: string): Promise<void> {
  try {
    const { prisma } = await import('@/lib/prisma');

    // Check if notification is enabled
    const settings = await prisma.siteSettings.findUnique({ where: { id: 'site-settings' } });
    const perms = (settings?.permissions as Record<string, any>) || {};
    if (perms.notifyPendingAccounts === false) return;

    // Find all admins with telegramChatId
    const admins = await prisma.profile.findMany({
      where: {
        role: 'admin',
        telegramChatId: { not: null },
      },
      select: { telegramChatId: true, name: true, userId: true },
    });

    if (admins.length === 0) return;

    const displayName = name || email.split('@')[0];
    const message = [
      `🆕 <b>New Pending Account</b>`,
      ``,
      `<b>Email:</b> ${email}`,
      `<b>Name:</b> ${displayName}`,
      ``,
      `A non-university email has signed up and is waiting for your approval.`,
      ``,
      `<a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://iiuc-arms.eu.cc'}/dashboard">→ Review in Admin Panel</a>`,
    ].join('\n');

    for (const admin of admins) {
      if (!admin.telegramChatId) continue;
      try {
        const chatId = Number(admin.telegramChatId);
        if (isNaN(chatId)) continue;
        await sendMessage(chatId, message, { disable_web_page_preview: true });
      } catch {}
    }
  } catch (err: any) {
    console.error('[TG] Failed to notify admins about pending account:', err?.message);
  }
}

export async function getDepartmentConnectedUsersCount(departments: string[]): Promise<Record<string, number>> {
  const { prisma } = await import('@/lib/prisma');
  const profiles = await prisma.profile.findMany({
    where: {
      department: { in: departments },
      telegramChatId: { not: null },
    },
    select: { department: true },
  });

  const counts: Record<string, number> = {};
  for (const dept of departments) counts[dept] = 0;
  for (const p of profiles) {
    if (p.department && counts[p.department] !== undefined) {
      counts[p.department]++;
    }
  }
  return counts;
}