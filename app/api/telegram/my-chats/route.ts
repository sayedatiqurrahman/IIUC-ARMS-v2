import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

const BOT_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN || ''}`;

interface ChatInfo {
  id: number;
  title: string;
  type: string;
  username?: string;
  memberCount?: number;
}

/**
 * Discover chats by temporarily dropping webhook, fetching getUpdates, then re-registering.
 * This is the same approach used by /api/telegram/chat-ids but with auth checks.
 */
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.admin);
  if (!rl.success) return rl.response!;

  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const callerProfile = await prisma.profile.findUnique({ where: { userId: email } });
    const effectiveRole = config.getEffectiveRole(email, callerProfile?.role);
    if (effectiveRole !== 'admin' && effectiveRole !== 'manager' && !config.ownerEmails.includes(email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN || '';
    const webhookSecret = process.env.TELEGRAM_BOT_WEBHOOK_SECRET || '';
    if (!token) {
      return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN not set' }, { status: 500 });
    }

    // Get bot info
    const meRes = await fetch(`${BOT_API}/getMe`);
    const meData = await meRes.json();
    if (!meData.ok) {
      return NextResponse.json({ error: 'Bot token invalid: ' + (meData.description || '') }, { status: 500 });
    }

    // Determine webhook URL
    const host = req.headers.get('host') || 'iiuc-arms.eu.cc';
    const protocol = req.headers.get('x-forwarded-proto') || 'https';
    const webhookUrl = `${protocol}://${host}/api/telegram/webhook`;

    // 1. Drop the webhook (DON'T discard pending updates)
    const dropRes = await fetch(`${BOT_API}/deleteWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ drop_pending_updates: false }),
    });
    const dropData = await dropRes.json();

    if (!dropData.ok) {
      return NextResponse.json({ error: 'Failed to drop webhook: ' + (dropData.description || '') }, { status: 500 });
    }

    // 2. Fetch recent updates (this is when getUpdates actually works)
    const updatesRes = await fetch(`${BOT_API}/getUpdates?limit=100&allowed_updates=["message","callback_query","my_chat_member","chat_member"]`);
    const updatesData = await updatesRes.json();

    // 3. Re-register webhook immediately
    const reRegRes = await fetch(`${BOT_API}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: webhookSecret || token,
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: false,
      }),
    });
    const reRegData = await reRegRes.json();

    // 4. Extract unique chats from updates
    const chatsMap = new Map<number, ChatInfo>();

    if (updatesData.ok && Array.isArray(updatesData.result)) {
      for (const u of updatesData.result) {
        const chat = u.message?.chat || u.callback_query?.message?.chat || u.my_chat_member?.chat || u.chat_member?.chat;
        if (chat?.id && !chatsMap.has(chat.id)) {
          chatsMap.set(chat.id, {
            id: chat.id,
            title: chat.title || chat.first_name || 'Unknown',
            type: chat.type,
            username: chat.username,
          });
        }
      }
    }

    const chats = Array.from(chatsMap.values());

    // 5. Try to get member counts for groups/channels
    for (const chat of chats) {
      if (chat.type === 'group' || chat.type === 'supergroup' || chat.type === 'channel') {
        try {
          const countRes = await fetch(`${BOT_API}/getChatMemberCount`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chat.id }),
          });
          const countData = await countRes.json();
          if (countData.ok) {
            chat.memberCount = countData.result;
          }
        } catch {}
      }
    }

    // 6. Categorize
    const channels = chats.filter(c => c.type === 'channel');
    const groups = chats.filter(c => c.type === 'group' || c.type === 'supergroup');
    const privateChats = chats.filter(c => c.type === 'private');

    return NextResponse.json({
      success: true,
      bot: { id: meData.result.id, username: meData.result.username, name: meData.result.first_name },
      chats,
      channels,
      groups,
      privateChats,
      total: chats.length,
      updatesProcessed: updatesData.result?.length || 0,
      webhookDropped: dropData.ok,
      webhookReRegistered: reRegData.ok,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to discover chats' }, { status: 500 });
  }
}
