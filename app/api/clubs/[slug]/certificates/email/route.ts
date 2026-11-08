import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { config } from '@/lib/config';
import { normalizeUniversityId } from '@/lib/utils';
import { hasPermission } from '@/lib/permissions';
import { hasAnyClubRole } from '@/lib/club-member-roles';
import {
  DEFAULT_EMAIL_SETTINGS,
  mergeEmailSettings,
  interpolate,
  renderEmailHtml,
  emailPlainParts,
  type EmailSettings,
} from '@/lib/email-theme';
import {
  getGoogleOAuthConfig,
  getConnectedSender,
  refreshGmailAccessToken,
  sendGmailMessage,
} from '@/lib/gmail';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function canIssueCertificates(email: string, clubId: string): Promise<boolean> {
  const { prisma } = await import('@/lib/prisma');
  const profile = await prisma.profile.findUnique({ where: { userId: email } });
  const role = config.getEffectiveRole(email, profile?.role);

  if (config.isAdminOrAbove(email, profile?.role)) return true;
  if (config.isManager(email, profile?.role)) return true;
  if (await hasPermission('issueCertificates', role, false, email)) return true;

  const member = await prisma.clubMember.findUnique({
    where: { clubId_userId: { clubId, userId: email } },
  });
  if (!member) return false;
  if (['gs', 'ags'].includes(member.role)) return true;
  return hasAnyClubRole(member.clubRoles, ['club_admin', 'club_maintainer', 'club_cert_issuer']);
}

async function loadEmailSettings(): Promise<EmailSettings> {
  try {
    const { prisma } = await import('@/lib/prisma');
    const row = await prisma.siteSettings.findUnique({ where: { id: 'site-settings' } });
    const raw = row?.emailSettings;
    if (raw && typeof raw === 'object') return mergeEmailSettings(raw as any);
  } catch {}
  return DEFAULT_EMAIL_SETTINGS;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;

  const email = await getUserEmail(req);
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { slug } = await params;
  const origin = new URL(req.url).origin;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const certificateIds: string[] = Array.isArray(body?.certificateIds)
    ? body.certificateIds.filter((id: any) => typeof id === 'string')
    : [];
  if (certificateIds.length === 0) {
    return NextResponse.json({ error: 'No certificates selected' }, { status: 400 });
  }
  if (certificateIds.length > 500) {
    return NextResponse.json({ error: 'Too many certificates in one send (max 500)' }, { status: 400 });
  }

  const { prisma } = await import('@/lib/prisma');
  const club = await prisma.club.findUnique({ where: { slug } });
  if (!club) return NextResponse.json({ error: 'Club not found' }, { status: 404 });

  if (!(await canIssueCertificates(email, club.id))) {
    return NextResponse.json({ error: 'You do not have permission to email certificates for this club' }, { status: 403 });
  }

  if (!getGoogleOAuthConfig().configured) {
    return NextResponse.json(
      { error: 'Email sending is not configured on this deployment yet', needsConnect: true, configured: false },
      { status: 400 },
    );
  }

  const sender = await getConnectedSender(email);
  if (!sender) {
    return NextResponse.json(
      { error: 'Connect your Gmail account to send certificates', needsConnect: true, configured: true },
      { status: 400 },
    );
  }

  const certs = await prisma.clubCertificate.findMany({
    where: { clubId: club.id, certificateId: { in: certificateIds } },
  });
  if (certs.length === 0) {
    return NextResponse.json({ error: 'No matching certificates found' }, { status: 404 });
  }

  const settings = await loadEmailSettings();
  const appName = settings.theme.appName;

  let accessToken: string;
  try {
    accessToken = await refreshGmailAccessToken(sender.refreshToken);
  } catch (err: any) {
    console.error('[cert-email] token refresh failed:', err?.message || err);
    return NextResponse.json(
      { error: 'Gmail connection expired. Please reconnect your Google account.', needsConnect: true, configured: true },
      { status: 400 },
    );
  }

  const subjectTemplate = String(body?.subject || '').trim() || `Your ${club.name} certificate — ${appName}`;
  const messageTemplate = String(body?.message || '').trim();

  const results: Array<{ certificateId: string; email?: string; status: 'sent' | 'skipped' | 'failed'; error?: string }> = [];

  for (const cert of certs) {
    let recipient = (cert.email || '').trim();
    if (!recipient) {
      try {
        const profile = await prisma.profile.findFirst({
          where: { universityId: normalizeUniversityId(cert.universityId || '') },
          select: { email: true, userId: true },
        });
        recipient = (profile?.email || (profile?.userId?.includes('@') ? profile.userId : '') || '').trim();
      } catch {}
    }
    if (!recipient || !recipient.includes('@')) {
      results.push({ certificateId: cert.certificateId, status: 'skipped', error: 'No email address for recipient' });
      continue;
    }

    const verifyUrl = `${origin}/clubs/preview/${cert.certificateId}`;
    const tokenVars: Record<string, string> = {
      name: cert.memberName || 'there',
      email: recipient,
      universityId: cert.universityId || '',
      certificateId: cert.certificateId,
      verifyUrl,
      clubName: club.name,
      appName,
    };

    const customMessage = messageTemplate
      ? interpolate(messageTemplate, tokenVars)
      : `Dear ${cert.memberName},\n\nCongratulations! Your certificate from ${club.name} has been issued. You can view and verify it here:\n${verifyUrl}\n\nCertificate ID: ${cert.certificateId}`;

    const subject = interpolate(subjectTemplate, tokenVars);
    const template = { key: 'certificate', label: 'Certificate', subject, body: customMessage };

    const renderOpts = {
      name: cert.memberName || 'there',
      email: recipient,
      universityId: cert.universityId || '',
      origin,
    };
    const html = renderEmailHtml(settings, template, renderOpts);
    const plain = emailPlainParts(settings, template, renderOpts);

    try {
      await sendGmailMessage({
        accessToken,
        from: sender.email,
        fromName: club.name || appName,
        to: recipient,
        subject: plain.subject,
        html,
        text: plain.body,
      });
      results.push({ certificateId: cert.certificateId, email: recipient, status: 'sent' });
    } catch (err: any) {
      console.error(`[cert-email] send failed for ${cert.certificateId}:`, err?.message || err);
      results.push({ certificateId: cert.certificateId, email: recipient, status: 'failed', error: err?.message || 'send-failed' });
    }
  }

  const summary = {
    sent: results.filter(r => r.status === 'sent').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    failed: results.filter(r => r.status === 'failed').length,
  };

  return NextResponse.json({ success: true, summary, results, sender: sender.email });
}
