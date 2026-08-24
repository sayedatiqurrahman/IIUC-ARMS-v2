import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { config } from '@/lib/config';
import { hasPermission } from '@/lib/permissions';

const SINGLETON_ROLES = ['president', 'vice_president', 'advisor', 'gs', 'ags', 'ogs', 'treasurer', 'finance', 'it_media', 'cultural', 'publication', 'office_secretary'];

async function getClubAndRole(email: string, slug: string) {
  const { prisma } = await import('@/lib/prisma');
  const club = await prisma.club.findUnique({ where: { slug } });
  if (!club) return { club: null, memberRole: null, isAdmin: false, isManager: false, hasPerm: false };
  const profile = await prisma.profile.findUnique({ where: { userId: email } });
  const role = config.getEffectiveRole(email, profile?.role);
  const isAdmin = config.isAdminOrAbove(email, profile?.role);
  const isManager = config.isManager(email, profile?.role);
  const hasPerm = await hasPermission('manageClubMembers', role, false, email);
  const membership = await prisma.clubMember.findUnique({ where: { clubId_userId: { clubId: club.id, userId: email } } });
  return { club, memberRole: membership?.role || null, isAdmin, isManager, hasPerm };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rl = rateLimit(_req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const { slug } = await params;
    const { prisma } = await import('@/lib/prisma');
    const club = await prisma.club.findUnique({ where: { slug } });
    if (!club) return NextResponse.json({ error: 'Club not found' }, { status: 404 });
    const members = await prisma.clubMember.findMany({
      where: { clubId: club.id },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });
    return NextResponse.json({ members });
  } catch {
    return NextResponse.json({ error: 'Failed to load members' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { slug } = await params;
    const { club, memberRole, isAdmin, isManager, hasPerm } = await getClubAndRole(email, slug);
    if (!club) return NextResponse.json({ error: 'Club not found' }, { status: 404 });

    const body = await req.json();
    const { userId, role } = body;
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

    const validRoles = ['gs', 'ags', 'ogs', 'office_secretary', 'member'];
    const assignedRole = validRoles.includes(role) ? role : 'member';

    const canManage = isAdmin || isManager || hasPerm || memberRole === 'gs';
    const canAssignOfficer = isAdmin || isManager || hasPerm || memberRole === 'gs';
    const isOfficerRole = ['gs', 'ags', 'ogs', 'office_secretary'].includes(assignedRole);
    if (isOfficerRole && !canAssignOfficer) {
      return NextResponse.json({ error: 'Only GS, admin, or manager can assign officer roles' }, { status: 403 });
    }
    if (!isOfficerRole && !canManage && memberRole !== 'ogs' && memberRole !== 'ags') {
      return NextResponse.json({ error: 'Not authorized to add members' }, { status: 403 });
    }

    const { prisma } = await import('@/lib/prisma');
    const member = await prisma.clubMember.upsert({
      where: { clubId_userId: { clubId: club.id, userId } },
      update: { role: assignedRole, assignedBy: email },
      create: { clubId: club.id, userId, role: assignedRole, assignedBy: email },
    });

    return NextResponse.json({ success: true, member });
  } catch {
    return NextResponse.json({ error: 'Failed to add member' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { slug } = await params;
    const { club, memberRole, isAdmin, isManager, hasPerm } = await getClubAndRole(email, slug);
    if (!club) return NextResponse.json({ error: 'Club not found' }, { status: 404 });

    const canManage = isAdmin || isManager || hasPerm || memberRole === 'gs';
    if (!canManage) {
      return NextResponse.json({ error: 'Not authorized to change roles' }, { status: 403 });
    }

    const body = await req.json();
    const { userId, role: newRole, session } = body;
    if (!userId || !newRole) return NextResponse.json({ error: 'userId and role required' }, { status: 400 });

    const allValidRoles = [...SINGLETON_ROLES, 'member'];
    if (!allValidRoles.includes(newRole)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const isOfficerRole = SINGLETON_ROLES.includes(newRole);
    const canAssignOfficer = isAdmin || isManager || hasPerm || memberRole === 'gs';
    if (isOfficerRole && !canAssignOfficer) {
      return NextResponse.json({ error: 'Only GS, admin, or manager can assign officer roles' }, { status: 403 });
    }

    const { prisma } = await import('@/lib/prisma');

    const sessionLabel = session || `Session ${new Date().getFullYear()}`;

    if (SINGLETON_ROLES.includes(newRole)) {
      const existing = await prisma.clubMember.findFirst({
        where: { clubId: club.id, role: newRole, NOT: { userId } },
      });
      if (existing) {
        await prisma.clubMember.update({
          where: { id: existing.id },
          data: {
            role: 'member',
            previousRole: newRole,
            previousRoleSession: sessionLabel,
            assignedBy: email,
          },
        });
      }
    }

    const member = await prisma.clubMember.upsert({
      where: { clubId_userId: { clubId: club.id, userId } },
      update: { role: newRole, assignedBy: email },
      create: { clubId: club.id, userId, role: newRole, assignedBy: email },
    });

    return NextResponse.json({ success: true, member });
  } catch {
    return NextResponse.json({ error: 'Failed to update role' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { slug } = await params;
    const { club, memberRole, isAdmin, isManager, hasPerm } = await getClubAndRole(email, slug);
    if (!club) return NextResponse.json({ error: 'Club not found' }, { status: 404 });

    const body = await req.json();
    const { userId } = body;
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

    if (!isAdmin && !isManager && !hasPerm && memberRole !== 'gs') {
      return NextResponse.json({ error: 'Only GS, admin, or manager can remove members' }, { status: 403 });
    }

    const { prisma } = await import('@/lib/prisma');
    await prisma.clubMember.deleteMany({ where: { clubId: club.id, userId } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 });
  }
}
