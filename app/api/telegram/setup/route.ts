import { NextRequest, NextResponse } from 'next/server';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const API = `https://api.telegram.org/bot${TOKEN}`;

export async function GET(req: NextRequest) {
  if (!TOKEN) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN not set' }, { status: 500 });
  }

  // Re-registering the webhook redirects the bot's updates, so only the owner
  // (holder of the webhook secret / bot token) may call this endpoint.
  const key = req.nextUrl.searchParams.get('key') || '';
  const secret = process.env.TELEGRAM_BOT_WEBHOOK_SECRET || TOKEN;
  if (!key || key !== secret) {
    return NextResponse.json(
      { error: 'Forbidden — pass ?key=<TELEGRAM_BOT_WEBHOOK_SECRET or TELEGRAM_BOT_TOKEN>' },
      { status: 403 }
    );
  }

  const host = req.headers.get('host') || req.nextUrl.host;
  const protocol = req.headers.get('x-forwarded-proto') || 'https';
  const webhookUrl = `${protocol}://${host}/api/telegram/webhook`;

  try {
    const res = await fetch(`${API}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secret,
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: true,
      }),
    });
    const data = await res.json();

    const botRes = await fetch(`${API}/getMe`);
    const botData = await botRes.json();

    return NextResponse.json({
      webhook: data,
      bot: botData,
      webhookUrl,
      secretConfigured: Boolean(process.env.TELEGRAM_BOT_WEBHOOK_SECRET),
      secretSource: process.env.TELEGRAM_BOT_WEBHOOK_SECRET ? 'TELEGRAM_BOT_WEBHOOK_SECRET' : 'TELEGRAM_BOT_TOKEN (fallback)',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
