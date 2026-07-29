import { NextRequest, NextResponse } from 'next/server';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const API = `https://api.telegram.org/bot${TOKEN}`;

export async function GET(req: NextRequest) {
  if (!TOKEN) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN not set' }, { status: 500 });
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
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
