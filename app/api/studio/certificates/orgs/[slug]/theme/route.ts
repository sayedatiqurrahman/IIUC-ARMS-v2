import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { readClubTheme, writeClubTheme } from '@/lib/club-data';
import { DEFAULT_THEME } from '@/lib/cert-theme';

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const { slug } = await params;
    const theme = await readClubTheme(slug);
    return NextResponse.json({ theme: theme || DEFAULT_THEME });
  } catch {
    return NextResponse.json({ theme: DEFAULT_THEME });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { slug } = await params;
    const { prisma } = await import('@/lib/prisma');
    const org = await prisma.studioOrganization.findUnique({ where: { slug } });
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    if (org.createdBy !== email) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const { theme } = await req.json();
    if (!theme) return NextResponse.json({ error: 'theme required' }, { status: 400 });

    const ok = await writeClubTheme(slug, theme);
    return NextResponse.json({ success: ok });
  } catch {
    return NextResponse.json({ error: 'Failed to save theme' }, { status: 500 });
  }
}
