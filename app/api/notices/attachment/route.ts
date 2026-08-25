import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export const maxDuration = 30;

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;

  const raw = req.nextUrl.searchParams.get('url') || '';
  if (!raw.includes('raw.githubusercontent.com') || raw.length > 2048) {
    return new NextResponse('Invalid URL', { status: 403 });
  }

  const ext = raw.split('.').pop()?.toLowerCase() || '';
  const ct = MIME[ext] || 'application/octet-stream';
  const fname = decodeURIComponent(raw.split('/').pop() || 'file')
    .replace(/["\\]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '');

  try {
    const res = await fetch(raw, { cache: 'no-store', redirect: 'follow' });
    if (!res.ok) {
      return new NextResponse(`Not found (${res.status})`, { status: 404 });
    }
    const buf = await res.arrayBuffer();
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': ct,
        'Content-Length': String(buf.byteLength),
        'Content-Disposition': `inline; filename="${fname}"`,
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    });
  } catch {
    return new NextResponse('Failed to fetch', { status: 502 });
  }
}
