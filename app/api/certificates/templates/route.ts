import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { config } from '@/lib/config';
import {
  CERT_TEMPLATE_ATTRIBUTES,
  MAX_TEMPLATE_CSS,
  MAX_TEMPLATE_HTML,
  sanitizeTemplateCss,
  sanitizeTemplateHtml,
} from '@/lib/cert-template';

const VALID_SCOPES = ['global', 'club', 'studio', 'contributor'];

function isAdmin(email: string | null): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  return config.adminEmails.includes(lower) || config.ownerEmails.includes(lower);
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;

  try {
    const email = await getUserEmail(req);
    const admin = isAdmin(email);
    const { prisma } = await import('@/lib/prisma');
    const mine = req.nextUrl.searchParams.get('mine') === 'true';

    let where: any = {};
    if (mine && email) where = { ownerId: email };
    else if (!admin && email) where = { OR: [{ ownerId: email }, { scope: 'global' }] };
    else if (!admin && !email) where = { scope: 'global' };

    const templates = await prisma.certificateTemplate.findMany({
      where,
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });

    return NextResponse.json({
      templates,
      attributes: CERT_TEMPLATE_ATTRIBUTES,
      isAdmin: admin,
      canManage: !!email,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load templates' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;

  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || '').trim();
    const scope = String(body?.scope || 'global');
    const html = sanitizeTemplateHtml(String(body?.html || ''));
    const css = sanitizeTemplateCss(String(body?.css || ''));
    const isDefault = !!body?.isDefault;

    if (name.length < 2 || name.length > 80) {
      return NextResponse.json({ error: 'Template name must be 2–80 characters' }, { status: 400 });
    }
    if (!VALID_SCOPES.includes(scope)) {
      return NextResponse.json({ error: 'Invalid template scope' }, { status: 400 });
    }
    if (scope === 'global' && !isAdmin(email)) {
      return NextResponse.json({ error: 'Only admins can create global templates' }, { status: 403 });
    }
    if (!html.trim()) {
      return NextResponse.json({ error: 'Template HTML is required' }, { status: 400 });
    }
    if (html.length > MAX_TEMPLATE_HTML || css.length > MAX_TEMPLATE_CSS) {
      return NextResponse.json({ error: 'Template is too large' }, { status: 400 });
    }

    const { prisma } = await import('@/lib/prisma');
    if (isDefault) {
      await prisma.certificateTemplate.updateMany({ where: { scope }, data: { isDefault: false } });
    }

    const template = await prisma.certificateTemplate.create({
      data: { name, scope, html, css, isDefault, ownerId: email },
    });

    return NextResponse.json({ success: true, template });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to save template' }, { status: 500 });
  }
}
