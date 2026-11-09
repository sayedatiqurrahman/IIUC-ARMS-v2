import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { buildContributionSnapshot } from '@/lib/contributor-data';
import { config } from '@/lib/config';

export const maxDuration = 60;

function generateCertId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = 'IIUC-';
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) id += '-';
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;

  try {
    const body = await req.json().catch(() => ({}));
    const login = String(body?.login || '').trim();
    if (!login || !/^[a-zA-Z0-9-]{1,39}$/.test(login)) {
      return NextResponse.json({ error: 'Invalid GitHub username' }, { status: 400 });
    }

    const snapshot = await buildContributionSnapshot(login);
    if (!snapshot) {
      return NextResponse.json({ error: 'Contributor not found' }, { status: 404 });
    }

    const { prisma } = await import('@/lib/prisma');
    const key = snapshot.login.toLowerCase();

    // Admin-managed appearance (signature image, signatory labels, logo, design).
    let settings: any = null;
    try {
      settings = await prisma.contributorCertificateSettings.findUnique({ where: { id: 'default' } });
    } catch {}

    let templateId: string | null = settings?.templateId || null;
    if (!templateId) {
      try {
        const tpl = await prisma.certificateTemplate.findFirst({
          where: { scope: 'contributor', isDefault: true },
          orderBy: { updatedAt: 'desc' },
          select: { id: true },
        });
        templateId = tpl?.id || null;
      } catch {}
    }

    const signatory: any = {
      name: settings?.signatoryName || config.founderName,
      title: settings?.signatoryTitle || 'Founder',
      designation: settings?.signatoryDesignation || config.founderAgency,
      autoSignature: false,
    };
    if (settings?.signatureUrl) signatory.signatureUrl = settings.signatureUrl;

    const data = {
      memberName: snapshot.name,
      email: snapshot.email || null,
      avatarUrl: snapshot.avatarUrl || null,
      githubUrl: snapshot.githubUrl || null,
      role: snapshot.role || 'Contributor',
      // Contributor recognition belongs to IIUC-ARMS as a whole; it is not a
      // department or club certificate.
      department: null,
      universityId: snapshot.universityId || null,
      contributionData: JSON.stringify(snapshot),
      signatories: JSON.stringify([signatory]),
      organizationLogo: settings?.organizationLogo || '/pl-logo.png',
      templateId,
    };

    const existing = await prisma.contributorCertificate.findUnique({ where: { githubLogin: key } });

    let cert = existing
      ? await prisma.contributorCertificate.update({ where: { id: existing.id }, data })
      : null;

    if (!cert) {
      for (let attempt = 0; attempt < 5 && !cert; attempt++) {
        try {
          cert = await prisma.contributorCertificate.create({
            data: { certificateId: generateCertId(), githubLogin: key, ...data },
          });
        } catch (e: any) {
          const msg = String(e?.message || e);
          if (msg.includes('githubLogin') && msg.toLowerCase().includes('unique')) {
            const raced = await prisma.contributorCertificate.findUnique({ where: { githubLogin: key } });
            if (raced) {
              cert = await prisma.contributorCertificate.update({ where: { id: raced.id }, data });
            }
          } else if (!(msg.includes('certificateId') && msg.toLowerCase().includes('unique'))) {
            throw e;
          }
        }
      }
    }

    if (!cert) {
      return NextResponse.json({ error: 'Could not generate certificate' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      certificateId: cert.certificateId,
      verifyUrl: `/clubs/preview/${cert.certificateId}`,
      certificate: {
        certificateId: cert.certificateId,
        githubLogin: cert.githubLogin,
        memberName: cert.memberName,
        issuedAt: cert.issuedAt,
      },
      contribution: snapshot.totals,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to generate certificate' }, { status: 500 });
  }
}
