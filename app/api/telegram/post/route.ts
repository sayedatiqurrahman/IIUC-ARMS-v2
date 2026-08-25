import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

const BOT_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN || ''}`;

interface PostingChannel {
  id: string;
  name: string;
  chatId: string;
  type: 'channel' | 'group';
  autoPost?: boolean;
  categories?: string[];
}

async function getPostingChannels(): Promise<PostingChannel[]> {
  try {
    const { prisma } = await import('@/lib/prisma');
    const settings = await prisma.siteSettings.findUnique({ where: { id: 'site-settings' } });
    const raw = (settings as any)?.postingChannels;
    if (!raw) return [];
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return [];
  }
}

interface PostRequest {
  title: string;
  content: string;
  type: 'notice' | 'blog' | 'tutorial' | 'routine';
  url?: string;
  image?: string;
  category?: string;
  channels?: string[];
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.admin);
  if (!rl.success) return rl.response!;

  try {
    const body: PostRequest = await req.json();
    const { title, content, type, url, image, category, channels } = body;

    if (!title?.trim() || !content?.trim()) {
      return NextResponse.json({ error: 'Title and content required' }, { status: 400 });
    }

    const allChannels = await getPostingChannels();
    if (allChannels.length === 0) {
      return NextResponse.json({ error: 'No posting channels configured' }, { status: 400 });
    }

    const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://iiuc-arms.eu.cc';

    // Determine which channels to post to
    let targetChannels = allChannels.filter(c => c.autoPost);
    if (channels && channels.length > 0) {
      targetChannels = allChannels.filter(c => channels.includes(c.chatId));
    }

    // Filter by category if specified
    if (category) {
      targetChannels = targetChannels.filter(c => !c.categories?.length || c.categories.includes(category));
    }

    const typeEmoji: Record<string, string> = {
      notice: '📢',
      blog: '📝',
      tutorial: '📚',
      routine: '📅',
    };

    const results: { chatId: string; name: string; ok: boolean; error?: string }[] = [];

    for (const ch of targetChannels) {
      const emoji = typeEmoji[type] || '📌';
      const text = [
        `${emoji} <b>${title}</b>`,
        ``,
        content.length > 1500 ? content.substring(0, 1500) + '...' : content,
        url ? `` : null,
        url ? `🔗 <a href="${url}">View on IIUC-ARMS</a>` : null,
      ].filter(Boolean).join('\n');

      try {
        if (image) {
          // Send as photo with caption
          const res = await fetch(`${BOT_API}/sendPhoto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: ch.chatId,
              photo: image,
              caption: text,
              parse_mode: 'HTML',
              disable_web_page_preview: true,
            }),
          });
          const data = await res.json();
          results.push({ chatId: ch.chatId, name: ch.name, ok: data.ok, error: data.description });
        } else {
          const res = await fetch(`${BOT_API}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: ch.chatId,
              text,
              parse_mode: 'HTML',
              disable_web_page_preview: true,
            }),
          });
          const data = await res.json();
          results.push({ chatId: ch.chatId, name: ch.name, ok: data.ok, error: data.description });
        }
      } catch (err: any) {
        results.push({ chatId: ch.chatId, name: ch.name, ok: false, error: err?.message });
      }
    }

    const successCount = results.filter(r => r.ok).length;
    const failCount = results.filter(r => !r.ok).length;

    return NextResponse.json({
      success: successCount > 0,
      posted: successCount,
      failed: failCount,
      results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to post' }, { status: 500 });
  }
}
