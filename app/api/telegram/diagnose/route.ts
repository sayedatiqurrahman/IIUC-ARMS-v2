import { NextRequest, NextResponse } from 'next/server';
import {
  getCanonicalSiteUrl,
  getTelegramBot,
  getTelegramWebhookInfo,
  getTelegramWebhookUrl,
} from '@/lib/telegram/webhook';

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key') || '';
  const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  const webhookSecret = process.env.TELEGRAM_BOT_WEBHOOK_SECRET || '';
  const validKeys = [webhookSecret, botToken].filter(Boolean);

  if (!key || !validKeys.includes(key)) {
    return NextResponse.json(
      { error: 'Forbidden — pass ?key=<TELEGRAM_BOT_WEBHOOK_SECRET or TELEGRAM_BOT_TOKEN>' },
      { status: 403 },
    );
  }

  const host = req.headers.get('host') || '';
  const protocol = req.headers.get('x-forwarded-proto') || 'https';
  const expectedWebhookUrl = `${protocol}://${host}/api/telegram/webhook`;
  const canonicalWebhookUrl = getTelegramWebhookUrl();
  const out: Record<string, any> = {
    ts: new Date().toISOString(),
    env: {
      TELEGRAM_BOT_TOKEN: botToken ? 'SET' : 'MISSING',
      TELEGRAM_BOT_WEBHOOK_SECRET: process.env.TELEGRAM_BOT_WEBHOOK_SECRET
        ? 'SET'
        : 'unset (fallback = bot token)',
      canonicalSiteUrl: getCanonicalSiteUrl(),
    },
    expectedWebhookUrl,
    canonicalWebhookUrl,
  };

  if (botToken) {
    const info = await getTelegramWebhookInfo().catch((error) => {
      out.webhookInfoError = error instanceof Error ? error.message : 'Failed to read webhook info';
      return null;
    });
    if (info) out.webhookInfo = { ok: true, result: info };

    const bot = await getTelegramBot().catch(() => null);
    if (bot) out.botUsername = bot.username;
  } else {
    out.webhookInfo = { error: 'Cannot check — TELEGRAM_BOT_TOKEN is missing.' };
  }

  const info = out.webhookInfo?.result;
  if (info) {
    out.checks = {
      webhookRegistered: Boolean(info.url),
      urlMatchesThisDeployment: info.url === expectedWebhookUrl,
      urlMatchesCanonical: info.url === canonicalWebhookUrl,
      lastError: info.last_error_message || null,
      lastErrorDate: info.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : null,
      lastOkConnection: info.last_successful_connection
        ? new Date(info.last_successful_connection * 1000).toISOString()
        : null,
      pendingUpdates: info.pending_update_count ?? null,
      maxConnections: info.max_connections ?? null,
      allowedUpdates: info.allowed_updates ?? null,
    };

    if (!info.url) {
      out.verdict = 'Webhook is not registered. Re-register it from Admin → Telegram → Webhook Setup.';
    } else if (info.url !== canonicalWebhookUrl) {
      out.verdict = `Webhook points at the wrong URL (${info.url}). It must be ${canonicalWebhookUrl}.`;
    } else if (info.last_error_message) {
      out.verdict = `Telegram last failed to deliver an update: ${info.last_error_message}.`;
    } else {
      out.verdict = 'Webhook is registered on the canonical domain.';
    }
  }

  return NextResponse.json(out);
}
