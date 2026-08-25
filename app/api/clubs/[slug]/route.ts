import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { config } from '@/lib/config';
import { hasPermission } from '@/lib/permissions';

async function isClubOfficer(email: string, clubId: string): Promise<{ allowed: boolean; role?: string }> {
  const { prisma } = await import('@/lib/prisma');
  const member = await prisma.clubMember.findUnique({ where: { clubId_userId: { clubId, userId: email } } });
  if (!member) return { allowed: false };
  const officerRoles = ['gs', 'ags', 'ogs', 'office_secretary'];
  return { allowed: officerRoles.includes(member.role), role: member.role };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rl = rateLimit(_req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const { slug } = await params;
    if (!slug) return NextResponse.json({ error: 'Club not found' }, { status: 404 });
    const { prisma } = await import('@/lib/prisma');
    const club = await prisma.club.findUnique({
      where: { slug },
      include: {
        members: { orderBy: { createdAt: 'asc' } },
        events: { orderBy: { eventDate: 'desc' }, take: 20 },
        _count: { select: { members: true, events: true, certificates: true } },
      },
    });
    if (!club) return NextResponse.json({ error: 'Club not found' }, { status: 404 });
    return NextResponse.json({ club });
  } catch {
    return NextResponse.json({ error: 'Club not found' }, { status: 404 });
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
    const club = await prisma.club.findUnique({ where: { slug } });
    if (!club) return NextResponse.json({ error: 'Club not found' }, { status: 404 });

    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    const role = config.getEffectiveRole(email, profile?.role);
    const isAdmin = config.isAdminOrAbove(email, profile?.role);
    const isManager = config.isManager(email, profile?.role);
    const hasManageAll = await hasPermission('manageAllClubs', role, false, email);
    const { allowed: isOfficer } = await isClubOfficer(email, club.id);

    if (!isAdmin && !isManager && !hasManageAll && !isOfficer) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = await req.json();
    const data: any = {};
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.description !== undefined) data.description = body.description || null;
    if (body.logoUrl !== undefined) data.logoUrl = body.logoUrl || null;
    if (body.coverUrl !== undefined) data.coverUrl = body.coverUrl || null;
    if (body.settings !== undefined) data.settings = body.settings || null;
    if (body.isActive !== undefined && (isAdmin || isManager || hasManageAll)) data.isActive = body.isActive;

    if (body.department !== undefined && body.department !== club.department) {
      if (!isAdmin && !isManager && !hasManageAll) {
        return NextResponse.json({ error: 'Only admins/managers can change club department' }, { status: 403 });
      }
      data.department = body.department;
    }

    const updated = await prisma.club.update({ where: { id: club.id }, data });
    return NextResponse.json({ success: true, club: updated });
  } catch {
    return NextResponse.json({ error: 'Failed to update club' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { slug } = await params;
    const { prisma } = await import('@/lib/prisma');
    const club = await prisma.club.findUnique({ where: { slug } });
    if (!club) return NextResponse.json({ error: 'Club not found' }, { status: 404 });

    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    const role = config.getEffectiveRole(email, profile?.role);
    const isAdmin = config.isAdminOrAbove(email, profile?.role);
    const isManager = config.isManager(email, profile?.role);
    const hasManageAll = await hasPermission('manageAllClubs', role, false, email);

    if (!isAdmin && !isManager && !hasManageAll) {
      return NextResponse.json({ error: 'Only admins/managers can delete clubs' }, { status: 403 });
    }

    await prisma.clubCertificate.deleteMany({ where: { clubId: club.id } });
    await prisma.clubEvent.deleteMany({ where: { clubId: club.id } });
    await prisma.clubMember.deleteMany({ where: { clubId: club.id } });
    await prisma.club.delete({ where: { id: club.id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete club' }, { status: 500 });
  }
}
