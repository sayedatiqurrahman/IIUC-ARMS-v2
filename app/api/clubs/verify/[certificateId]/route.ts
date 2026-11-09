import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { CONTRIBUTOR_TEMPLATE_CSS, CONTRIBUTOR_TEMPLATE_HTML } from '@/lib/cert-template';
import type { PrismaClient } from '@prisma/client';

const BUILTIN_CONTRIBUTOR_TEMPLATE = {
  id: 'builtin-contributor',
  name: 'IIUC-ARMS Contributor',
  scope: 'contributor',
  html: CONTRIBUTOR_TEMPLATE_HTML,
  css: CONTRIBUTOR_TEMPLATE_CSS,
};

// Resolve the person who issued the certificate (issuedBy stores the issuer's
// email) into a public profile + club memberships, so views can show a linked
// "Issued By: Name — Position — Club" row. Null when issuedBy is not an email.
async function getIssuer(prisma: PrismaClient, issuedBy: string) {
  if (!issuedBy || !issuedBy.includes('@')) return null;
  const profile = await prisma.profile.findUnique({
    where: { userId: issuedBy.toLowerCase() },
    select: {
      userId: true,
      name: true,
      title: true,
      department: true,
      universityId: true,
      image: true,
      githubAvatar: true,
      hideUniversityId: true,
    },
  });
  if (!profile) return null;
  const memberships = await prisma.clubMember.findMany({
    where: { userId: profile.userId },
    select: {
      role: true,
      isClubAdmin: true,
      club: { select: { name: true, slug: true } },
    },
    orderBy: [{ isClubAdmin: 'desc' }, { createdAt: 'asc' }],
  });
  return {
    userId: profile.userId,
    name: profile.name || profile.userId.split('@')[0],
    title: profile.title || null,
    department: profile.department || null,
    universityId: profile.hideUniversityId ? null : (profile.universityId || null),
    image: profile.githubAvatar || profile.image || null,
    clubMemberships: memberships,
  };
}

async function getTemplate(prisma: PrismaClient, templateId?: string | null) {
  if (!templateId) return null;
  try {
    return await prisma.certificateTemplate.findUnique({
      where: { id: templateId },
      select: { id: true, name: true, scope: true, html: true, css: true },
    });
  } catch {
    return null;
  }
}

function formatPeriod(first?: string | null, last?: string | null): string | null {
  const fmt = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };
  const a = fmt(first);
  const b = fmt(last);
  if (a && b && a !== b) return `${a} – ${b}`;
  if (a) return `Since ${a}`;
  if (b) return `Until ${b}`;
  return null;
}

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
      // Resolve the design used for this certificate: event theme first, then
      // the club's custom theme, otherwise the client falls back to the default.
      let theme: any = null;
      try {
        if (cert.eventId) {
          const ev = await prisma.clubEvent.findUnique({
            where: { id: cert.eventId },
            select: { theme: true },
          });
          if (ev?.theme) theme = JSON.parse(ev.theme);
        }
        if (!theme) {
          const { readClubTheme } = await import('@/lib/club-data');
          theme = await readClubTheme(cert.club.slug) || null;
        }
      } catch {
        theme = null;
      }
      return NextResponse.json({
        valid: true,
        source: 'club',
        theme,
        template: await getTemplate(prisma, cert.templateId),
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
          issuer: await getIssuer(prisma, cert.issuedBy),
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
        template: await getTemplate(prisma, studioCert.templateId),
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
          issuer: await getIssuer(prisma, studioCert.issuedBy),
          organization: studioCert.org.name,
          organizationLogo: studioCert.org.logoUrl,
          organizationType: studioCert.org.type,
          organizationSlug: studioCert.org.slug,
        },
      });
    }

    // Third: check auto-generated contributor certificates
    const contributorCert = await prisma.contributorCertificate.findUnique({
      where: { certificateId: upperId },
    });
    if (contributorCert) {
      let snapshot: any = null;
      let signatories: any[] = [];
      try { snapshot = JSON.parse(contributorCert.contributionData || 'null'); } catch {}
      try { signatories = JSON.parse(contributorCert.signatories || '[]'); } catch {}
      // Contributor certificates are recognition from IIUC-ARMS as a whole; they
      // are never a club or department certificate and never use a canned
      // signature. The signatory keeps the founder name with the Programming
      // Light issuer brand, falling back to the default signatory.
      signatories = signatories.map((s: any) => ({
        ...s,
        title: s?.title || 'Founder',
        designation: s?.designation || 'Programming Light',
        autoSignature: false,
      }));
      if (signatories.length === 0) {
        signatories = [{ name: 'Sayed Atiqur Rahman', title: 'Founder', designation: 'Programming Light', autoSignature: false }];
      }
      return NextResponse.json({
        valid: true,
        source: 'contributor',
        theme: null,
        template: (await getTemplate(prisma, contributorCert.templateId)) || BUILTIN_CONTRIBUTOR_TEMPLATE,
        certificate: {
          certificateId: contributorCert.certificateId,
          memberName: contributorCert.memberName,
          universityId: contributorCert.universityId || contributorCert.githubLogin,
          department: null,
          session: null,
          post: contributorCert.role || 'Contributor',
          eventName: 'Open Source Contribution',
          servicePeriod: formatPeriod(snapshot?.firstContribution, snapshot?.lastContribution),
          signatories,
          issuedAt: contributorCert.issuedAt,
          issuedBy: contributorCert.issuedBy,
          issuer: signatories.find((s: any) => s?.name)
              ? {
                  userId: '',
                  name: signatories.find((s: any) => s?.name).name,
                  title: signatories.find((s: any) => s?.name).title || signatories.find((s: any) => s?.name).designation || null,
                  designation: signatories.find((s: any) => s?.name).designation || null,
                  department: null,
                  clubMemberships: [],
                }
              : null,
          organization: 'IIUC-ARMS',
          organizationLogo: contributorCert.organizationLogo || '/pl-logo.png',
          organizationSlug: 'iiuc-arms',
          githubLogin: contributorCert.githubLogin,
          githubUrl: contributorCert.githubUrl,
          avatarUrl: contributorCert.avatarUrl,
          contributionData: snapshot,
        },
      });
    }

    return NextResponse.json({ valid: false, error: 'Certificate not found' });
  } catch {
    return NextResponse.json({ valid: false, error: 'Verification failed' }, { status: 500 });
  }
}
