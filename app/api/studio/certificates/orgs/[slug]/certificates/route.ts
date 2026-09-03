import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

function generateCertId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = 'IIUC-';
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) id += '-';
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const { slug } = await params;
    const { prisma } = await import('@/lib/prisma');
    const org = await prisma.studioOrganization.findUnique({ where: { slug } });
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

    const url = new URL(req.url);
    const search = url.searchParams.get('search') || '';

    const where: any = { orgId: org.id };
    if (search) {
      where.OR = [
        { memberName: { contains: search } },
        { certificateId: { contains: search.toUpperCase() } },
        { universityId: { contains: search } },
      ];
    }

    const certificates = await prisma.studioCertificate.findMany({
      where,
      orderBy: { issuedAt: 'desc' },
      take: 100,
    });
    return NextResponse.json({ certificates, org: { name: org.name, slug: org.slug } });
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

    const org = await prisma.studioOrganization.findUnique({ where: { slug } });
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    if (org.createdBy !== email) return NextResponse.json({ error: 'Not authorized to issue certificates for this organization' }, { status: 403 });

    const body = await req.json();
    const { certificates } = body;
    if (!Array.isArray(certificates) || certificates.length === 0) {
      return NextResponse.json({ error: 'No certificates provided' }, { status: 400 });
    }

    const created = [];
    for (const cert of certificates) {
      if (!cert.memberName?.trim() || !cert.universityId?.trim() || !cert.department?.trim()) continue;

      const certificateId = generateCertId();
      const signatoriesJson = cert.signatories && cert.signatories.length > 0
        ? JSON.stringify(cert.signatories.filter((s: any) => s.name?.trim()))
        : null;

      const record = await prisma.studioCertificate.create({
        data: {
          certificateId,
          orgId: org.id,
          memberName: cert.memberName.trim(),
          universityId: cert.universityId.trim(),
          department: cert.department.trim(),
          session: cert.session?.trim() || null,
          post: cert.post?.trim() || null,
          eventName: cert.eventName?.trim() || null,
          servicePeriod: cert.servicePeriod?.trim() || null,
          signatories: signatoriesJson,
          issuedBy: email,
        },
      });
      created.push(record);
    }

    if (created.length > 0) {
      await prisma.studioOrganization.update({
        where: { id: org.id },
        data: { certCount: { increment: created.length } },
      });
    }

    return NextResponse.json({ success: true, certificates: created });
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

    const org = await prisma.studioOrganization.findUnique({ where: { slug } });
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    if (org.createdBy !== email) return NextResponse.json({ error: 'Not authorized to edit certificates for this organization' }, { status: 403 });

    const body = await req.json();
    const { certificateId, data } = body;
    if (!certificateId || !data) {
      return NextResponse.json({ error: 'certificateId and data required' }, { status: 400 });
    }
    if (!data.memberName?.trim() || !data.universityId?.trim() || !data.department?.trim()) {
      return NextResponse.json({ error: 'memberName, universityId, department are required' }, { status: 400 });
    }

    const existing = await prisma.studioCertificate.findFirst({
      where: { certificateId, orgId: org.id },
    });
    if (!existing) return NextResponse.json({ error: 'Certificate not found' }, { status: 404 });

    const signatoriesJson = data.signatories && data.signatories.length > 0
      ? JSON.stringify(data.signatories.filter((s: any) => s.name?.trim()))
      : null;

    const updated = await prisma.studioCertificate.update({
      where: { id: existing.id },
      data: {
        memberName: data.memberName.trim(),
        universityId: data.universityId.trim(),
        department: data.department.trim(),
        session: data.session?.trim() || null,
        post: data.post?.trim() || null,
        eventName: data.eventName?.trim() || null,
        servicePeriod: data.servicePeriod?.trim() || null,
        signatories: signatoriesJson,
      },
    });

    return NextResponse.json({ success: true, certificate: updated });
  } catch {
    return NextResponse.json({ error: 'Failed to update certificate' }, { status: 500 });
  }
}
