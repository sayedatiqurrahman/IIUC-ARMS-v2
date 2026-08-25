import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ certificateId: string }> }) {
  const rl = rateLimit(_req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const { certificateId } = await params;
    const upperId = certificateId.toUpperCase();
    const { prisma } = await import('@/lib/prisma');

    // First: check club certificates
    const cert = await prisma.clubCertificate.findUnique({
      where: { certificateId: upperId },
      include: { club: { select: { name: true, slug: true, department: true, logoUrl: true } } },
    });
    if (cert) {
      return NextResponse.json({
        valid: true,
        source: 'club',
        certificate: {
          certificateId: cert.certificateId,
          memberName: cert.memberName,
          universityId: cert.universityId,
          department: cert.department,
          session: cert.session,
          post: cert.post,
          eventName: cert.eventName,
          servicePeriod: cert.servicePeriod,
          signatories: cert.signatories ? JSON.parse(cert.signatories) : [],
          issuedAt: cert.issuedAt,
          issuedBy: cert.issuedBy,
          organization: cert.club.name,
          organizationLogo: cert.club.logoUrl,
          organizationDepartment: cert.club.department,
          organizationSlug: cert.club.slug,
        },
      });
    }

    // Second: check studio certificates
    const studioCert = await prisma.studioCertificate.findUnique({
      where: { certificateId: upperId },
      include: { org: { select: { name: true, slug: true, logoUrl: true, type: true } } },
    });
    if (studioCert) {
      return NextResponse.json({
        valid: true,
        source: 'studio',
        certificate: {
          certificateId: studioCert.certificateId,
          memberName: studioCert.memberName,
          universityId: studioCert.universityId,
          department: studioCert.department,
          session: studioCert.session,
          post: studioCert.post,
          eventName: studioCert.eventName,
          servicePeriod: studioCert.servicePeriod,
          signatories: studioCert.signatories ? JSON.parse(studioCert.signatories) : [],
          issuedAt: studioCert.issuedAt,
          issuedBy: studioCert.issuedBy,
          organization: studioCert.org.name,
          organizationLogo: studioCert.org.logoUrl,
          organizationType: studioCert.org.type,
          organizationSlug: studioCert.org.slug,
        },
      });
    }

    return NextResponse.json({ valid: false, error: 'Certificate not found' });
  } catch {
    return NextResponse.json({ valid: false, error: 'Verification failed' }, { status: 500 });
  }
}
