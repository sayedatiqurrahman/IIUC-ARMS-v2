import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_API;
const MAX_ACCOUNTS_PER_CHAT = 3;

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
      select: { telegramChatId: true, telegramVerified: true },
    });

    if (!profile?.telegramChatId) {
      return NextResponse.json({
        error: `No /connect request found for this email yet. Send /connect ${email} in @iiuc_arms_bot first, then come back and click Send OTP.`,
      }, { status: 400 });
    }

    if (profile.telegramVerified) {
      return NextResponse.json({ error: 'Telegram is already connected.' }, { status: 400 });
    }

    // One Telegram account can be linked to up to MAX_ACCOUNTS_PER_CHAT profiles
    const linkedCount = await prisma.profile.count({
      where: {
        telegramChatId: profile.telegramChatId,
        telegramVerified: true,
        userId: { not: email },
      },
    });
    if (linkedCount >= MAX_ACCOUNTS_PER_CHAT) {
      return NextResponse.json({
        error: `This Telegram is already connected to ${linkedCount} accounts (max ${MAX_ACCOUNTS_PER_CHAT}). Please contact the manager/admin to increase your limit.`,
      }, { status: 400 });
    }

    // Generate fresh 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await prisma.profile.update({
      where: { userId: email },
      data: { telegramOtp: otp, telegramOtpExpiresAt: expiresAt },
    });

    // Send OTP to user's Telegram
    const sent = await sendTelegramMessage(
      profile.telegramChatId,
      `🔐 <b>IIUC-ARMS Verification</b>\n\nYour verification code:\n\n<code>${otp}</code>\n\nEnter this code in the web app to confirm your Telegram connection.\n\n⏱ Expires in 5 minutes.`
    );

    if (!sent) {
      return NextResponse.json({ error: 'Failed to send OTP to Telegram. Please try again, or contact the manager/admin if the problem continues.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'OTP sent to your Telegram!' });
  } catch {
    return NextResponse.json({ error: 'Server error. Please try again, or contact the manager/admin.' }, { status: 500 });
  }
}
