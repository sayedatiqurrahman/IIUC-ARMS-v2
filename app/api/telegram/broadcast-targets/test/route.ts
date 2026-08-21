import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.admin);
  if (!rl.success) return rl.response!;

  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const isOwner = config.ownerEmails.includes(email.toLowerCase());
    const role = config.getEffectiveRole(email);
    if (!isOwner && role !== 'admin') {
      return NextResponse.json({ error: 'Only admin/owner can test' }, { status: 403 });
    }

    const { chatId } = await req.json();
    if (!chatId?.trim()) {
      return NextResponse.json({ error: 'chatId required' }, { status: 400 });
    }

    const { sendMessage } = await import('@/lib/telegram/api');
    const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://iiuc-arms.eu.cc';

    const text = [
      '✅ <b>IIUC-ARMS Broadcast Test</b>',
      '',
      'This is a test message from your broadcast target configuration.',
      `Sent by: <b>${email}</b>`,
      `Time: <b>${new Date().toISOString()}</b>`,
      '',
      `🌐 <a href="${SITE_URL}">Open IIUC-ARMS</a>`,
    ].join('\n');

    const res = await sendMessage(chatId.trim(), text, { disable_web_page_preview: true });
    const body = await res.json();

    if (!body.ok) {
      return NextResponse.json({ success: false, error: body.description || 'Failed to send' }, { status: 500 });
    }

    return NextResponse.json({ success: true, messageId: body.result?.message_id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Test failed' }, { status: 500 });
  }
}
