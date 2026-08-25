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

    // Get bot info
    const meRes = await fetch(`${BOT_API}/getMe`);
    const meData = await meRes.json();
    if (!meData.ok) {
      return NextResponse.json({ error: 'Bot token invalid' }, { status: 500 });
    }

    // Fetch recent updates to discover chats the bot has interacted with
    const updatesRes = await fetch(`${BOT_API}/getUpdates?limit=100&allowed_updates=["message","callback_query","my_chat_member"]`);
    const updatesData = await updatesRes.json();

    const chatsMap = new Map<number, ChatInfo>();

    if (updatesData.ok && Array.isArray(updatesData.result)) {
      for (const u of updatesData.result) {
        const chat = u.message?.chat || u.callback_query?.message?.chat || u.my_chat_member?.chat;
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

    // Also try getUpdates with higher offset to get more history
    // Try to get chat member counts for groups
    const chats = Array.from(chatsMap.values());

    // Try to get member count for each group/channel
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

    // Categorize
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
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to discover chats' }, { status: 500 });
  }
}
