import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { invalidatePermissionsCache, DEFAULT_PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { getPermissions, getCustomRoles } = await import('@/lib/permissions');
    const permissions = await getPermissions();
    const customRoles = await getCustomRoles();
    let myRole: string | null = null;
    try {
      const email = await getUserEmail(req);
      if (email) {
        const { prisma } = await import('@/lib/prisma');
        const profile = await prisma.profile.findUnique({ where: { userId: email } });
        myRole = profile?.role || null;
      }
    } catch {}
    return NextResponse.json({ success: true, permissions, customRoles, myRole });
  } catch {
    return NextResponse.json({ success: true, permissions: DEFAULT_PERMISSIONS, customRoles: [], myRole: null });
  }
}

export async function PUT(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;

  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    const role = config.getEffectiveRole(email, profile?.role);
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Only admin can change permissions' }, { status: 403 });
    }

    const { permissions } = await req.json();
    if (!permissions || typeof permissions !== 'object') {
      return NextResponse.json({ error: 'permissions object required' }, { status: 400 });
    }

    await prisma.siteSettings.upsert({
      where: { id: 'site-settings' },
      update: { permissions },
      create: { id: 'site-settings', permissions },
    });

    invalidatePermissionsCache();
    return NextResponse.json({ success: true, permissions });
  } catch {
    return NextResponse.json({ error: 'Failed to save permissions' }, { status: 500 });
  }
}
