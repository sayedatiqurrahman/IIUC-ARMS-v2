import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { config } from '@/lib/config';
import { hasPermission } from '@/lib/permissions';
import { readClubTheme, writeClubTheme, publishClubTheme, unpublishClubTheme } from '@/lib/club-data';

async function canManageTheme(email: string, slug: string): Promise<boolean> {
  const { prisma } = await import('@/lib/prisma');
  const profile = await prisma.profile.findUnique({ where: { userId: email } });
  const role = config.getEffectiveRole(email, profile?.role);
  if (config.isAdminOrAbove(email, profile?.role)) return true;
  if (config.isManager(email, profile?.role)) return true;
  if (await hasPermission('manageClubMembers', role, false, email)) return true;
  const club = await prisma.club.findUnique({ where: { slug } });
  if (!club) return false;
  const member = await prisma.clubMember.findUnique({ where: { clubId_userId: { clubId: club.id, userId: email } } });
  if (!member) return false;
  return ['gs', 'ags', 'president', 'vice_president'].includes(member.role);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const { slug } = await params;
    const theme = await readClubTheme(slug);
    return NextResponse.json({ theme });
  } catch {
    return NextResponse.json({ error: 'Failed to load theme' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { slug } = await params;
    if (!(await canManageTheme(email, slug))) {
      return NextResponse.json({ error: 'Not authorized to manage theme' }, { status: 403 });
    }

    const body = await req.json();
    const { theme, action } = body;

    if (action === 'publish' && theme) {
      const ok = await publishClubTheme(slug, theme);
      return NextResponse.json({ success: ok });
    }

    if (action === 'unpublish') {
      const ok = await unpublishClubTheme(slug);
      return NextResponse.json({ success: ok });
    }

    if (action === 'reset') {
      const { DEFAULT_THEME } = await import('@/lib/cert-theme');
      const ok = await writeClubTheme(slug, DEFAULT_THEME);
      return NextResponse.json({ success: ok, theme: DEFAULT_THEME });
    }

    if (theme) {
      const ok = await writeClubTheme(slug, theme);
      return NextResponse.json({ success: ok });
    }

    return NextResponse.json({ error: 'theme or action required' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Failed to save theme' }, { status: 500 });
  }
}
