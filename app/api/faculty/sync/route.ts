import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { config } from '@/lib/config';
import { canManageFaculty } from '@/lib/can-manage-faculty';

/**
 * POST /api/faculty/sync — Push all faculty data to GitHub data repo
 * Creates/updates faculty_members/<department>.json files.
 * Admin-only.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.admin);
  if (!rl.success) return rl.response!;

  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const role = config.getEffectiveRole(email, undefined);
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const { seedFacultyToGithub } = await import('@/lib/faculty-data');

    const allMembers = await prisma.facultyMember.findMany({
      orderBy: [{ department: 'asc' }, { sortOrder: 'asc' }],
    });

    const members = allMembers.map(m => ({
      department: m.department,
      name: m.name,
      title: m.title || undefined,
      email: m.email || undefined,
      phone: m.phone || undefined,
      shortForm: m.shortForm || undefined,
      memberType: m.memberType,
      claimedBy: m.claimedBy || undefined,
      id: m.id,
      sortOrder: m.sortOrder,
      isCR: m.isCR || false,
      isVisible: m.isVisible || false,
    }));

    const result = await seedFacultyToGithub(members as any);

    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Sync failed' }, { status: 500 });
  }
}
