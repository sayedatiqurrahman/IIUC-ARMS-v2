import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

const BOT_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN || ''}`;

/**
 * GET /api/telegram/webhook-info
 * Returns: webhook status, secret, setup URL, bot info, and DB column status.
 * Owner/admin only.
 */
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

    const token = process.env.TELEGRAM_BOT_TOKEN || '';
    const webhookSecret = process.env.TELEGRAM_BOT_WEBHOOK_SECRET || '';
    if (!token) {
      return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN not set' }, { status: 500 });
    }

    // Get bot info
    const meRes = await fetch(`${BOT_API}/getMe`);
    const meData = await meRes.json();

    // Get current webhook info from Telegram
    const whInfoRes = await fetch(`${BOT_API}/getWebhookInfo`);
    const whInfo = await whInfoRes.json();

    // Check DB columns
    const p = prisma as any;
    const dbStatus: Record<string, boolean> = {};
    try {
      const tableInfo = await p.$queryRawUnsafe(`PRAGMA table_info(SiteSettings)`);
      const cols = new Set((tableInfo as any[]).map((c: any) => c.name));
      const needed = ['customClubRoles', 'supportConfig', 'postingChannels', 'telegramChats'];
      for (const n of needed) dbStatus[n] = cols.has(n);
    } catch {
      for (const n of ['customClubRoles', 'supportConfig', 'postingChannels', 'telegramChats']) dbStatus[n] = false;
    }

    const host = req.headers.get('host') || 'iiuc-arms.eu.cc';
    const protocol = req.headers.get('x-forwarded-proto') || 'https';
    const siteUrl = `${protocol}://${host}`;
    const setupUrl = `${siteUrl}/api/telegram/setup?key=${webhookSecret}`;

    return NextResponse.json({
      success: true,
      bot: meData.ok ? { id: meData.result.id, username: meData.result.username, name: meData.result.first_name } : null,
      webhook: whInfo.ok ? {
        url: whInfo.result.url,
        hasCustomCertificate: whInfo.result.has_custom_certificate,
        pendingUpdateCount: whInfo.result.pending_update_count,
        lastErrorDate: whInfo.result.last_error_date,
        lastErrorMessage: whInfo.result.last_error_message,
        maxConnections: whInfo.result.max_connections,
      } : null,
      webhookSecret: webhookSecret ? `${webhookSecret.substring(0, 4)}${'*'.repeat(webhookSecret.length - 4)}` : null,
      webhookSecretRaw: webhookSecret,
      setupUrl,
      siteUrl,
      dbColumns: dbStatus,
      allColumnsExist: Object.values(dbStatus).every(Boolean),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to get webhook info' }, { status: 500 });
  }
}

/**
 * POST /api/telegram/webhook-info — Run auto-migration
 */
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
    const existingCols = new Set((tableInfo as any[]).map((c: any) => c.name));

    for (const col of columns) {
      if (!existingCols.has(col.name)) {
        try {
          await p.$executeRawUnsafe(`ALTER TABLE SiteSettings ADD COLUMN ${col.name} ${col.type}`);
          migrations.push(`Added ${col.name}`);
        } catch (e: any) {
          errors.push(`${col.name}: ${e?.message || 'unknown error'}`);
        }
      } else {
        migrations.push(`${col.name} already exists`);
      }
    }

    return NextResponse.json({ success: errors.length === 0, migrations, errors });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Migration failed' }, { status: 500 });
  }
}
