import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { config } from '@/lib/config';

const SETTINGS_ID = 'default';

const DEFAULTS = {
  templateId: null as string | null,
  signatureUrl: null as string | null,
  signatoryName: config.founderName,
  signatoryTitle: 'Founder',
  signatoryDesignation: 'Programming Light',
  organizationLogo: '/pl-logo.png',
};

async function canManage(email: string | null): Promise<boolean> {
  if (!email) return false;
  const lower = email.toLowerCase();
  if (config.adminEmails.includes(lower) || config.ownerEmails.includes(lower)) return true;
  try {
    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({
      where: { userId: lower },
      select: { role: true },
    });
    return config.isAdminOrAbove(lower, profile?.role);
  } catch {
    return false;
  }
}

// Accept either an uploaded data URL (downscaled on the client) or a hosted
// http(s) image URL. Keep the payload bounded so a single row stays sane.
function isSafeImage(value: string | null | undefined): boolean {
  if (!value) return true;
  const v = value.trim();
  if (!v) return true;
  if (/^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(v)) {
    return v.length <= 1_800_000;
  }
  return /^https?:\/\/[^\s]+$/i.test(v) && v.length <= 1000;
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;

  try {
    const email = await getUserEmail(req);
    if (!(await canManage(email))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { prisma } = await import('@/lib/prisma');

    let settings: any = { id: SETTINGS_ID, ...DEFAULTS, updatedAt: null };
    let templates: any[] = [];
    try {
      settings = await prisma.contributorCertificateSettings.upsert({
        where: { id: SETTINGS_ID },
        update: {},
        create: { id: SETTINGS_ID, ...DEFAULTS },
      });
    } catch {
      // Table not migrated yet — still return editable defaults.
    }
    if (!settings.signatoryDesignation) {
      settings = { ...settings, signatoryDesignation: DEFAULTS.signatoryDesignation };
    }
    try {
      templates = await prisma.certificateTemplate.findMany({
        where: { scope: { in: ['contributor', 'global'] } },
        orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
        select: { id: true, name: true, scope: true, isDefault: true, updatedAt: true },
      });
    } catch {}

    return NextResponse.json({ success: true, settings, templates });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load settings' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;

  try {
    const email = await getUserEmail(req);
    if (!(await canManage(email))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));

    const signatoryName = String(body?.signatoryName ?? '').trim() || DEFAULTS.signatoryName;
    const signatoryTitle = String(body?.signatoryTitle ?? '').trim() || DEFAULTS.signatoryTitle;
    const signatoryDesignation = String(body?.signatoryDesignation ?? '').trim() || DEFAULTS.signatoryDesignation;
    const signatureUrl = body?.signatureUrl ? String(body.signatureUrl).trim() : null;
    const organizationLogo = body?.organizationLogo ? String(body.organizationLogo).trim() : DEFAULTS.organizationLogo;
    const templateId = body?.templateId ? String(body.templateId).trim() : null;

    if (signatoryName.length > 120 || signatoryTitle.length > 80 || signatoryDesignation.length > 120) {
      return NextResponse.json({ error: 'Signatory text is too long' }, { status: 400 });
    }
    if (!isSafeImage(signatureUrl)) {
      return NextResponse.json({ error: 'Signature must be a PNG/JPG/WebP image or an https URL' }, { status: 400 });
    }
    if (!isSafeImage(organizationLogo)) {
      return NextResponse.json({ error: 'Logo must be an image file or an https URL' }, { status: 400 });
    }

    const { prisma } = await import('@/lib/prisma');

    if (templateId) {
      const tpl = await prisma.certificateTemplate.findUnique({
        where: { id: templateId },
        select: { id: true, scope: true },
      });
      if (!tpl || !['contributor', 'global'].includes(tpl.scope)) {
        return NextResponse.json({ error: 'Choose a contributor or global design' }, { status: 400 });
      }
    }

    const data = {
      templateId,
      signatureUrl,
      signatoryName,
      signatoryTitle,
      signatoryDesignation,
      organizationLogo,
      updatedBy: email,
    };

    const settings = await prisma.contributorCertificateSettings.upsert({
      where: { id: SETTINGS_ID },
      update: data,
      create: { id: SETTINGS_ID, ...data },
    });

    let applied = 0;
    if (body?.applyToExisting) {
      const signatory: any = {
        name: signatoryName,
        title: signatoryTitle,
        designation: signatoryDesignation,
        autoSignature: false,
      };
      if (signatureUrl) signatory.signatureUrl = signatureUrl;
      const result = await prisma.contributorCertificate.updateMany({
        data: {
          signatories: JSON.stringify([signatory]),
          organizationLogo,
          templateId,
        },
      });
      applied = result.count;
    }

    return NextResponse.json({ success: true, settings, applied });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to save settings' }, { status: 500 });
  }
}
