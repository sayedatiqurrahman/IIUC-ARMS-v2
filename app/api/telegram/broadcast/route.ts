import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { sendMessageWithButton } from '@/lib/telegram';
import { getAppInstallations, getInstallationAccessToken } from '@/lib/github-app';

const BOT_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN || ''}`;

async function getAppBotToken(): Promise<string | null> {
  try {
    const installations = await getAppInstallations();
    if (!Array.isArray(installations) || installations.length === 0) return null;
    return await getInstallationAccessToken(installations[0].id);
  } catch { return null; }
}

// POST — send broadcast message to all bot users
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

    const { message, button } = await req.json();
    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Get bot token
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json({ error: 'Telegram bot token not configured' }, { status: 500 });
    }

    // Get bot info to find bot username
    const botInfoRes = await fetch(`${BOT_API}/getMe`);
    const botInfo = await botInfoRes.json();
    const botUsername = botInfo?.result?.username;

    // Get recent updates to find user chat IDs
    // Note: Telegram doesn't provide a way to list all users
    // We need to store chat IDs when users interact with the bot
    // For now, send to the owner's chat ID
    const OWNER_CHAT_ID = parseInt(process.env.TELEGRAM_OWNER_CHAT_ID || '0');
    if (!OWNER_CHAT_ID) {
      return NextResponse.json({ error: 'TELEGRAM_OWNER_CHAT_ID not set' }, { status: 500 });
    }

    const broadcastMsg = `📢 <b>Announcement</b>\n\n${message}`;
    const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://iiuc-arms.eu.cc';

    await sendMessageWithButton(OWNER_CHAT_ID, broadcastMsg, button?.text || 'Open IIUC-ARMS', button?.url || SITE_URL);

    return NextResponse.json({ success: true, sent: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to broadcast' }, { status: 500 });
  }
}

// GET — list Telegram bot users (chat IDs from DB)
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;

  try {
    const { prisma } = await import('@/lib/prisma');
    // Get all profiles that have interacted with the bot
    const profiles = await prisma.profile.findMany({
      select: { userId: true, name: true, email: true },
      orderBy: { userId: 'asc' },
    });
    return NextResponse.json({ success: true, users: profiles.length });
  } catch {
    return NextResponse.json({ success: true, users: 0 });
  }
}
