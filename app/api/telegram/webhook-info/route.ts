import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import {
  getCanonicalSiteUrl,
  getTelegramBot,
  getTelegramWebhookInfo,
  getTelegramWebhookUrl,
} from '@/lib/telegram/webhook';

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.admin);
  if (!rl.success) return rl.response!;

  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const callerProfile = await prisma.profile.findUnique({ where: { userId: email } });
    const effectiveRole = config.getEffectiveRole(email, callerProfile?.role);
    if (effectiveRole !== 'admin' && effectiveRole !== 'manager' && !config.ownerEmails.includes(email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const bot = await getTelegramBot();
    const info = await getTelegramWebhookInfo();
    const expectedWebhookUrl = getTelegramWebhookUrl();
    const p = prisma as any;
    const dbStatus: Record<string, boolean> = {};

    try {
      const tableInfo = await p.$queryRawUnsafe(`PRAGMA table_info(SiteSettings)`);
      const cols = new Set((tableInfo as any[]).map((column: any) => column.name));
      for (const name of ['customClubRoles', 'supportConfig', 'postingChannels', 'telegramChats']) {
        dbStatus[name] = cols.has(name);
      }
    } catch {
      for (const name of ['customClubRoles', 'supportConfig', 'postingChannels', 'telegramChats']) {
        dbStatus[name] = false;
      }
    }

    return NextResponse.json({
      success: true,
      bot: { id: bot.id, username: bot.username, name: bot.first_name },
      webhook: {
        url: info.url,
        hasCustomCertificate: info.has_custom_certificate,
        pendingUpdateCount: info.pending_update_count,
        lastErrorDate: info.last_error_date || null,
        lastErrorMessage: info.last_error_message || null,
        maxConnections: info.max_connections,
      },
      expectedWebhookUrl,
      urlMatchesCanonical: info.url === expectedWebhookUrl,
      secretConfigured: Boolean(process.env.TELEGRAM_BOT_WEBHOOK_SECRET),
      siteUrl: getCanonicalSiteUrl(),
      dbColumns: dbStatus,
      allColumnsExist: Object.values(dbStatus).every(Boolean),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get webhook info';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.admin);
  if (!rl.success) return rl.response!;

  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const callerProfile = await prisma.profile.findUnique({ where: { userId: email } });
    const effectiveRole = config.getEffectiveRole(email, callerProfile?.role);
    if (effectiveRole !== 'admin' && effectiveRole !== 'manager' && !config.ownerEmails.includes(email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const p = prisma as any;
    const migrations: string[] = [];
    const errors: string[] = [];
    const columns = [
      { name: 'customClubRoles', type: 'TEXT' },
      { name: 'supportConfig', type: 'TEXT' },
      { name: 'postingChannels', type: 'TEXT' },
      { name: 'telegramChats', type: 'TEXT' },
    ];
    const tableInfo = await p.$queryRawUnsafe(`PRAGMA table_info(SiteSettings)`);
    const existingCols = new Set((tableInfo as any[]).map((column: any) => column.name));

    for (const column of columns) {
      if (!existingCols.has(column.name)) {
        try {
          await p.$executeRawUnsafe(`ALTER TABLE SiteSettings ADD COLUMN ${column.name} ${column.type}`);
          migrations.push(`Added ${column.name}`);
        } catch (error: any) {
          errors.push(`${column.name}: ${error?.message || 'unknown error'}`);
        }
      } else {
        migrations.push(`${column.name} already exists`);
      }
    }

    return NextResponse.json({ success: errors.length === 0, migrations, errors });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Migration failed' }, { status: 500 });
  }
}
