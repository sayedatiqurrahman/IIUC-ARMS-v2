import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { invalidatePermissionsCache } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  addCourse: ['admin', 'manager', 'teacher', 'cr', 'student', 'user'],
  editCourse: ['admin', 'manager', 'teacher', 'cr'],
  deleteCourse: ['admin', 'manager', 'teacher'],
  uploadFile: ['admin', 'manager', 'teacher', 'cr', 'student'],
  requireGithubForUpload: ['admin', 'manager', 'teacher', 'cr', 'student'],
  editLinks: ['admin', 'manager', 'teacher', 'cr'],
  moveFile: ['admin'],
  copyFile: ['admin'],
  renameFile: ['admin'],
  deleteFile: ['admin'],
  manageFaculty: ['admin', 'manager', 'teacher'],
  publishRoutine: ['admin', 'manager', 'teacher', 'cr'],
  manageUsers: ['admin', 'manager'],
  manageSettings: ['admin'],
};

export async function GET() {
  try {
    const { prisma } = await import('@/lib/prisma');
    const settings = await prisma.siteSettings.findUnique({ where: { id: 'site-settings' } });
    const saved = (settings?.permissions as Record<string, string[]>) || {};
    const permissions: Record<string, string[]> = {};
    for (const key of Object.keys(DEFAULT_PERMISSIONS)) {
      permissions[key] = saved[key] || DEFAULT_PERMISSIONS[key];
    }
    return NextResponse.json({ success: true, permissions });
  } catch {
    return NextResponse.json({ success: true, permissions: DEFAULT_PERMISSIONS });
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
