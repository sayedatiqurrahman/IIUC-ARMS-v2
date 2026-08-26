import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { config } from '@/lib/config';
import { hasPermission } from '@/lib/permissions';

interface BulkMember {
  email?: string;
  name?: string;
  role?: string;
  department?: string;
  session?: string;
  whatsapp?: string;
  clubRoles?: string[];
}

const VALID_ROLES = ['gs', 'ags', 'ogs', 'office_secretary', 'member'];

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

    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    const role = config.getEffectiveRole(email, profile?.role);
    const isAdmin = config.isAdminOrAbove(email, profile?.role);
    const isManager = config.isManager(email, profile?.role);
    const isTeacher = profile?.role === 'teacher';
    const hasPerm = await hasPermission('manageClubMembers', role, false, email);
    const membership = await prisma.clubMember.findUnique({ where: { clubId_userId: { clubId: club.id, userId: email } } });
    const memberRole = membership?.role || null;
    const isClubAdmin = membership?.isClubAdmin || false;

    const canManage = isAdmin || isManager || hasPerm || memberRole === 'gs' || (isTeacher && !!memberRole) || isClubAdmin;
    if (!canManage) {
      return NextResponse.json({ error: 'Not authorized to bulk add members' }, { status: 403 });
    }

    const body = await req.json();
    const { members }: { members: BulkMember[] } = body;

    if (!Array.isArray(members) || members.length === 0) {
      return NextResponse.json({ error: 'No members provided' }, { status: 400 });
    }

    if (members.length > 200) {
      return NextResponse.json({ error: 'Maximum 200 members per import' }, { status: 400 });
    }

    const results: Array<{ index: number; email?: string; name?: string; status: 'success' | 'error'; error?: string }> = [];
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      try {
        let userId = m.email?.trim();

        // Name-based: generate stub userId
        if (!userId && m.name?.trim()) {
          const slugName = m.name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/g, '');
          userId = `stub.${slugName}.${Date.now()}`;

          // Create stub Profile
          try {
            await prisma.profile.upsert({
              where: { userId },
              update: {
                name: m.name.trim(),
                department: m.department?.trim() || undefined,
                whatsapp: m.whatsapp?.trim() || undefined,
                semester: m.session?.trim() || undefined,
              },
              create: {
                userId,
                name: m.name.trim(),
                department: m.department?.trim() || undefined,
                whatsapp: m.whatsapp?.trim() || undefined,
                semester: m.session?.trim() || undefined,
              },
            });
          } catch {}
        }

        if (!userId) {
          results.push({ index: i, name: m.name, status: 'error', error: 'No email or name provided' });
          errorCount++;
          continue;
        }

        const assignedRole = VALID_ROLES.includes(m.role || '') ? m.role! : 'member';

        await prisma.clubMember.upsert({
          where: { clubId_userId: { clubId: club.id, userId } },
          update: { role: assignedRole, assignedBy: email },
          create: { clubId: club.id, userId, role: assignedRole, assignedBy: email },
        });

        results.push({ index: i, email: userId, name: m.name, status: 'success' });
        successCount++;
      } catch (e: any) {
        results.push({ index: i, email: m.email, name: m.name, status: 'error', error: e?.message || 'Unknown error' });
        errorCount++;
      }
    }

    return NextResponse.json({
      success: true,
      total: members.length,
      successCount,
      errorCount,
      results,
    });
  } catch (e: any) {
    return NextResponse.json({ error: 'Bulk import failed' }, { status: 500 });
  }
}
