import { NextRequest, NextResponse } from 'next/server';

// Discover chat IDs by temporarily dropping the webhook, fetching getUpdates, then re-registering.
// Owner-only: GET /api/telegram/chat-ids?key=<TELEGRAM_BOT_WEBHOOK_SECRET or TELEGRAM_BOT_TOKEN>
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key') || '';
  const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  const webhookSecret = process.env.TELEGRAM_BOT_WEBHOOK_SECRET || '';
  // Accept either the webhook secret OR the bot token as the key
  const validKeys = [webhookSecret, botToken].filter(Boolean);
  if (!key || !validKeys.includes(key)) {
    return NextResponse.json(
      { error: 'Forbidden — pass ?key=<TELEGRAM_BOT_WEBHOOK_SECRET or TELEGRAM_BOT_TOKEN>' },
      { status: 403 },
    );
  }

  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  if (!token) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN is not set' }, { status: 500 });
  }

  const API = `https://api.telegram.org/bot${token}`;
  const host = req.headers.get('host') || '';
  const protocol = req.headers.get('x-forwarded-proto') || 'https';
  const webhookUrl = `${protocol}://${host}/api/telegram/webhook`;

  try {
    // 1. Drop the webhook (keep_alive=false so Telegram stops sending updates)
    const dropRes = await fetch(`${API}/deleteWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ drop_pending_updates: true }),
    });
    const dropData = await dropRes.json();

    if (!dropData.ok) {
      return NextResponse.json({
        error: 'Failed to drop webhook',
        details: dropData,
        hint: 'If this fails, try running /api/telegram/setup to re-register, then retry.',
      }, { status: 500 });
    }

    // 2. Fetch recent updates
    const updatesRes = await fetch(`${API}/getUpdates?limit=100&allowed_updates=["message","callback_query"]`);
    const updatesData = await updatesRes.json();

    // 3. Re-register the webhook immediately
    const reRegRes = await fetch(`${API}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: webhookSecret || botToken,
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: false,
      }),
    });
    const reRegData = await reRegRes.json();

    // 4. Extract unique chat IDs from updates
    const chats: Record<string, { id: number; title?: string; type?: string; username?: string; first_name?: string }> = {};
    if (updatesData.ok && Array.isArray(updatesData.result)) {
      for (const u of updatesData.result) {
        const chat = u.message?.chat || u.callback_query?.message?.chat;
        if (chat?.id) {
          chats[String(chat.id)] = {
            id: chat.id,
            title: chat.title,
            type: chat.type,
            username: chat.username,
            first_name: chat.first_name,
          };
        }
      }
    }

    const chatList = Object.values(chats);

    // 5. Map to likely roles
    const channel = chatList.find((c) => c.type === 'channel');
    const group = chatList.find((c) => c.type === 'group' || c.type === 'supergroup');
    const privateChat = chatList.find((c) => c.type === 'private');

    return NextResponse.json({
      ok: true,
      webhookDropped: dropData.ok,
      webhookReRegistered: reRegData.ok,
      webhookUrl,
      updatesCount: updatesData.result?.length || 0,
      allChats: chatList,
      suggested: {
        TELEGRAM_CHANNEL_ID: channel?.id ? String(channel.id) : '(none found — send a message to your channel first)',
        TELEGRAM_GROUP_ID: group?.id ? String(group.id) : '(none found — send a message to your group first)',
        TELEGRAM_OWNER_CHAT_ID: privateChat?.id ? String(privateChat.id) : '(none found — send /start to the bot first)',
      },
      note: 'Add these IDs to your .env file on Vercel and redeploy.',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
