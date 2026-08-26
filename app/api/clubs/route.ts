import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { config } from '@/lib/config';
import { hasPermission } from '@/lib/permissions';
import { initClubRepo } from '@/lib/club-data';

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const url = new URL(req.url);
    const department = url.searchParams.get('department');
    const includeAll = url.searchParams.get('all') === 'true';
    const { prisma } = await import('@/lib/prisma');
    const where: any = {};
    if (!includeAll) where.isActive = true;
    if (department) where.department = department;
    const clubs = await prisma.club.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { _count: { select: { members: true, events: true, certificates: true } } },
    });

    const creatorEmails = Array.from(new Set(clubs.map((c: any) => c.createdBy).filter(Boolean)));
    const creatorProfiles = creatorEmails.length > 0
      ? await prisma.profile.findMany({
          where: { userId: { in: creatorEmails } },
          select: { userId: true, name: true, image: true, githubAvatar: true },
        })
      : [];
    const creatorMap = new Map(creatorProfiles.map((p: any) => [p.userId, p]));

    const enriched = clubs.map((c: any) => {
      const cp = creatorMap.get(c.createdBy);
      return {
        ...c,
        creatorName: cp?.name || c.createdBy?.split('@')[0] || 'Unknown',
        creatorImage: cp?.githubAvatar || cp?.image || null,
      };
    });

    return NextResponse.json({ success: true, clubs: enriched });
  } catch {
    return NextResponse.json({ success: true, clubs: [] });
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    const role = config.getEffectiveRole(email, profile?.role);

    const canCreate = await hasPermission('createClub', role, false, email)
      || config.isAdminOrAbove(email, profile?.role);
    if (!canCreate) {
      return NextResponse.json({ error: 'Only teachers/admins can create clubs' }, { status: 403 });
    }

    const body = await req.json();
    const { name, department, description, logoUrl, coverUrl, creatorRole } = body;
    if (!name?.trim()) return NextResponse.json({ error: 'Club name required' }, { status: 400 });
    if (!department) return NextResponse.json({ error: 'Department required' }, { status: 400 });

    const isAdmin = config.isAdminOrAbove(email, profile?.role);
    const isManager = config.isManager(email, profile?.role);
    const hasManageAll = await hasPermission('manageAllClubs', role, false, email);

    if (!isAdmin && !isManager && !hasManageAll) {
      const userDept = profile?.department;
      if (!userDept) {
        return NextResponse.json({ error: 'Your profile has no department set. Contact admin.' }, { status: 403 });
      }
      if (department.toLowerCase() !== userDept.toLowerCase()) {
        return NextResponse.json({ error: `Teachers can only create clubs in their own department (${userDept}).` }, { status: 403 });
      }
    }

    let slug = slugify(name);
    const existing = await prisma.club.findUnique({ where: { slug } });
    if (existing) slug = `${slug}-${Date.now()}`;

    const club = await prisma.club.create({
      data: {
        name: name.trim(),
        slug,
        department,
        description: description || null,
        logoUrl: logoUrl || null,
        coverUrl: coverUrl || null,
        createdBy: email,
      },
    });

    const validCreatorRole = creatorRole && creatorRole !== 'gs' ? creatorRole : 'member';
    await prisma.clubMember.create({
      data: {
        clubId: club.id,
        userId: email,
        role: validCreatorRole,
        assignedBy: email,
        isClubAdmin: true,
        clubRoles: JSON.stringify(['club_admin', 'club_maintainer', 'club_event_manager', 'club_cert_issuer', 'club_content_manager']),
      },
    });

    const clubDataConfig = {
      name: club.name,
      slug: club.slug,
      department: club.department,
      description: club.description || undefined,
      logoUrl: club.logoUrl || undefined,
      coverUrl: club.coverUrl || undefined,
      createdAt: club.createdAt.toISOString(),
      createdBy: club.createdBy,
    };
    initClubRepo(slug, clubDataConfig).catch(() => {});

    return NextResponse.json({ success: true, club });
  } catch {
    return NextResponse.json({ error: 'Failed to create club' }, { status: 500 });
  }
}
