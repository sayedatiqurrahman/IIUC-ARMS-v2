import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { config } from '@/lib/config';
import {
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

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;

  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const { prisma } = await import('@/lib/prisma');
    const existing = await prisma.certificateTemplate.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

    const admin = isAdmin(email);
    if (existing.ownerId !== email && !admin) {
      return NextResponse.json({ error: 'Not authorized to edit this template' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const name = body?.name != null ? String(body.name).trim() : existing.name;
    const scope = body?.scope != null ? String(body.scope) : existing.scope;
    const html = body?.html != null ? sanitizeTemplateHtml(String(body.html)) : existing.html;
    const css = body?.css != null ? sanitizeTemplateCss(String(body.css)) : existing.css;
    const isDefault = body?.isDefault != null ? !!body.isDefault : existing.isDefault;

    if (name.length < 2 || name.length > 80) {
      return NextResponse.json({ error: 'Template name must be 2–80 characters' }, { status: 400 });
    }
    if (!VALID_SCOPES.includes(scope)) {
      return NextResponse.json({ error: 'Invalid template scope' }, { status: 400 });
    }
    if (scope === 'global' && !admin) {
      return NextResponse.json({ error: 'Only admins can create global templates' }, { status: 403 });
    }
    if (!html.trim()) {
      return NextResponse.json({ error: 'Template HTML is required' }, { status: 400 });
    }
    if (html.length > MAX_TEMPLATE_HTML || css.length > MAX_TEMPLATE_CSS) {
      return NextResponse.json({ error: 'Template is too large' }, { status: 400 });
    }

    if (isDefault) {
      await prisma.certificateTemplate.updateMany({
        where: { scope, NOT: { id } },
        data: { isDefault: false },
      });
    }

    const template = await prisma.certificateTemplate.update({
      where: { id },
      data: { name, scope, html, css, isDefault },
    });

    return NextResponse.json({ success: true, template });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to update template' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;

  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const { prisma } = await import('@/lib/prisma');
    const existing = await prisma.certificateTemplate.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

    if (existing.ownerId !== email && !isAdmin(email)) {
      return NextResponse.json({ error: 'Not authorized to delete this template' }, { status: 403 });
    }

    await prisma.certificateTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to delete template' }, { status: 500 });
  }
}
