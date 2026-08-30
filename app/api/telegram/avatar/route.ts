import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

// GET /api/telegram/avatar — resolve the logged-in user's Telegram profile
// photo (stored as a Telegram file_id) into a direct image URL.
export async function GET(req: NextRequest) {
  const email = await getUserEmail(req);
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { prisma } = await import('@/lib/prisma');
  const profile = await prisma.profile.findUnique({ where: { userId: email } });
  const role = config.getEffectiveRole(email, profile?.role);
  const fileId = req.nextUrl.searchParams.get('file_id') || '';

  // Anyone may fetch their own stored avatar; admins/managers may fetch any
  // user's avatar (used in admin connection lists).
  if (fileId && fileId !== (profile?.telegramAvatar || '')) {
    if (!config.ownerEmails.includes(email) && role !== 'admin' && role !== 'manager') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const id = fileId || profile?.telegramAvatar || '';
  if (!id || !BOT_TOKEN) return NextResponse.json({ error: 'No avatar configured' }, { status: 404 });

  try {
    const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: id }),
    });
    const fileData = await fileRes.json();
    if (!fileData.ok || !fileData.result?.file_path) {
      return NextResponse.json({ error: 'Could not resolve avatar' }, { status: 404 });
    }
    return NextResponse.json({
      url: `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`,
      expiresIn: fileData.result?.file_size ? undefined : undefined,
    });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}