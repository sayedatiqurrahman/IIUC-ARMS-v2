import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://arms.iiuc.net';
const INDEXNOW_KEY = process.env.INDEXNOW_KEY || '44ba87290cac4ac1848b483951c7ed27';

const baseUrls = [
  siteUrl,
  `${siteUrl}/contributors`,
  `${siteUrl}/faculty`,
  `${siteUrl}/notices`,
  `${siteUrl}/routine`,
  `${siteUrl}/blog`,
  `${siteUrl}/history`,
  `${siteUrl}/clubs`,
  `${siteUrl}/studio`,
  `${siteUrl}/support`,
];

/**
 * GET /api/indexnow
 * Submits the public URLs to IndexNow + Bing. Vercel Cron can call this daily:
 *   GET /api/indexnow
 * or you can run it manually:
 *   GET /api/indexnow?secret=<CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const querySecret = req.nextUrl.searchParams.get('secret');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, { ok: boolean; status?: number; body?: string }> = {};
  const keyLocation = `${siteUrl}/${INDEXNOW_KEY}.txt`;

  // 1. IndexNow global endpoint
  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: new URL(siteUrl).host,
        key: INDEXNOW_KEY,
        keyLocation,
        urlList: baseUrls,
      }),
    });
    results['api.indexnow.org'] = { ok: res.ok, status: res.status };
  } catch (e: any) {
    results['api.indexnow.org'] = { ok: false, body: e?.message };
  }

  // 2. Bing endpoint (separate submissions, one URL per request is most reliable)
  try {
    const bingRes = await fetch(
      `https://www.bing.com/indexnow?url=${encodeURIComponent(siteUrl)}&key=${INDEXNOW_KEY}`,
      { method: 'GET' },
    );
    results['bing.com/indexnow'] = { ok: bingRes.ok, status: bingRes.status };
  } catch (e: any) {
    results['bing.com/indexnow'] = { ok: false, body: e?.message };
  }

  return NextResponse.json({ success: true, siteUrl, results });
}