import { NextRequest, NextResponse } from 'next/server';
import { getCanonicalSiteUrl, getTelegramBot, getTelegramWebhookInfo, getTelegramWebhookUrl } from '@/lib/telegram/webhook';

export async function GET(req: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  const host = req.headers.get('host') || '';
  const protocol = req.headers.get('x-forwarded-proto') || 'https';
  const expectedWebhookUrl = `${protocol}://${host}/api/telegram/webhook`;
  const canonicalWebhookUrl = getTelegramWebhookUrl();

  const out: Record<string, any> = {
    ts: new Date().toISOString(),
    env: {
      TELEGRAM_BOT_TOKEN: token ? 'SET' : 'MISSING',
      TELEGRAM_BOT_WEBHOOK_SECRET: process.env.TELEGRAM_BOT_WEBHOOK_SECRET
        ? 'SET'
        : 'unset (fallback = bot token)',
    },
    siteUrl: getCanonicalSiteUrl(),
    expectedWebhookUrl,
    canonicalWebhookUrl,
  };

  if (!token) {
    out.verdict = 'TELEGRAM_BOT_TOKEN is missing in this deployment.';
    return NextResponse.json(out);
  }

  const bot = await getTelegramBot().catch((error) => {
    out.botError = error instanceof Error ? error.message : 'Failed to read bot info';
    return null;
  });
  if (bot) out.bot = { username: bot.username, name: bot.first_name, id: bot.id };

  const info = await getTelegramWebhookInfo().catch((error) => {
    out.webhookInfoError = error instanceof Error ? error.message : 'Failed to read webhook info';
    return null;
  });

  if (!info) {
    out.verdict = 'Could not read webhook info from Telegram.';
    return NextResponse.json(out);
  }

  out.webhookInfo = info;
  out.checks = {
    webhookRegistered: Boolean(info.url),
    urlMatchesThisDeployment: info.url === expectedWebhookUrl,
    urlMatchesCanonical: info.url === canonicalWebhookUrl,
    registeredUrl: info.url,
    lastError: info.last_error_message || null,
    lastErrorDate: info.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : null,
    lastOkConnection: info.last_successful_connection
      ? new Date(info.last_successful_connection * 1000).toISOString()
      : null,
    pendingUpdates: info.pending_update_count ?? null,
  };

  if (!info.url) {
    out.verdict = 'No webhook is registered. Use Admin → Telegram → Webhook Setup → Re-register Webhook.';
  } else if (info.url !== canonicalWebhookUrl) {
    out.verdict = `Webhook points at the wrong URL (${info.url}). It must be ${canonicalWebhookUrl}.`;
  } else if (info.last_error_message) {
    out.verdict = `Telegram last failed to deliver updates: "${info.last_error_message}".`;
  } else if (info.last_successful_connection) {
    out.verdict = 'Webhook is registered on the canonical domain and Telegram last connected successfully.';
  } else {
    out.verdict = 'Webhook is registered on the canonical domain; no successful delivery is recorded yet.';
  }

  return NextResponse.json(out);
}
