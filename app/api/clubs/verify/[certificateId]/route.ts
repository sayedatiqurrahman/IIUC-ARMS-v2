import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ certificateId: string }> }) {
  const rl = rateLimit(_req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const { certificateId } = await params;
    const { prisma } = await import('@/lib/prisma');
    const cert = await prisma.clubCertificate.findUnique({
      where: { certificateId: certificateId.toUpperCase() },
      include: { club: { select: { name: true, slug: true, department: true, logoUrl: true } } },
    });
    if (!cert) return NextResponse.json({ valid: false, error: 'Certificate not found' });
    return NextResponse.json({
      valid: true,
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
        club: cert.club,
        issuedBy: cert.issuedBy,
      },
    });
  } catch {
    return NextResponse.json({ valid: false, error: 'Verification failed' }, { status: 500 });
  }
}
