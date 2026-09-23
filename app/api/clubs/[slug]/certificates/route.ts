import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { config } from '@/lib/config';
import { normalizeUniversityId } from '@/lib/utils';
import { hasPermission } from '@/lib/permissions';
import { hasAnyClubRole, parseClubRoles } from '@/lib/club-member-roles';

function generateCertId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = 'IIUC-';
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) id += '-';
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// Every certificate recipient is treated as a member: ensure a (stub) Profile +
// club membership exists so the person appears in the member list and their
// certificates stay linked. Already-registered students link their real account.
async function ensureRecipientMember(clubId: string, cert: { memberName: string; universityId: string; department: string }) {
  try {
    const { prisma } = await import('@/lib/prisma');
    const uniId = normalizeUniversityId(cert.universityId || '');
    const name = cert.memberName?.trim();
    const dept = cert.department?.trim();
    if (!uniId || !name) return;

    const existing = await prisma.profile.findFirst({ where: { universityId: uniId } });
    if (existing) {
      await prisma.clubMember.upsert({
        where: { clubId_userId: { clubId, userId: existing.userId } },
        update: {},
        create: { clubId, userId: existing.userId, role: 'member', assignedBy: 'system' },
      });
      return;
    }

    const userId = `stub.uid.${uniId.toLowerCase()}`;
    await prisma.profile.upsert({
      where: { userId },
      update: { name: name || undefined, department: dept || undefined, universityId: uniId },
      create: { userId, name, department: dept || undefined, universityId: uniId },
    });
    await prisma.clubMember.upsert({
      where: { clubId_userId: { clubId, userId } },
      update: {},
      create: { clubId, userId, role: 'member', assignedBy: 'system' },
    });
  } catch {}
}

async function canIssueCertificates(email: string, clubId: string): Promise<boolean> {
  const { prisma } = await import('@/lib/prisma');
  const profile = await prisma.profile.findUnique({ where: { userId: email } });
  const role = config.getEffectiveRole(email, profile?.role);

  // Site-wide: admin/manager always allowed
  if (config.isAdminOrAbove(email, profile?.role)) return true;
  if (config.isManager(email, profile?.role)) return true;

  // Site-wide: has issueCertificates permission (admin-togglable in Permissions tab)
  if (await hasPermission('issueCertificates', role, false, email)) return true;

  // Club-level: must be a member
  const member = await prisma.clubMember.findUnique({
    where: { clubId_userId: { clubId, userId: email } }
  });
  if (!member) return false;

  // Club officer roles (GS/AGS always allowed)
  if (['gs', 'ags'].includes(member.role)) return true;

  // Club permission roles (club_admin, club_maintainer, club_cert_issuer)
  if (hasAnyClubRole(member.clubRoles, ['club_admin', 'club_maintainer', 'club_cert_issuer'])) return true;

  return false;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const url = new URL(req.url);
    const search = url.searchParams.get('search');
    const universityId = url.searchParams.get('universityId');
    const eventId = url.searchParams.get('eventId');
    const { slug } = await params;
    if (!slug) return NextResponse.json({ certificates: [] });
    const { prisma } = await import('@/lib/prisma');
    const club = await prisma.club.findUnique({ where: { slug } });
    if (!club) return NextResponse.json({ certificates: [] });

    const where: any = { clubId: club.id };
    if (eventId) {
      where.eventId = eventId;
    }
    if (search) {
      where.OR = [
        { memberName: { contains: search } },
        { certificateId: { contains: search } },
        { universityId: { contains: search } },
      ];
    } else if (universityId) {
      where.universityId = universityId;
    }

    const certificates = await prisma.clubCertificate.findMany({
      where,
      orderBy: { issuedAt: 'desc' },
      take: 100,
    });
    return NextResponse.json({ certificates });
  } catch {
    return NextResponse.json({ certificates: [] });
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

    if (!(await canIssueCertificates(email, club.id))) {
      return NextResponse.json({ error: 'Not authorized to issue certificates' }, { status: 403 });
    }

    const body = await req.json();
    const { certificates } = body;
    if (!Array.isArray(certificates) || certificates.length === 0) {
      return NextResponse.json({ error: 'certificates array required' }, { status: 400 });
    }

    const created = [];
    for (const cert of certificates) {
      const { memberName, universityId, department, session, post, eventName, servicePeriod, signatories } = cert;
      const uniId = normalizeUniversityId(universityId);
      if (!memberName?.trim() || !uniId || !department?.trim()) continue;
      const certificateId = generateCertId();
      const c = await prisma.clubCertificate.create({
        data: {
          certificateId,
          clubId: club.id,
          eventId: cert.eventId || null,
          memberName: memberName.trim(),
          universityId: uniId,
          department: department.trim(),
          session: session || null,
          post: post || null,
          eventName: eventName || null,
          servicePeriod: servicePeriod || null,
          signatories: signatories ? JSON.stringify(signatories) : null,
          issuedBy: email,
        },
      });
      created.push(c);
      // Recipients become members (stub profile auto-created when needed).
      await ensureRecipientMember(club.id, { memberName: memberName.trim(), universityId: uniId, department: department.trim() });
    }

    return NextResponse.json({ success: true, certificates: created, count: created.length });
  } catch {
    return NextResponse.json({ error: 'Failed to issue certificates' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { slug } = await params;
    const { prisma } = await import('@/lib/prisma');
    const club = await prisma.club.findUnique({ where: { slug } });
    if (!club) return NextResponse.json({ error: 'Club not found' }, { status: 404 });

    if (!(await canIssueCertificates(email, club.id))) {
      return NextResponse.json({ error: 'Not authorized to edit certificates' }, { status: 403 });
    }

    const body = await req.json();
    const { certificateId, data } = body;
    if (!certificateId || !data) {
      return NextResponse.json({ error: 'certificateId and data required' }, { status: 400 });
    }

    const { memberName, universityId, department, session, post, eventName, servicePeriod, signatories } = data || {};
    const uniId = normalizeUniversityId(universityId);
    if (!memberName?.trim() || !uniId || !department?.trim()) {
      return NextResponse.json({ error: 'memberName, universityId, department are required' }, { status: 400 });
    }

    const existing = await prisma.clubCertificate.findFirst({
      where: { certificateId, clubId: club.id },
    });
    if (!existing) return NextResponse.json({ error: 'Certificate not found' }, { status: 404 });

    const updated = await prisma.clubCertificate.update({
      where: { id: existing.id },
      data: {
        memberName: memberName.trim(),
        universityId: uniId,
        department: department.trim(),
        session: session || null,
        post: post || null,
        eventName: eventName || null,
        servicePeriod: servicePeriod || null,
        signatories: signatories ? JSON.stringify(signatories) : null,
      },
    });

    return NextResponse.json({ success: true, certificate: updated });
  } catch {
    return NextResponse.json({ error: 'Failed to update certificate' }, { status: 500 });
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
    const isAdmin = config.isAdminOrAbove(email, profile?.role);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Only admins can delete certificates' }, { status: 403 });
    }

    const body = await req.json();
    const { certificateId } = body;
    if (!certificateId) return NextResponse.json({ error: 'certificateId required' }, { status: 400 });

    const deleted = await prisma.clubCertificate.deleteMany({
      where: { certificateId, clubId: club.id },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: 'Certificate not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete certificate' }, { status: 500 });
  }
}
