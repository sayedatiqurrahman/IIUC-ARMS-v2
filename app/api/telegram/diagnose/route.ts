import { NextRequest, NextResponse } from 'next/server';

// Diagnose why the Telegram bot isn't responding.
// Owner-only: visit /api/telegram/diagnose?key=<TELEGRAM_BOT_WEBHOOK_SECRET>
// (falls back to TELEGRAM_BOT_TOKEN if the dedicated secret isn't set).
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key') || '';
  const secret = process.env.TELEGRAM_BOT_WEBHOOK_SECRET || process.env.TELEGRAM_BOT_TOKEN || '';
  if (!secret || key !== secret) {
    return NextResponse.json({ error: 'Forbidden — pass ?key=<TELEGRAM_BOT_WEBHOOK_SECRET or TELEGRAM_BOT_TOKEN>' }, { status: 403 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  const API = `https://api.telegram.org/bot${token}`;

  const out: Record<string, any> = {
    ts: new Date().toISOString(),
    env: {
      TELEGRAM_BOT_TOKEN: token ? 'SET' : 'MISSING',
      TELEGRAM_BOT_WEBHOOK_SECRET: process.env.TELEGRAM_BOT_WEBHOOK_SECRET ? 'SET' : 'unset (fallback = bot token)',
      GITHUB_TOKEN: process.env.GITHUB_TOKEN ? 'SET' : 'unset',
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || 'unset',
    },
  };

  const host = req.headers.get('host') || '';
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  out.expectedWebhookUrl = `${proto}://${host}/api/telegram/webhook`;

  if (token) {
    const infoRes = await fetch(`${API}/getWebhookInfo`).catch(() => null);
    if (infoRes) out.webhookInfo = await infoRes.json();

    const meRes = await fetch(`${API}/getMe`).catch(() => null);
    if (meRes) {
      const me = await meRes.json();
      out.botUsername = me?.result?.username || null;
    }
  } else {
    out.webhookInfo = { error: 'Cannot check — TELEGRAM_BOT_TOKEN is MISSING in this environment.' };
  }

  const wi = out.webhookInfo?.result;
  if (wi) {
    out.checks = {
      webhookRegistered: Boolean(wi.url),
      urlMatchesThisDeployment: wi.url === out.expectedWebhookUrl,
      lastError: wi.last_error_message || null,
      lastErrorDate: wi.last_error_date ? new Date(wi.last_error_date * 1000).toISOString() : null,
      lastOkConnection: wi.last_successful_connection ? new Date(wi.last_successful_connection * 1000).toISOString() : null,
      pendingUpdates: wi.pending_update_count ?? null,
      maxConnections: wi.max_connections ?? null,
      allowedUpdates: wi.allowed_updates ?? null,
    };
    if (!wi.url) {
      out.verdict = 'Webhook is NOT registered. Visit /api/telegram/setup?key=<secret> to register it.';
    } else if (wi.last_error_message) {
      out.verdict = `Telegram last failed to deliver an update (${wi.last_error_message}). Usually a secret_token mismatch — re-run /api/telegram/setup?key=<secret> after confirming TELEGRAM_BOT_TOKEN / TELEGRAM_BOT_WEBHOOK_SECRET are set.`;
    } else if (wi.url !== out.expectedWebhookUrl) {
      out.verdict = 'Webhook points at a different URL. Re-run /api/telegram/setup?key=<secret> on the current deployment.';
    } else {
      out.verdict = 'Webhook looks healthy. If the bot still does not reply, check Vercel function logs for the [TG] Webhook received lines.';
    }
  }

  return NextResponse.json(out);
}
