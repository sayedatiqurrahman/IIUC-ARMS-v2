import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { configuredSecret } from '@/lib/telegram/secret';

const BOT_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN || ''}`;

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

/**
 * GET /api/telegram/my-chats
 *
 * Primary: reads chats logged by the webhook handler from SiteSettings.telegramChats
 * Fallback: drops webhook → getUpdates → re-register (for chats not yet seen by webhook)
 */
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.admin);
  if (!rl.success) return rl.response!;

  try {
    const auth = await verifyAuth(req);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.error === 'Unauthorized' ? 401 : 403 });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN || '';
    const webhookSecret = process.env.TELEGRAM_BOT_WEBHOOK_SECRET || '';
    if (!token) {
      return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN not set' }, { status: 500 });
    }

    const meRes = await fetch(`${BOT_API}/getMe`);
    const meData = await meRes.json();
    if (!meData.ok) {
      return NextResponse.json({ error: 'Bot token invalid: ' + (meData.description || '') }, { status: 500 });
    }

    const { prisma } = await import('@/lib/prisma');
    const p = prisma as any;

    // ─── 1. Read chats logged by webhook ───
    let loggedChats: any[] = [];
    try {
      // Ensure column exists
      const tableInfo = await p.$queryRawUnsafe(`PRAGMA table_info(SiteSettings)`);
      const cols = new Set((tableInfo as any[]).map((c: any) => c.name));
      if (!cols.has('telegramChats')) {
        await p.$executeRawUnsafe(`ALTER TABLE SiteSettings ADD COLUMN telegramChats TEXT`);
      } else {
        const rows = await p.$queryRawUnsafe(`SELECT telegramChats FROM SiteSettings WHERE id = 'site-settings'`);
        const raw = (rows as any[])[0]?.telegramChats;
        if (raw) {
          loggedChats = typeof raw === 'string' ? JSON.parse(raw) : raw;
        }
      }
    } catch {}

    // ─── 2. Try getUpdates as fallback for extra chats ───
    const host = req.headers.get('host') || 'iiuc-arms.eu.cc';
    const protocol = req.headers.get('x-forwarded-proto') || 'https';
    const webhookUrl = `${protocol}://${host}/api/telegram/webhook`;

    let extraChats: any[] = [];
    let dropped = false;
    let reRegistered = false;

    try {
      // Drop webhook briefly
      const dropRes = await fetch(`${BOT_API}/deleteWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drop_pending_updates: false }),
      });
      dropped = (await dropRes.json()).ok;

      if (dropped) {
        // Fetch any pending updates
        const updatesRes = await fetch(`${BOT_API}/getUpdates?limit=100&allowed_updates=["message","callback_query","my_chat_member"]`);
        const updatesData = await updatesRes.json();

        if (updatesData.ok && Array.isArray(updatesData.result)) {
          const seen = new Set(loggedChats.map((c: any) => String(c.id)));
          for (const u of updatesData.result) {
            const chat = u.message?.chat || u.callback_query?.message?.chat || u.my_chat_member?.chat;
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
        }

        // Re-register webhook
        const reRegRes = await fetch(`${BOT_API}/setWebhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: webhookUrl,
            secret_token: configuredSecret(),
            allowed_updates: ['message', 'callback_query'],
            drop_pending_updates: false,
          }),
        });
        reRegistered = (await reRegRes.json()).ok;
      }
    } catch {}

    // ─── 3. Merge and get member counts ───
    const allChats = [...loggedChats, ...extraChats];
    const chatsMap = new Map<number, any>();
    for (const c of allChats) {
      const id = typeof c.id === 'string' ? parseInt(c.id) : c.id;
      if (!chatsMap.has(id)) {
        chatsMap.set(id, { ...c, id });
      }
    }

    // Get member counts for groups/channels
    for (const chat of Array.from(chatsMap.values())) {
      if (chat.type === 'group' || chat.type === 'supergroup' || chat.type === 'channel') {
        try {
          const countRes = await fetch(`${BOT_API}/getChatMemberCount`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chat.id }),
          });
          const countData = await countRes.json();
          if (countData.ok) chat.memberCount = countData.result;
        } catch {}
      }
    }

    const chats = Array.from(chatsMap.values()).sort((a, b) => (a.title || '').localeCompare(b.title || ''));
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
      source: {
        logged: loggedChats.length,
        extra: extraChats.length,
      },
      webhookReRegistered: reRegistered,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to discover chats' }, { status: 500 });
  }
}
