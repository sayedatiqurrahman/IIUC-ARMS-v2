import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { listPublishedThemes } from '@/lib/club-data';
import { THEME_PRESETS } from '@/lib/cert-theme';

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const published = await listPublishedThemes();
    const allThemes = [...THEME_PRESETS, ...published.filter(p => !THEME_PRESETS.some(s => s.name === p.name))];
    return NextResponse.json({ themes: allThemes });
  } catch {
    return NextResponse.json({ themes: THEME_PRESETS });
  }
}
