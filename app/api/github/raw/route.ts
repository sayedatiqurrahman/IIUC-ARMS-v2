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

// GitHub's contents API serves raw bytes when asked with this Accept header.
// Used as a fallback host when raw.githubusercontent.com is unreachable or
// throttled on the server's network.
const CONTENTS_API = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/`;

function looksLikePdf(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 5) return false;
  const head = new Uint8Array(buf.slice(0, 5));
  return head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46 && head[4] === 0x2d; // %PDF-
}

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

  const relIdx = clean.indexOf(config.uploadPath + '/');
  const relPath = relIdx >= 0 ? clean.slice(relIdx) : '';

  let buf: ArrayBuffer | null = null;
  let ct = MIME[ext] || 'application/octet-stream';
  let failCode = 502;

  // Primary upstream: raw.githubusercontent.com
  try {
    const res = await fetch(raw, { cache: 'no-store', redirect: 'follow' });
    if (res.ok) {
      const body = await res.arrayBuffer();
      if (ext !== 'pdf' || looksLikePdf(body)) {
        buf = body;
        if (!MIME[ext]) ct = res.headers.get('content-type') || ct;
      }
    } else {
      failCode = res.status;
    }
  } catch {
    /* fall through to the contents API */
  }

  // Fallback upstream: contents API — different host, survives raw being
  // blocked/throttled, and also covers a truncated/invalid PDF from raw.
  if (buf === null && relPath) {
    try {
      const alt = await fetch(`${CONTENTS_API}${relPath}`, {
        headers: { Accept: 'application/vnd.github.raw', 'User-Agent': 'QSIS-ARMS-v2' },
        cache: 'no-store',
        redirect: 'follow',
      });
      if (alt.ok) {
        buf = await alt.arrayBuffer();
        if (!MIME[ext]) ct = alt.headers.get('content-type') || ct;
      } else if (failCode === 502) {
        failCode = alt.status;
      }
    } catch {
      /* give up */
    }
  }

  if (buf === null) {
    return new NextResponse(`File not found (${failCode})`, { status: 404 });
  }

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': ct,
      'Content-Length': String(buf.byteLength),
      'Content-Disposition': `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fname)}`,
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}
