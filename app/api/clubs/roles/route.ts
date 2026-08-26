import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

async function ensureColumn(p: any) {
  try {
    const tableInfo = await p.$queryRawUnsafe(`PRAGMA table_info(SiteSettings)`);
    const existingCols = new Set((tableInfo as any[]).map((c: any) => c.name));
    if (!existingCols.has('customClubRoles')) {
      await p.$executeRawUnsafe(`ALTER TABLE SiteSettings ADD COLUMN customClubRoles TEXT`);
    }
  } catch {}
}

async function readCustomRoles(p: any): Promise<Array<{ key: string; label: string }>> {
  try {
    const rows = await p.$queryRawUnsafe(`SELECT customClubRoles FROM SiteSettings WHERE id = 'site-settings'`);
    const raw = (rows as any[])[0]?.customClubRoles;
    if (!raw) return [];
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return [];
  }
}

async function writeCustomRoles(p: any, roles: Array<{ key: string; label: string }>) {
  const json = JSON.stringify(roles);
  const existing = await p.$queryRawUnsafe(`SELECT id FROM SiteSettings WHERE id = 'site-settings'`);
  if ((existing as any[]).length > 0) {
    await p.$executeRawUnsafe(`UPDATE SiteSettings SET customClubRoles = ? WHERE id = 'site-settings'`, json);
  } else {
    await p.$executeRawUnsafe(`INSERT INTO SiteSettings (id, permissions, customClubRoles) VALUES ('site-settings', '{}', ?)`, json);
  }
}

export async function GET() {
  try {
    const { prisma } = await import('@/lib/prisma');
    const p = prisma as any;
    await ensureColumn(p);
    const custom = await readCustomRoles(p);
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
    const p = prisma as any;
    await ensureColumn(p);
    const existing = await readCustomRoles(p);

    if (existing.some(r => r.key === cleanKey)) {
      return NextResponse.json({ error: 'A role with this key already exists' }, { status: 400 });
    }

    const updated = [...existing, { key: cleanKey, label: cleanLabel }];
    await writeCustomRoles(p, updated);

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
    const p = prisma as any;
    await ensureColumn(p);
    const existing = await readCustomRoles(p);
    const updated = existing.filter(r => r.key !== key);
    await writeCustomRoles(p, updated);

    return NextResponse.json({ success: true, customRoles: updated });
  } catch (err: any) {
    console.error('[Custom Club Roles] Delete error:', err?.message);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
