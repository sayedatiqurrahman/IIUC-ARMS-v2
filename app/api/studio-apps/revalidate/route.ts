import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { getUserEmail } from '@/lib/get-user';
import { STUDIO_APP_FILES_CACHE_TAG, STUDIO_REGISTRY_CACHE_TAG } from '@/lib/studio-apps';

export const maxDuration = 30;

// Studio app commits now happen DIRECTLY from the browser to GitHub, so the
// server can't revalidate the caches inside the same request anymore. This tiny
// endpoint is called by the client right after a successful publish to drop the
// 60s registry / 10-min file caches so the app appears immediately. It only
// purges tags — it never reads or writes GitHub, so no token is needed.
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;

  try {
    const email = await getUserEmail(req);
    if (!email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    revalidateTag(STUDIO_REGISTRY_CACHE_TAG);
    revalidateTag(STUDIO_APP_FILES_CACHE_TAG);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[studio revalidate] error:', e?.message || e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
