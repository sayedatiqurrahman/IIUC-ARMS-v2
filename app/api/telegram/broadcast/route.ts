import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { sendMessageWithButtons } from '@/lib/telegram';

const BOT_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN || ''}`;
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || 'iiuc_arms_bot';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://iiuc-arms.eu.cc';

// POST — send broadcast message to channel with Start Bot + Open App buttons
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.admin);
  if (!rl.success) return rl.response!;

  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const isOwner = config.ownerEmails.includes(email.toLowerCase());
    if (!isOwner) {
      return NextResponse.json({ error: 'Only owner can broadcast' }, { status: 403 });
    }

    const { message, channel } = await req.json();
    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json({ error: 'Telegram bot token not configured' }, { status: 500 });
    }

    // Channel chat_id (e.g. @channelusername or -100xxxxxxxxxx)
    const chatId = channel || process.env.TELEGRAM_CHANNEL_ID || '';
    if (!chatId) {
      return NextResponse.json({ error: 'TELEGRAM_CHANNEL_ID not set or channel param required' }, { status: 500 });
    }

    const startBotUrl = `https://t.me/${BOT_USERNAME}?start`;
    const openAppUrl = SITE_URL;

    const broadcastMsg = `📢 <b>IIUC-ARMS</b>\n\n${message}`;

    const result = await sendMessageWithButtons(
      chatId,
      broadcastMsg,
      [
        [{ text: '🚀 Start Bot', url: startBotUrl }],
        [{ text: '🌐 Open App', url: openAppUrl }],
      ]
    );

    const body = await result.json();
    if (!body.ok) {
      return NextResponse.json({ error: body.description || 'Failed to send' }, { status: 500 });
    }

    return NextResponse.json({ success: true, messageId: body.result?.message_id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to broadcast' }, { status: 500 });
  }
}

// GET — list Telegram bot users count
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;

  try {
    const { prisma } = await import('@/lib/prisma');
    const profiles = await prisma.profile.findMany({
      select: { userId: true, name: true, email: true },
      orderBy: { userId: 'asc' },
    });
    return NextResponse.json({ success: true, users: profiles.length });
  } catch {
    return NextResponse.json({ success: true, users: 0 });
  }
}
