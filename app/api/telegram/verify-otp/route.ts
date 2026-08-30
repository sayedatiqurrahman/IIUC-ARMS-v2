import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_API;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://iiuc-arms.eu.cc';
const CONNECTIONS_URL = `${SITE_URL}/dashboard?tab=github`;

async function sendTelegramMessage(chatId: string, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  return res.ok;
}

async function fetchTelegramProfile(chatId: string): Promise<{ name: string; username: string; avatar: string }> {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId }),
  }).catch(() => null);
  if (!res) return { name: '', username: '', avatar: '' };
  const data = await res.json().catch(() => null);
  if (!data?.ok) return { name: '', username: '', avatar: '' };
  const c = data.result || {};
  const first = c.first_name || '';
  const last = c.last_name || '';
  const name = [first, last].filter(Boolean).join(' ') || c.username || '';
  return {
    name,
    username: (c.username || '') as string,
    avatar: (c.photo?.big_file_id || c.photo?.small_file_id || '') as string,
  };
}

export async function POST(req: NextRequest) {
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { code } = body;
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'Verification code required' }, { status: 400 });
    }

    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({
      where: { userId: email },
      select: { telegramChatId: true, telegramVerified: true, telegramOtp: true, telegramOtpExpiresAt: true },
    });

    if (!profile?.telegramChatId) {
      return NextResponse.json({ error: 'No pending Telegram connection.' }, { status: 400 });
    }

    if (profile.telegramVerified) {
      return NextResponse.json({ error: 'Telegram is already connected.' }, { status: 400 });
    }

    if (!profile.telegramOtp || !profile.telegramOtpExpiresAt) {
      return NextResponse.json({ error: 'No OTP found. Please request a new one.' }, { status: 400 });
    }

    if (new Date() > profile.telegramOtpExpiresAt) {
      return NextResponse.json({ error: 'OTP expired. Please request a new one.' }, { status: 400 });
    }

    if (code !== profile.telegramOtp) {
      return NextResponse.json({ error: 'Invalid code. Please try again.' }, { status: 400 });
    }

    // OTP verified — confirm Telegram connection
    const { name: tgName, username: tgUsername, avatar: tgAvatar } = await fetchTelegramProfile(profile.telegramChatId);

    await prisma.profile.update({
      where: { userId: email },
      data: {
        telegramVerified: true,
        telegramOtp: null,
        telegramOtpExpiresAt: null,
        ...(tgName ? { telegramName: tgName } : {}),
        ...(tgUsername ? { telegramId: tgUsername } : {}),
        ...(tgAvatar ? { telegramAvatar: tgAvatar } : {}),
      },
    });

    // Notify user in Telegram
    await sendTelegramMessage(
      profile.telegramChatId,
      `✅ <b>Telegram connected!</b>\n\nYour IIUC-ARMS account (<code>${email}</code>) is now linked.\n\n` +
      `You'll see your <a href="${CONNECTIONS_URL}">connected Telegram profile</a> in\nthe web app → Dashboard → Connections.\n\n` +
      `🔔 You will receive notifications here.`
    );

    return NextResponse.json({ success: true, message: 'Telegram connected successfully!' });
  } catch {
    return NextResponse.json({ error: 'Server error. Please try again, or contact the manager/admin.' }, { status: 500 });
  }
}
