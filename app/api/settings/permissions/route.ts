import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { invalidatePermissionsCache } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET() {
  const DEFAULT_PERMISSIONS: Record<string, string[]> = {
    addCourse: ['admin', 'manager', 'teacher', 'cr', 'student', 'user'],
    editCourse: ['admin', 'manager', 'teacher', 'cr'],
    deleteCourse: ['admin', 'manager', 'teacher'],
    uploadFile: ['admin', 'manager', 'teacher', 'cr', 'student'],
    requireGithubForUpload: ['admin', 'manager', 'teacher', 'cr', 'student'],
    manageFaculty: ['admin', 'manager', 'teacher'],
    publishRoutine: ['admin', 'manager', 'teacher', 'cr'],
    manageUsers: ['admin', 'manager'],
    manageSettings: ['admin'],
  };
  try {
    const settings = await prisma.siteSettings.findUnique({ where: { id: 'site-settings' } });
    const permissions = (settings?.permissions as Record<string, string[]>) || DEFAULT_PERMISSIONS;
    return NextResponse.json({ success: true, permissions });
  } catch {
    return NextResponse.json({ success: true, permissions: DEFAULT_PERMISSIONS });
  }
}

export async function PUT(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;

  const email = await getUserEmail(req);
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await prisma.profile.findUnique({ where: { userId: email } });
  const role = config.getEffectiveRole(email, profile?.role);
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Only admin can change permissions' }, { status: 403 });
  }

  try {
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
