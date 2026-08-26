import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

const BOT_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN || ''}`;

interface SupportConfig {
  maleChatId?: string;
  femaleChatId?: string;
  maleGroupName?: string;
  femaleGroupName?: string;
  enabled?: boolean;
}

async function getSupportConfig(): Promise<SupportConfig> {
  try {
    const { prisma } = await import('@/lib/prisma');
    const p = prisma as any;
    // Use raw SQL to avoid schema mismatch if columns are missing
    const rows = await p.$queryRawUnsafe(`SELECT supportConfig FROM SiteSettings WHERE id = 'site-settings'`);
    const raw = (rows as any[])[0]?.supportConfig;
    if (!raw) return {};
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return {};
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;

  try {
    const body = await req.json();
    const { name, universityId, department, gender, issue, whatsapp, telegram } = body;

    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    if (!gender || !['male', 'female'].includes(gender)) return NextResponse.json({ error: 'Gender is required' }, { status: 400 });
    if (!issue?.trim()) return NextResponse.json({ error: 'Issue description is required' }, { status: 400 });

    const config = await getSupportConfig();
    if (!config.enabled) {
      return NextResponse.json({ error: 'Support system is currently disabled' }, { status: 503 });
    }

    const chatId = gender === 'male' ? config.maleChatId : config.femaleChatId;
    if (!chatId) {
      return NextResponse.json({ error: `${gender === 'male' ? 'Male' : 'Female'} support group is not configured` }, { status: 500 });
    }

    const groupName = gender === 'male' ? (config.maleGroupName || 'Male Support Group') : (config.femaleGroupName || 'Female Support Group');
    const genderEmoji = gender === 'male' ? '👨' : '👩';

    const message = [
      `🆘 <b>New Support Request</b>`,
      ``,
      `${genderEmoji} <b>Gender:</b> ${gender === 'male' ? 'Male' : 'Female'}`,
      `👤 <b>Name:</b> ${name}`,
      universityId ? `🆔 <b>ID:</b> ${universityId}` : null,
      department ? `🏫 <b>Department:</b> ${department}` : null,
      whatsapp ? `📱 <b>WhatsApp:</b> ${whatsapp}` : null,
      telegram ? `✈️ <b>Telegram:</b> ${telegram}` : null,
      ``,
      `📝 <b>Issue:</b>`,
      issue,
      ``,
      `⏰ <b>Time:</b> ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' })}`,
    ].filter(Boolean).join('\n');

    const keyboard = {
      inline_keyboard: [
        [
          { text: '✅ Accept', callback_data: `support_accept` },
          { text: '❌ Reject', callback_data: `support_reject` },
        ],
        [
          { text: '💬 Reply in Group', callback_data: `support_reply` },
        ],
      ],
    };

    const res = await fetch(`${BOT_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: keyboard,
      }),
    });

    const result = await res.json();
    if (!result.ok) {
      console.error('[Support] Failed to send to Telegram:', result.description);
      return NextResponse.json({ error: 'Failed to send support request' }, { status: 500 });
    }

    return NextResponse.json({ success: true, groupName });
  } catch (err: any) {
    console.error('[Support] Error:', err?.message);
    return NextResponse.json({ error: 'Failed to submit support request' }, { status: 500 });
  }
}
