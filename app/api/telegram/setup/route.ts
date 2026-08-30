import { NextRequest, NextResponse } from 'next/server';
import { registerBotCommands } from '@/lib/telegram/commands';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const API = `https://api.telegram.org/bot${TOKEN}`;

// Re-registering the webhook redirects the bot's updates, so only the owner is
// allowed to call this endpoint. Authorized via EITHER:
//   1. ?key=<TELEGRAM_BOT_WEBHOOK_SECRET or TELEGRAM_BOT_TOKEN> (manual/scripted use), or
//   2. an authenticated admin/manager/owner session (the admin panel button).
export async function GET(req: NextRequest) {
  if (!TOKEN) {
    return NextResponse.json(
      { error: 'TELEGRAM_BOT_TOKEN is NOT set in this deployment. Add it in Vercel → Project → Settings → Environment Variables, redeploy, then try again.' },
      { status: 500 }
    );
  }

  const key = req.nextUrl.searchParams.get('key') || '';
  const webhookSecret = process.env.TELEGRAM_BOT_WEBHOOK_SECRET || '';
  let authorizedBy: 'key' | 'session' | null = null;
  if (key && (key === webhookSecret || key === TOKEN)) {
    authorizedBy = 'key';
  } else {
    try {
      const email = await getUserEmail(req);
      if (email) {
        const { prisma } = await import('@/lib/prisma');
        const profile = await prisma.profile.findUnique({ where: { userId: email } });
        const effectiveRole = config.getEffectiveRole(email, profile?.role);
        if (config.ownerEmails.includes(email) || effectiveRole === 'admin' || effectiveRole === 'manager') {
          authorizedBy = 'session';
        }
      }
    } catch {}
  }

  if (!authorizedBy) {
    return NextResponse.json(
      { error: 'Forbidden — log in to the site as an admin and revisit this URL, or pass ?key=<TELEGRAM_BOT_WEBHOOK_SECRET or TELEGRAM_BOT_TOKEN>' },
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
        secret_token: webhookSecret || TOKEN,
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: true,
      }),
    });
    const data = await res.json();

    const botRes = await fetch(`${API}/getMe`);
    const botData = await botRes.json();

    // Register the command menu (setMyCommands) so /upload and friends show up
    // in the Telegram UI above the input field.
    const commands = await registerBotCommands();

    // Report where the webhook now points so the owner can verify.
    const infoRes = await fetch(`${API}/getWebhookInfo`);
    const infoData = await infoRes.json();

    return NextResponse.json({
      authorizedBy,
      webhook: data,
      bot: botData,
      commands,
      webhookInfo: infoData.ok ? { url: infoData.result.url, pendingUpdateCount: infoData.result.pending_update_count } : null,
      webhookUrl,
      secretConfigured: Boolean(process.env.TELEGRAM_BOT_WEBHOOK_SECRET),
      secretSource: process.env.TELEGRAM_BOT_WEBHOOK_SECRET ? 'TELEGRAM_BOT_WEBHOOK_SECRET' : 'TELEGRAM_BOT_TOKEN (fallback)',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
