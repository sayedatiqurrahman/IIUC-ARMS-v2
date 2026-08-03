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
    await prisma.profile.update({
      where: { userId: email },
      data: {
        telegramVerified: true,
        telegramOtp: null,
        telegramOtpExpiresAt: null,
      },
    });

    // Notify user in Telegram
    await sendTelegramMessage(
      profile.telegramChatId,
      `✅ <b>Telegram connected!</b>\n\nYour IIUC-ARMS account (<code>${email}</code>) is now linked.\n\nYou will receive notifications here.`
    );

    return NextResponse.json({ success: true, message: 'Telegram connected successfully!' });
  } catch {
    return NextResponse.json({ error: 'Server error. Please try again, or contact the manager/admin.' }, { status: 500 });
  }
}
