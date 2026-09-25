import { NextRequest, NextResponse } from 'next/server';
import {
  callTelegramApi,
  deleteTelegramWebhook,
  getTelegramBot,
  getTelegramWebhookUrl,
  registerTelegramWebhook,
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

  if (!botToken) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN is not set' }, { status: 500 });
  }

  try {
    const bot = await getTelegramBot();
    const webhookUrl = getTelegramWebhookUrl();
    let dropped = false;
    let reRegistered = false;
    let updates: any[] = [];

    try {
      dropped = await deleteTelegramWebhook();
      updates = await callTelegramApi<any[]>('getUpdates', {
        limit: 100,
        allowed_updates: ['message', 'callback_query'],
      });
    } finally {
      const registration = await registerTelegramWebhook();
      reRegistered = registration.info.url === webhookUrl;
    }

    const chats: Record<string, {
      id: number;
      title?: string;
      type?: string;
      username?: string;
      first_name?: string;
    }> = {};

    for (const update of updates) {
      const chat = update.message?.chat || update.callback_query?.message?.chat;
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

    const chatList = Object.values(chats);
    const channel = chatList.find((chat) => chat.type === 'channel');
    const group = chatList.find((chat) => chat.type === 'group' || chat.type === 'supergroup');
    const privateChat = chatList.find((chat) => chat.type === 'private');

    return NextResponse.json({
      ok: true,
      bot: { id: bot.id, username: bot.username, first_name: bot.first_name },
      webhookDropped: dropped,
      webhookReRegistered: reRegistered,
      webhookUrl,
      updatesCount: updates.length,
      allChats: chatList,
      suggested: {
        TELEGRAM_CHANNEL_ID: channel?.id ? String(channel.id) : '(not found)',
        TELEGRAM_GROUP_ID: group?.id ? String(group.id) : '(not found)',
        TELEGRAM_OWNER_CHAT_ID: privateChat?.id ? String(privateChat.id) : '(not found)',
      },
      steps: chatList.length === 0 ? [
        '1. Open your Telegram CHANNEL (where bot is admin) → send any message',
        '2. Open your Telegram GROUP (where bot is a member) → send any message',
        '3. Open the bot in PRIVATE CHAT → send /start',
        '4. Re-run this endpoint to discover the chat IDs',
        '5. Add the IDs to Vercel env vars and redeploy',
      ] : null,
      note: chatList.length > 0
        ? 'Add the suggested IDs to your .env file on Vercel and redeploy.'
        : 'No messages found. Follow the steps above, then re-run this endpoint.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to discover chat IDs';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
