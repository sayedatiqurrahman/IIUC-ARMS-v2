import { NextRequest, NextResponse } from 'next/server';
import { registerBotCommands } from '@/lib/telegram/commands';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { getTelegramBot, registerTelegramWebhook } from '@/lib/telegram/webhook';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

async function hasAdminSession(req: NextRequest): Promise<boolean> {
  try {
    const email = await getUserEmail(req);
    if (!email) return false;

    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    const effectiveRole = config.getEffectiveRole(email, profile?.role);
    return config.ownerEmails.includes(email) || effectiveRole === 'admin' || effectiveRole === 'manager';
  } catch {
    return false;
  }
}

async function setupWebhook(req: NextRequest, allowKey: boolean) {
  if (!TOKEN) {
    return NextResponse.json(
      { error: 'TELEGRAM_BOT_TOKEN is NOT set in this deployment. Add it in Vercel, redeploy, then try again.' },
      { status: 500 },
    );
  }

  let authorizedBy: 'key' | 'session' | null = null;
  if (allowKey) {
    const key = req.nextUrl.searchParams.get('key') || '';
    const webhookSecret = process.env.TELEGRAM_BOT_WEBHOOK_SECRET || '';
    if (key && (key === webhookSecret || key === TOKEN)) authorizedBy = 'key';
  }

  if (!authorizedBy && await hasAdminSession(req)) authorizedBy = 'session';

  if (!authorizedBy) {
    return NextResponse.json(
      {
        error: allowKey
          ? 'Forbidden — log in as an admin or pass a valid setup key.'
          : 'Forbidden — log in as an admin, manager, or owner.',
      },
      { status: 403 },
    );
  }

  try {
    const registration = await registerTelegramWebhook();
    const bot = await getTelegramBot().catch(() => null);
    const commands = await registerBotCommands();

    return NextResponse.json({
      success: true,
      ok: true,
      authorizedBy,
      webhook: { ok: true, result: registration.result },
      bot,
      commands,
      webhookInfo: {
        url: registration.info.url,
        pendingUpdateCount: registration.info.pending_update_count,
        lastError: registration.info.last_error_message || null,
        lastOkConnection: registration.info.last_successful_connection || null,
      },
      webhookUrl: registration.webhookUrl,
      secretConfigured: Boolean(process.env.TELEGRAM_BOT_WEBHOOK_SECRET),
      secretSource: process.env.TELEGRAM_BOT_WEBHOOK_SECRET
        ? 'TELEGRAM_BOT_WEBHOOK_SECRET'
        : 'TELEGRAM_BOT_TOKEN (fallback)',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to register webhook';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return setupWebhook(req, true);
}

export async function POST(req: NextRequest) {
  return setupWebhook(req, false);
}
