import { NextRequest, NextResponse } from 'next/server';

// Public bot-health check. No key required — it reports which environment
// variables are present (booleans only, never values) and what Telegram thinks
// of the webhook, so bot outages can be diagnosed from any browser.
export async function GET(req: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  const webhookSecret = process.env.TELEGRAM_BOT_WEBHOOK_SECRET || '';
  const API = token ? `https://api.telegram.org/bot${token}` : '';

  const host = req.headers.get('host') || '';
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const expectedWebhookUrl = `${proto}://${host}/api/telegram/webhook`;

  const out: Record<string, any> = {
    ts: new Date().toISOString(),
    env: {
      TELEGRAM_BOT_TOKEN: token ? 'SET' : 'MISSING',
      TELEGRAM_BOT_WEBHOOK_SECRET: webhookSecret ? 'SET' : 'unset (fallback = bot token)',
      GITHUB_TOKEN: process.env.GITHUB_TOKEN ? 'SET' : 'unset',
    },
    expectedWebhookUrl,
  };

  if (!token) {
    out.verdict =
      'TELEGRAM_BOT_TOKEN is MISSING in this deployment. Go to Vercel → Project → Settings → Environment Variables, add it (and optionally TELEGRAM_BOT_WEBHOOK_SECRET), redeploy, then open /api/telegram/setup once.';
    return NextResponse.json(out);
  }

  const meRes = await fetch(`${API}/getMe`).catch(() => null);
  if (meRes) {
    const me = await meRes.json();
    out.bot = me.ok ? { username: me.result.username, name: me.result.first_name, id: me.result.id } : me;
  }

  const infoRes = await fetch(`${API}/getWebhookInfo`).catch(() => null);
  let wi: any = null;
  if (infoRes) {
    const data = await infoRes.json();
    wi = data.ok ? data.result : null;
    out.webhookInfo = wi || data;
  }

  if (wi) {
    out.checks = {
      webhookRegistered: Boolean(wi.url),
      urlMatchesThisDeployment: wi.url === expectedWebhookUrl,
      registeredUrl: wi.url,
      lastError: wi.last_error_message || null,
      lastErrorDate: wi.last_error_date ? new Date(wi.last_error_date * 1000).toISOString() : null,
      lastOkConnection: wi.last_successful_connection ? new Date(wi.last_successful_connection * 1000).toISOString() : null,
      pendingUpdates: wi.pending_update_count ?? null,
    };

    if (!wi.url) {
      out.verdict = 'NO webhook registered. Open the Admin panel → Telegram → Webhook Setup → "Re-register Webhook", or visit this URL while logged in as admin.';
    } else if (wi.url !== expectedWebhookUrl) {
      out.verdict = `Webhook points at a DIFFERENT URL (${wi.url}). Re-register it on this deployment as described above.`;
    } else if (wi.last_error_message) {
      out.verdict = `Telegram last FAILED to deliver updates: "${wi.last_error_message}". This usually means the secret_token registered on the webhook differs from TELEGRAM_BOT_WEBHOOK_SECRET / TELEGRAM_BOT_TOKEN in Vercel — re-register as above.`;
    } else if (wi.last_successful_connection) {
      out.verdict = 'Webhook is registered here and Telegram last connected successfully. If the bot still does not reply, open Vercel → Deployments and confirm the latest build is live; then send the bot a message and check Vercel function logs for "[TG] Webhook received".';
    } else {
      out.verdict = 'Webhook registered here but no successful delivery recorded yet. Send the bot a message and check Vercel function logs.';
    }
  } else {
    out.verdict = 'Could not read webhook info from Telegram (api.telegram.org unreachable or token rejected). Check Vercel firewall/egress settings.';
  }

  return NextResponse.json(out);
}