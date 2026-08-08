import { NextRequest, NextResponse } from 'next/server';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const API = `https://api.telegram.org/bot${TOKEN}`;

export async function GET(req: NextRequest) {
  if (!TOKEN) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN not set' }, { status: 500 });
  }

  // Secret token verified by the webhook handler (X-Telegram-Bot-Api-Secret-Token header).
  // Falls back to the bot token itself so no extra env var is required.
  const secret = process.env.TELEGRAM_BOT_WEBHOOK_SECRET || TOKEN;

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
