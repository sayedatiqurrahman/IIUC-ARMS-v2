import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_API;

async function sendTelegramMessage(chatId: string, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  return res.ok;
}

export async function POST(req: NextRequest) {
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({
      where: { userId: email },
      select: { telegramChatId: true },
    });

    if (!profile?.telegramChatId) {
      return NextResponse.json({ error: 'No pending Telegram connection.' }, { status: 400 });
    }

    // Clear all telegram fields
    await prisma.profile.update({
      where: { userId: email },
      data: {
        telegramChatId: null,
        telegramVerified: false,
        telegramOtp: null,
        telegramOtpExpiresAt: null,
      },
    });

    // Notify user in Telegram
    await sendTelegramMessage(
      profile.telegramChatId,
      `❌ <b>Telegram connection cancelled</b>\n\nYour IIUC-ARMS account has been unlinked from this Telegram chat.`
    );

    return NextResponse.json({ success: true, message: 'Telegram connection cancelled.' });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
