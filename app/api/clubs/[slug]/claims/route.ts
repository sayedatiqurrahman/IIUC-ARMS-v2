import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { config } from '@/lib/config';
import { hasPermission } from '@/lib/permissions';

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
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
    const hasPerm = await hasPermission('manageClubMembers', role, false, email);

    const membership = await prisma.clubMember.findUnique({ where: { clubId_userId: { clubId: club.id, userId: email } } });
    const isOfficer = membership && ['gs', 'ags', 'ogs', 'office_secretary'].includes(membership.role);

    if (!isAdmin && !isManager && !hasPerm && !isOfficer) {
      const ownClaim = await prisma.clubClaim.findUnique({ where: { clubId_userId: { clubId: club.id, userId: email } } });
      return NextResponse.json({ claims: ownClaim ? [ownClaim] : [] });
    }

    const url = new URL(req.url);
    const status = url.searchParams.get('status') || 'pending';
    const where: any = { clubId: club.id };
    if (status !== 'all') where.status = status;

    const claims = await prisma.clubClaim.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const claimUserIds = Array.from(new Set(claims.map((c: any) => c.userId)));
    const profiles = claimUserIds.length > 0
      ? await prisma.profile.findMany({
          where: { userId: { in: claimUserIds } },
          select: { userId: true, name: true, image: true, githubAvatar: true, department: true, whatsapp: true, semester: true },
        })
      : [];
    const profileMap = new Map(profiles.map((p: any) => [p.userId, p]));

    const enriched = claims.map((c: any) => {
      const p = profileMap.get(c.userId);
      return {
        ...c,
        profileName: p?.name || null,
        profileImage: p?.githubAvatar || p?.image || null,
        profileDepartment: p?.department || null,
        profileWhatsapp: p?.whatsapp || null,
        profileSemester: p?.semester || null,
      };
    });

    return NextResponse.json({ claims: enriched });
  } catch {
    return NextResponse.json({ error: 'Failed to load claims' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { slug } = await params;
    const { prisma } = await import('@/lib/prisma');
    const club = await prisma.club.findUnique({ where: { slug } });
    if (!club) return NextResponse.json({ error: 'Club not found' }, { status: 404 });

    const existingMember = await prisma.clubMember.findUnique({ where: { clubId_userId: { clubId: club.id, userId: email } } });
    if (existingMember) {
      return NextResponse.json({ error: 'You are already a member of this club' }, { status: 409 });
    }

    const existingClaim = await prisma.clubClaim.findUnique({ where: { clubId_userId: { clubId: club.id, userId: email } } });
    if (existingClaim && existingClaim.status === 'pending') {
      return NextResponse.json({ error: 'You already have a pending claim for this club' }, { status: 409 });
    }
    if (existingClaim && existingClaim.status === 'rejected') {
      await prisma.clubClaim.delete({ where: { id: existingClaim.id } });
    }

    const body = await req.json();
    const { requestedRole, message } = body;

    const claim = await prisma.clubClaim.create({
      data: {
        clubId: club.id,
        userId: email,
        requestedRole: requestedRole || 'member',
        message: message || null,
      },
    });

    return NextResponse.json({ success: true, claim });
  } catch {
    return NextResponse.json({ error: 'Failed to submit claim' }, { status: 500 });
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
    const hasPerm = await hasPermission('manageClubMembers', role, false, email);
    const membership = await prisma.clubMember.findUnique({ where: { clubId_userId: { clubId: club.id, userId: email } } });
    const isOfficer = membership && ['gs', 'ags', 'ogs', 'office_secretary'].includes(membership.role);

    if (!isAdmin && !isManager && !hasPerm && !isOfficer) {
      return NextResponse.json({ error: 'Not authorized to review claims' }, { status: 403 });
    }

    const body = await req.json();
    const { claimId, action } = body;
    if (!claimId || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'claimId and action (approve/reject) required' }, { status: 400 });
    }

    const claim = await prisma.clubClaim.findUnique({ where: { id: claimId } });
    if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 });
    if (claim.clubId !== club.id) return NextResponse.json({ error: 'Claim does not belong to this club' }, { status: 400 });
    if (claim.status !== 'pending') return NextResponse.json({ error: 'Claim already reviewed' }, { status: 409 });

    if (action === 'approve') {
      const existingMember = await prisma.clubMember.findUnique({ where: { clubId_userId: { clubId: club.id, userId: claim.userId } } });
      if (!existingMember) {
        await prisma.clubMember.create({
          data: {
            clubId: club.id,
            userId: claim.userId,
            role: claim.requestedRole,
            assignedBy: email,
          },
        });
      }
    }

    await prisma.clubClaim.update({
      where: { id: claimId },
      data: { status: action === 'approve' ? 'approved' : 'rejected', reviewedBy: email, reviewedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to review claim' }, { status: 500 });
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

    const body = await req.json();
    const { claimId } = body;
    if (!claimId) return NextResponse.json({ error: 'claimId required' }, { status: 400 });

    const claim = await prisma.clubClaim.findUnique({ where: { id: claimId } });
    if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 });

    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    const isAdmin = config.isAdminOrAbove(email, profile?.role);
    if (!isAdmin && claim.userId !== email) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    await prisma.clubClaim.delete({ where: { id: claimId } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete claim' }, { status: 500 });
  }
}
