import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export async function GET() {
  try {
    const { prisma } = await import('@/lib/prisma');
    const settings = await prisma.siteSettings.findUnique({ where: { id: 'site-settings' } });
    const custom = (settings?.customClubRoles as Array<{ key: string; label: string }>) || [];
    return NextResponse.json({ success: true, customRoles: custom });
  } catch {
    return NextResponse.json({ success: true, customRoles: [] });
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.admin);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const effectiveRole = config.getEffectiveRole(email);
    if (effectiveRole !== 'admin' && effectiveRole !== 'manager') {
      return NextResponse.json({ error: 'Only admins/managers can add custom club roles' }, { status: 403 });
    }

    const { key, label } = await req.json();
    if (!key?.trim() || !label?.trim()) {
      return NextResponse.json({ error: 'key and label are required' }, { status: 400 });
    }

    const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
    const cleanLabel = label.trim();

    const { prisma } = await import('@/lib/prisma');
    const settings = await prisma.siteSettings.findUnique({ where: { id: 'site-settings' } });
    const existing = (settings?.customClubRoles as Array<{ key: string; label: string }>) || [];

    if (existing.some(r => r.key === cleanKey)) {
      return NextResponse.json({ error: 'A role with this key already exists' }, { status: 400 });
    }

    const updated = [...existing, { key: cleanKey, label: cleanLabel }];
    await prisma.siteSettings.upsert({
      where: { id: 'site-settings' },
      create: { id: 'site-settings', customClubRoles: updated },
      update: { customClubRoles: updated },
    });

    return NextResponse.json({ success: true, customRoles: updated });
  } catch (err: any) {
    console.error('[Custom Club Roles] Error:', err?.message);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.admin);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const effectiveRole = config.getEffectiveRole(email);
    if (effectiveRole !== 'admin') {
      return NextResponse.json({ error: 'Only admins can delete custom club roles' }, { status: 403 });
    }

    const { key } = await req.json();
    if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });

    const { prisma } = await import('@/lib/prisma');
    const settings = await prisma.siteSettings.findUnique({ where: { id: 'site-settings' } });
    const existing = (settings?.customClubRoles as Array<{ key: string; label: string }>) || [];
    const updated = existing.filter(r => r.key !== key);

    await prisma.siteSettings.upsert({
      where: { id: 'site-settings' },
      create: { id: 'site-settings', customClubRoles: updated },
      update: { customClubRoles: updated },
    });

    return NextResponse.json({ success: true, customRoles: updated });
  } catch (err: any) {
    console.error('[Custom Club Roles] Delete error:', err?.message);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
