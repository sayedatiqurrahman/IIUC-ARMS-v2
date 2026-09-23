import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { config } from '@/lib/config';
import { hasPermission } from '@/lib/permissions';
import { readClubConfig } from '@/lib/club-data';

async function isClubOfficer(email: string, clubId: string): Promise<{ allowed: boolean; role?: string }> {
  const { prisma } = await import('@/lib/prisma');
  const member = await prisma.clubMember.findUnique({ where: { clubId_userId: { clubId, userId: email } } });
  if (!member) return { allowed: false };
  const officerRoles = ['gs', 'ags', 'ogs', 'office_secretary'];
  return { allowed: officerRoles.includes(member.role), role: member.role };
}

// Clubs live in both the DB and the clubs/<slug>/config.json folder in the repo.
// Creation initialises the repo folder async, but the DB row can be missing if
// that step raced or the club existed before the DB was wired up. When the DB
// misses, hydrate from config.json so the club page still works (and seed the DB
// row opportunistically so it shows up in listings afterwards).
async function resolveClubRow(slug: string) {
  const { prisma } = await import('@/lib/prisma');
  const found = await prisma.club.findUnique({ where: { slug } });
  if (found) return { club: found, seeded: false };

  const cfg = await readClubConfig(slug);
  if (!cfg) return { club: null, seeded: false };

  let created: any = null;
  try {
    created = await prisma.club.create({
      data: {
        name: cfg.name || slug.replace(/-/g, ' '),
        slug,
        department: cfg.department || '',
        description: cfg.description || null,
        logoUrl: cfg.logoUrl || null,
        coverUrl: cfg.coverUrl || null,
        createdBy: cfg.createdBy || 'system',
      },
    });
  } catch {
    // Concurrent create/lookup race — try the read once more.
    created = await prisma.club.findUnique({ where: { slug } });
  }
  return { club: created, seeded: true };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rl = rateLimit(_req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    let { slug } = await params;
    if (!slug) return NextResponse.json({ error: 'Club not found' }, { status: 404 });
    slug = decodeURIComponent(slug).trim().toLowerCase();
    const { club, seeded } = await resolveClubRow(slug);
    if (!club) return NextResponse.json({ error: 'Club not found' }, { status: 404 });
    const { prisma } = await import('@/lib/prisma');

      const clubData = seeded
        ? club
        : await prisma.club.findUnique({
            where: { slug },
            include: {
              members: { orderBy: { createdAt: 'asc' } },
              events: { orderBy: { eventDate: 'desc' }, take: 20 },
              _count: { select: { members: true, events: true, certificates: true } },
            },
          });
      if (!clubData) return NextResponse.json({ error: 'Club not found' }, { status: 404 });

      // A club seeded from repo config.json has no member/event rows yet — mirror
      // the repo's members.json/events.json so the page isn't blank.
      let members = (clubData as any).members || [];
      let events = (clubData as any).events || [];
      if (seeded) {
        const { readClubMembers, readClubEvents } = await import('@/lib/club-data');
        members = await readClubMembers(slug);
        events = await readClubEvents(slug);
      }

      // Enrich members with Profile data (name, image, department, contact)
      const memberEmails = (members || []).map((m: any) => m.userId || m.email || '').filter(Boolean);
      const profiles = memberEmails.length > 0
        ? await prisma.profile.findMany({
            where: { userId: { in: memberEmails } },
            select: { userId: true, name: true, image: true, githubAvatar: true, department: true, whatsapp: true, title: true, semester: true, universityId: true },
          })
        : [];
      const profileMap = new Map(profiles.map((p: any) => [p.userId, p]));
      const enrichedMembers = (members || []).map((m: any) => {
        const p = profileMap.get(m.userId || m.email);
        return {
          ...m,
          profileName: p?.name || null,
          profileImage: p?.githubAvatar || p?.image || null,
          profileDepartment: p?.department || null,
          profileWhatsapp: p?.whatsapp || null,
          profileTitle: p?.title || null,
          profileSemester: p?.semester || null,
          profileUniversityId: p?.universityId || null,
        };
      });

      return NextResponse.json({ club: { ...clubData, members: enrichedMembers, events, seeded } });
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
