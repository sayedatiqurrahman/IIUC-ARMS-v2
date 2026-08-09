import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export const maxDuration = 60;

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
  csv: 'text/csv',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

// GitHub's raw.githubusercontent.com serves files with Content-Disposition:
// attachment, which makes browsers DOWNLOAD them instead of rendering inside an
// <iframe>. This endpoint re-streams the file bytes with Content-Disposition:
// inline + the correct Content-Type so iframes (browser PDF viewer, Microsoft
// Office embed) render the file normally. Only serves files from our own repo
// path, so it can't be abused as an open proxy.
const RAW_PREFIX = `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.branch}/${config.uploadPath}/`;

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;

  const raw = req.nextUrl.searchParams.get('url') || '';
  if (!raw.startsWith(RAW_PREFIX) || raw.length > 2048) {
    return new NextResponse('Invalid file url', { status: 403 });
  }

  const clean = raw.split('?')[0].split('#')[0];
  const ext = clean.split('.').pop()?.toLowerCase() || '';
  const fname = decodeURIComponent(clean.split('/').pop() || 'file')
    .replace(/["\\]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '');
  const asciiName = fname.replace(/[^\x20-\x7E]/g, '_') || 'file';

  try {
    const res = await fetch(raw, { cache: 'no-store', redirect: 'follow' });
    if (!res.ok) {
      return new NextResponse(`File not found (${res.status})`, { status: 404 });
    }
    const buf = await res.arrayBuffer();
    const ct = MIME[ext] || res.headers.get('content-type') || 'application/octet-stream';
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': ct,
        'Content-Disposition': `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fname)}`,
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    });
  } catch (e: any) {
    return new NextResponse('Failed to fetch file', { status: 502 });
  }
}
