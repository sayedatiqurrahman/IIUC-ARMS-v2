import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import {
  callTelegramApi,
  deleteTelegramWebhook,
  getTelegramBot,
  getTelegramWebhookUrl,
  registerTelegramWebhook,
} from '@/lib/telegram/webhook';

async function verifyAuth(req: NextRequest) {
  const email = await getUserEmail(req);
  if (!email) return { error: 'Unauthorized' };

  const { prisma } = await import('@/lib/prisma');
  const callerProfile = await prisma.profile.findUnique({ where: { userId: email } });
  const effectiveRole = config.getEffectiveRole(email, callerProfile?.role);
  if (effectiveRole !== 'admin' && effectiveRole !== 'manager' && !config.ownerEmails.includes(email)) {
    return { error: 'Forbidden' };
  }

  return { email };
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.admin);
  if (!rl.success) return rl.response!;

  try {
    const auth = await verifyAuth(req);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.error === 'Unauthorized' ? 401 : 403 });
    }

    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN not set' }, { status: 500 });
    }

    const me = await getTelegramBot();
    const { prisma } = await import('@/lib/prisma');
    const p = prisma as any;

    let loggedChats: any[] = [];
    try {
      const tableInfo = await p.$queryRawUnsafe(`PRAGMA table_info(SiteSettings)`);
      const cols = new Set((tableInfo as any[]).map((column: any) => column.name));
      if (!cols.has('telegramChats')) {
        await p.$executeRawUnsafe(`ALTER TABLE SiteSettings ADD COLUMN telegramChats TEXT`);
      } else {
        const rows = await p.$queryRawUnsafe(`SELECT telegramChats FROM SiteSettings WHERE id = 'site-settings'`);
        const raw = (rows as any[])[0]?.telegramChats;
        if (raw) loggedChats = typeof raw === 'string' ? JSON.parse(raw) : raw;
      }
    } catch {}

    let extraChats: any[] = [];
    let reRegistered = false;
    let discoveryError: string | null = null;

    try {
      await deleteTelegramWebhook();
      const updates = await callTelegramApi<any[]>('getUpdates', {
        limit: 100,
        allowed_updates: ['message', 'callback_query', 'my_chat_member'],
      });
      const seen = new Set(loggedChats.map((chat: any) => String(chat.id)));

      for (const update of updates) {
        const chat = update.message?.chat || update.callback_query?.message?.chat || update.my_chat_member?.chat;
        if (chat?.id && !seen.has(String(chat.id))) {
          seen.add(String(chat.id));
          extraChats.push({
            id: chat.id,
            title: chat.title || chat.first_name || 'Unknown',
            type: chat.type,
            username: chat.username,
          });
        }
      }
    } catch (error) {
      discoveryError = error instanceof Error ? error.message : 'Failed to read pending updates';
    } finally {
      const registration = await registerTelegramWebhook();
      reRegistered = registration.info.url === getTelegramWebhookUrl();
    }

    const allChats = [...loggedChats, ...extraChats];
    const chatsMap = new Map<number, any>();
    for (const chat of allChats) {
      const id = typeof chat.id === 'string' ? parseInt(chat.id) : chat.id;
      if (!chatsMap.has(id)) chatsMap.set(id, { ...chat, id });
    }

    for (const chat of Array.from(chatsMap.values())) {
      if (chat.type === 'group' || chat.type === 'supergroup' || chat.type === 'channel') {
        try {
          const memberCount = await callTelegramApi<number>('getChatMemberCount', { chat_id: chat.id });
          chat.memberCount = memberCount;
        } catch {}
      }
    }

    const chats = Array.from(chatsMap.values()).sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    const channels = chats.filter((chat) => chat.type === 'channel');
    const groups = chats.filter((chat) => chat.type === 'group' || chat.type === 'supergroup');
    const privateChats = chats.filter((chat) => chat.type === 'private');

    return NextResponse.json({
      success: true,
      bot: { id: me.id, username: me.username, name: me.first_name },
      chats,
      channels,
      groups,
      privateChats,
      total: chats.length,
      source: { logged: loggedChats.length, extra: extraChats.length },
      discoveryError,
      webhookReRegistered: reRegistered,
      webhookUrl: getTelegramWebhookUrl(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to discover chats';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
