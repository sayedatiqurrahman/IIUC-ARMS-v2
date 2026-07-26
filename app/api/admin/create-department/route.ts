import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { config } from '@/lib/config';
import { prisma } from '@/lib/prisma';
import { createDepartmentFolders } from '@/lib/github-folders';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.admin);
  if (!rl.success) return rl.response || NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const email = session.user.email;
  const profile = await prisma.profile.findFirst({ where: { email }, select: { role: true } });
  const role = config.getEffectiveRole(email, profile?.role || undefined);

  if (role !== 'admin' && role !== 'teacher' && role !== 'manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { deptId } = await req.json();

    if (!deptId || !/^[a-z]{2,10}$/.test(deptId)) {
      return NextResponse.json({ error: 'Invalid department ID (2-10 lowercase letters)' }, { status: 400 });
    }

    if (config.allDepartmentIds.has(deptId)) {
      return NextResponse.json({ error: 'Department ID already exists in config' }, { status: 400 });
    }

    const result = await createDepartmentFolders(deptId);

    if (result.success) {
      return NextResponse.json({
        success: true,
        created: result.created,
        message: result.created > 0
          ? `Created ${result.created} folders for ${deptId}`
          : `Folders for ${deptId} already exist`,
      });
    } else {
      return NextResponse.json({ error: result.error || 'Failed to create folders' }, { status: 500 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}
