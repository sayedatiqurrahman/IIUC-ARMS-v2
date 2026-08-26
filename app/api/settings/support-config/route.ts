import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { hasPermission } from '@/lib/permissions';

async function ensureColumnsExist(p: any): Promise<void> {
  const tableInfo = await p.$queryRawUnsafe(`PRAGMA table_info(SiteSettings)`);
  const existingCols = new Set((tableInfo as any[]).map((c: any) => c.name));
  const needed = [
    { name: 'supportConfig', type: 'TEXT' },
    { name: 'postingChannels', type: 'TEXT' },
  ];
  for (const col of needed) {
    if (!existingCols.has(col.name)) {
      try {
        await p.$executeRawUnsafe(`ALTER TABLE SiteSettings ADD COLUMN ${col.name} ${col.type}`);
      } catch {}
    }
  }
}

export async function GET() {
  try {
    const { prisma } = await import('@/lib/prisma');
    const p = prisma as any;
    await ensureColumnsExist(p);

    const rows = await p.$queryRawUnsafe(
      `SELECT supportConfig, postingChannels FROM SiteSettings WHERE id = 'site-settings'`
    );
    const row = (rows as any[])[0];

    const supportConfig = row?.supportConfig ? (typeof row.supportConfig === 'string' ? JSON.parse(row.supportConfig) : row.supportConfig) : {};
    const postingChannels = row?.postingChannels ? (typeof row.postingChannels === 'string' ? JSON.parse(row.postingChannels) : row.postingChannels) : [];

    return NextResponse.json({ success: true, supportConfig, postingChannels });
  } catch {
    return NextResponse.json({ success: true, supportConfig: {}, postingChannels: [] });
  }
}

export async function PUT(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.admin);
  if (!rl.success) return rl.response!;

  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const callerProfile = await prisma.profile.findUnique({ where: { userId: email } });
    const effectiveRole = config.getEffectiveRole(email, callerProfile?.role);
    if (!(await hasPermission('manageSettings', effectiveRole, callerProfile?.isCR || false, email))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { supportConfig, postingChannels } = body;

    const p = prisma as any;
    await ensureColumnsExist(p);

    // Check if row exists
    const existing = await p.$queryRawUnsafe(`SELECT id FROM SiteSettings WHERE id = 'site-settings'`);

    if ((existing as any[]).length > 0) {
      const updates: string[] = [];
      const values: any[] = [];
      if (supportConfig !== undefined) { updates.push('supportConfig = ?'); values.push(JSON.stringify(supportConfig)); }
      if (postingChannels !== undefined) { updates.push('postingChannels = ?'); values.push(JSON.stringify(postingChannels)); }
      if (updates.length > 0) {
        await p.$executeRawUnsafe(`UPDATE SiteSettings SET ${updates.join(', ')} WHERE id = 'site-settings'`, ...values);
      }
    } else {
      await p.$executeRawUnsafe(
        `INSERT INTO SiteSettings (id, permissions, supportConfig, postingChannels) VALUES ('site-settings', '{}', ?, ?)`,
        JSON.stringify(supportConfig || null),
        JSON.stringify(postingChannels || null),
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to save' }, { status: 500 });
  }
}
