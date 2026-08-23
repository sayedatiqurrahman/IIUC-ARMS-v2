import { NextRequest, NextResponse } from 'next/server';
import { removeExpiredNotices } from '@/lib/notices';

/** POST /api/notices/cleanup — remove expired notices from the index. */
export async function POST(req: NextRequest) {
  // Only allow from cron or admin
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET || process.env.NOTICES_CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const token = process.env.GITHUB_TOKEN || '';
    if (!token) return NextResponse.json({ error: 'No GitHub token configured' }, { status: 500 });

    const removed = await removeExpiredNotices(token, { name: 'IIUC-ARMS Cron', email: 'bot@iiuc-arms.eu.cc' });
    return NextResponse.json({ success: true, removed });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Cleanup failed' }, { status: 500 });
  }
}
