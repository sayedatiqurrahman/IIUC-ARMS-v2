import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { config } from '@/lib/config';
import { hasPermission } from '@/lib/permissions';

function generateCertId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = 'IIUC-';
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) id += '-';
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

async function canIssueCertificates(email: string, clubId: string): Promise<boolean> {
  const { prisma } = await import('@/lib/prisma');
  const profile = await prisma.profile.findUnique({ where: { userId: email } });
  const role = config.getEffectiveRole(email, profile?.role);
  if (config.isAdminOrAbove(email, profile?.role)) return true;
  if (config.isManager(email, profile?.role)) return true;
  if (await hasPermission('issueCertificates', role, false, email)) return true;
  const member = await prisma.clubMember.findUnique({ where: { clubId_userId: { clubId, userId: email } } });
  if (!member) return false;
  return ['gs', 'ags'].includes(member.role);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const url = new URL(req.url);
    const universityId = url.searchParams.get('universityId');
    const { slug } = await params;
    const { prisma } = await import('@/lib/prisma');
    const club = await prisma.club.findUnique({ where: { slug } });
    if (!club) return NextResponse.json({ error: 'Club not found' }, { status: 404 });

    const where: any = { clubId: club.id };
    if (universityId) where.universityId = universityId;

    const certificates = await prisma.clubCertificate.findMany({
      where,
      orderBy: { issuedAt: 'desc' },
      take: 100,
    });
    return NextResponse.json({ certificates });
  } catch {
    return NextResponse.json({ error: 'Failed to load certificates' }, { status: 500 });
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
      const { memberName, universityId, department, session, post, eventName } = cert;
      if (!memberName?.trim() || !universityId?.trim() || !department?.trim()) continue;
      const certificateId = generateCertId();
      const c = await prisma.clubCertificate.create({
        data: {
          certificateId,
          clubId: club.id,
          eventId: cert.eventId || null,
          memberName: memberName.trim(),
          universityId: universityId.trim(),
          department: department.trim(),
          session: session || null,
          post: post || null,
          eventName: eventName || null,
          issuedBy: email,
        },
      });
      created.push(c);
    }

    return NextResponse.json({ success: true, certificates: created, count: created.length });
  } catch {
    return NextResponse.json({ error: 'Failed to issue certificates' }, { status: 500 });
  }
}
