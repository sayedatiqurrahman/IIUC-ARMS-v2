import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { config } from '@/lib/config';
import { hasPermission } from '@/lib/permissions';

const SINGLETON_ROLES = ['president', 'vice_president', 'advisor', 'gs', 'ags', 'ogs', 'treasurer', 'finance', 'it_media', 'cultural', 'publication', 'office_secretary'];

async function getClubAndRole(email: string, slug: string) {
  const { prisma } = await import('@/lib/prisma');
  const club = await prisma.club.findUnique({ where: { slug } });
  if (!club) return { club: null, memberRole: null, isAdmin: false, isManager: false, hasPerm: false, isTeacher: false, isClubAdmin: false };
  const profile = await prisma.profile.findUnique({ where: { userId: email } });
  const role = config.getEffectiveRole(email, profile?.role);
  const isAdmin = config.isAdminOrAbove(email, profile?.role);
  const isManager = config.isManager(email, profile?.role);
  const isTeacher = profile?.role === 'teacher';
  const hasPerm = await hasPermission('manageClubMembers', role, false, email);
  const membership = await prisma.clubMember.findUnique({ where: { clubId_userId: { clubId: club.id, userId: email } } });
  return { club, memberRole: membership?.role || null, isAdmin, isManager, hasPerm, isTeacher, isClubAdmin: membership?.isClubAdmin || false };
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

    // Enrich with Profile data
    const memberEmails = members.map((m: any) => m.userId);
    const profiles = memberEmails.length > 0
      ? await prisma.profile.findMany({
          where: { userId: { in: memberEmails } },
          select: { userId: true, name: true, image: true, githubAvatar: true, department: true, whatsapp: true, title: true, semester: true },
        })
      : [];
    const profileMap = new Map(profiles.map((p: any) => [p.userId, p]));
    const enriched = members.map((m: any) => {
      const p = profileMap.get(m.userId);
      return {
        ...m,
        profileName: p?.name || null,
        profileImage: p?.githubAvatar || p?.image || null,
        profileDepartment: p?.department || null,
        profileWhatsapp: p?.whatsapp || null,
        profileTitle: p?.title || null,
        profileSemester: p?.semester || null,
      };
    });

    return NextResponse.json({ members: enriched });
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
    const { club, memberRole, isAdmin, isManager, hasPerm, isTeacher, isClubAdmin } = await getClubAndRole(email, slug);
    if (!club) return NextResponse.json({ error: 'Club not found' }, { status: 404 });

    const body = await req.json();
    const { userId: inputUserId, role, name, department, session, whatsapp } = body;

    let userId = inputUserId;

    // Name-based add: generate userId from name, create stub Profile
    if (!userId && name) {
      const slugName = name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/g, '');
      userId = `stub.${slugName}.${Date.now()}`;

      const { prisma } = await import('@/lib/prisma');
      // Create stub Profile if not exists
      try {
        await prisma.profile.upsert({
          where: { userId },
          update: { name, department: department || undefined, whatsapp: whatsapp || undefined, semester: session || undefined },
          create: { userId, name, department: department || undefined, whatsapp: whatsapp || undefined, semester: session || undefined },
        });
      } catch {}
    }

    if (!userId) return NextResponse.json({ error: 'userId or name required' }, { status: 400 });

    const validRoles = ['gs', 'ags', 'ogs', 'office_secretary', 'member'];
    const assignedRole = validRoles.includes(role) ? role : 'member';

    const canManage = isAdmin || isManager || hasPerm || memberRole === 'gs' || (isTeacher && !!memberRole) || isClubAdmin;
    const canAssignOfficer = isAdmin || isManager || hasPerm || memberRole === 'gs' || (isTeacher && !!memberRole) || isClubAdmin;
    const isOfficerRole = ['gs', 'ags', 'ogs', 'office_secretary'].includes(assignedRole);
    if (isOfficerRole && !canAssignOfficer) {
      return NextResponse.json({ error: 'Only GS, admin, manager, or teacher members can assign officer roles' }, { status: 403 });
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
    const { club, memberRole, isAdmin, isManager, hasPerm, isTeacher, isClubAdmin } = await getClubAndRole(email, slug);
    if (!club) return NextResponse.json({ error: 'Club not found' }, { status: 404 });

    const canManage = isAdmin || isManager || hasPerm || memberRole === 'gs' || (isTeacher && !!memberRole) || isClubAdmin;
    if (!canManage) {
      return NextResponse.json({ error: 'Not authorized to change roles' }, { status: 403 });
    }

    const body = await req.json();
    const { userId, role: newRole, session, clubRoles } = body;
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

    const { prisma } = await import('@/lib/prisma');
    const validRoleKeys = ['club_admin', 'club_maintainer', 'club_event_manager', 'club_cert_issuer', 'club_content_manager'];

    const isSelfUpdate = userId === email;

    // Self-role update: members can update their own position role AND clubRoles
    if (isSelfUpdate && !canManage) {
      const updateData: any = {};
      if (newRole) updateData.role = newRole;
      if (clubRoles !== undefined) {
        updateData.clubRoles = JSON.stringify(
          Array.isArray(clubRoles) ? clubRoles.filter((r: string) => validRoleKeys.includes(r)) : []
        );
      }
      if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
      }
      const member = await prisma.clubMember.upsert({
        where: { clubId_userId: { clubId: club.id, userId } },
        update: updateData,
        create: { clubId: club.id, userId, role: newRole || 'member', assignedBy: email, clubRoles: updateData.clubRoles || '[]' },
      });
      return NextResponse.json({ success: true, member });
    }

    if (!newRole && clubRoles === undefined) return NextResponse.json({ error: 'role or clubRoles required' }, { status: 400 });

    // Only clubRoles (admin editing someone else or self with admin permissions)
    if (!newRole && clubRoles !== undefined) {
      const filtered = Array.isArray(clubRoles) ? clubRoles.filter((r: string) => validRoleKeys.includes(r)) : [];
      const member = await prisma.clubMember.upsert({
        where: { clubId_userId: { clubId: club.id, userId } },
        update: { clubRoles: JSON.stringify(filtered) },
        create: { clubId: club.id, userId, role: 'member', assignedBy: email, clubRoles: JSON.stringify(filtered) },
      });
      return NextResponse.json({ success: true, member });
    }

    if (newRole) {
      const allValidRoles = [...SINGLETON_ROLES, 'member'];
      if (!allValidRoles.includes(newRole)) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
      }

      const isOfficerRole = SINGLETON_ROLES.includes(newRole);
      const canAssignOfficer = isAdmin || isManager || hasPerm || memberRole === 'gs' || (isTeacher && !!memberRole) || isClubAdmin;
      if (isOfficerRole && !canAssignOfficer) {
        return NextResponse.json({ error: 'Only GS, admin, manager, or teacher members can assign officer roles' }, { status: 403 });
      }

      const sessionLabel = session || `Session ${new Date().getFullYear()}`;

      if (SINGLETON_ROLES.includes(newRole)) {
        const existing = await prisma.clubMember.findFirst({
          where: { clubId: club.id, role: newRole, NOT: { userId } },
        });
        if (existing) {
          await prisma.clubMember.update({
            where: { id: existing.id },
            data: { role: 'member', previousRole: newRole, previousRoleSession: sessionLabel, assignedBy: email },
          });
        }
      }

      const updateData: any = { role: newRole, assignedBy: email, previousRole: null, previousRoleSession: null };
      if (clubRoles !== undefined) {
        updateData.clubRoles = JSON.stringify(Array.isArray(clubRoles) ? clubRoles.filter((r: string) => validRoleKeys.includes(r)) : []);
      }

      const member = await prisma.clubMember.upsert({
        where: { clubId_userId: { clubId: club.id, userId } },
        update: updateData,
        create: { clubId: club.id, userId, role: newRole, assignedBy: email },
      });

      return NextResponse.json({ success: true, member });
    }
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
    const { club, memberRole, isAdmin, isManager, hasPerm, isTeacher, isClubAdmin } = await getClubAndRole(email, slug);
    if (!club) return NextResponse.json({ error: 'Club not found' }, { status: 404 });

    const body = await req.json();
    const { userId } = body;
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

    if (!isAdmin && !isManager && !hasPerm && memberRole !== 'gs' && !(isTeacher && !!memberRole) && !isClubAdmin) {
      return NextResponse.json({ error: 'Only GS, admin, manager, or teacher members can remove members' }, { status: 403 });
    }

    const { prisma } = await import('@/lib/prisma');
    await prisma.clubMember.deleteMany({ where: { clubId: club.id, userId } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 });
  }
}
