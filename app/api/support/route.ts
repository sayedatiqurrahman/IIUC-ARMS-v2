import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

const BOT_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN || ''}`;

function telegramLink(input: string): string {
  const clean = input.replace(/^@/, '').trim();
  if (/^\+?\d{7,15}$/.test(clean)) {
    const num = clean.startsWith('+') ? clean : `+${clean}`;
    return `https://t.me/${encodeURIComponent(num)}`;
  }
  return `https://t.me/${clean}`;
}

function whatsappLink(input: string): string {
  let clean = input.replace(/[^\d+]/g, '').trim();
  if (clean.startsWith('00')) clean = '+' + clean.slice(2);
  if (!clean.startsWith('+')) {
    // Bare local number without a country code: assume Bangladesh (+880).
    clean = clean.replace(/^0+/, '');
    if (/^1\d{9}$/.test(clean)) clean = '+880' + clean;
    else clean = '+' + clean;
  }
  return `https://wa.me/${clean.slice(1)}`;
}

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

    // Validate that the bot is configured at all, with a clear, actionable message.
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return NextResponse.json({
        error: 'Telegram bot token (TELEGRAM_BOT_TOKEN) is not configured on the server. Add it in the environment/deployment settings.',
      }, { status: 500 });
    }

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
      whatsapp ? `📱 <b>WhatsApp:</b> <a href="${whatsappLink(whatsapp)}">${whatsapp}</a>` : null,
      telegram ? `✈️ <b>Telegram:</b> <a href="${telegramLink(telegram)}">${telegram}</a>` : null,
      ``,
      `📝 <b>Issue:</b>`,
      issue,
      ``,
      `⏰ <b>Time:</b> ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' })}`,
    ].filter(Boolean).join('\n');

    // Build inline keyboard with contact buttons
    const keyboardRows: any[][] = [];

    // Contact row — direct links to message the person
    const contactRow: any[] = [];
    if (whatsapp) {
      contactRow.push({ text: '📱 WhatsApp', url: whatsappLink(whatsapp) });
    }
    if (telegram) {
      contactRow.push({ text: '✈️ Telegram', url: telegramLink(telegram) });
    }
    if (contactRow.length > 0) keyboardRows.push(contactRow);

    // Action row — Accept / Reject / Reply
    keyboardRows.push([
      { text: '✅ Accept', callback_data: `support_accept` },
      { text: '❌ Reject', callback_data: `support_reject` },
    ]);
    keyboardRows.push([
      { text: '💬 Reply in Group', callback_data: `support_reply` },
    ]);

    const keyboard = { inline_keyboard: keyboardRows };

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
      const desc: string = result.description || `Telegram request failed (HTTP ${res.status})`;
      console.error('[Support] Failed to send to Telegram:', desc, '| chat_id:', chatId);
      // Return Telegram's own description to the caller so the root cause is visible.
      return NextResponse.json({
        error: `Failed to send to the support group. Telegram says: ${desc}. Make sure your bot (@${process.env.TELEGRAM_BOT_USERNAME || 'your bot'}) is added as an ADMIN of the support group, and that the chat ID is correct (must be negative, e.g. -1001234567890).`,
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, groupName });
  } catch (err: any) {
    console.error('[Support] Error:', err?.message);
    return NextResponse.json({ error: 'Failed to submit support request ' + (err?.message ? `(${err.message})` : '') }, { status: 500 });
  }
}
