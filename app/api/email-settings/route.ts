import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { hasPermission } from '@/lib/permissions';
import { mergeEmailSettings } from '@/lib/email-theme';

async function ensureColumnsExist(p: any): Promise<void> {
  const tableInfo = await p.$queryRawUnsafe(`PRAGMA table_info(SiteSettings)`);
  const existingCols = new Set((tableInfo as any[]).map((c: any) => c.name));
  if (!existingCols.has('emailSettings')) {
    try {
      await p.$executeRawUnsafe(`ALTER TABLE SiteSettings ADD COLUMN emailSettings TEXT`);
    } catch {}
  }
}

async function read(ctx: any): Promise<EmailSettingsShape> {
  const p = ctx as any;
  await ensureColumnsExist(p);
  const rows = await p.$queryRawUnsafe(`SELECT emailSettings FROM SiteSettings WHERE id = 'site-settings'`);
  const row = (rows as any[])[0];
  const raw = row?.emailSettings;
  let parsed: any = null;
  if (raw) {
    try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { parsed = null; }
  }
  return mergeEmailSettings(parsed);
}

interface EmailSettingsShape {
  theme?: any;
  templates?: any[];
  defaultTemplate?: string;
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.admin);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const effectiveRole = config.getEffectiveRole(email);
    if (effectiveRole !== 'admin' && effectiveRole !== 'manager') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { prisma } = await import('@/lib/prisma');
    const settings = await read(prisma as any);
    return NextResponse.json({ success: true, emailSettings: settings });
  } catch (err: any) {
    console.error('[Email Settings] GET error:', err?.message);
    return NextResponse.json({ error: 'Failed to load email settings' }, { status: 500 });
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
    const cleaned = mergeEmailSettings(body.emailSettings || null);

    const p = prisma as any;
    await ensureColumnsExist(p);

    const existing = await p.$queryRawUnsafe(`SELECT id FROM SiteSettings WHERE id = 'site-settings'`);
    if ((existing as any[]).length > 0) {
      await p.$executeRawUnsafe(`UPDATE SiteSettings SET emailSettings = ? WHERE id = 'site-settings'`, JSON.stringify(cleaned));
    } else {
      await p.$executeRawUnsafe(
        `INSERT INTO SiteSettings (id, permissions, emailSettings) VALUES ('site-settings', '{}', ?)`,
        JSON.stringify(cleaned),
      );
    }

    return NextResponse.json({ success: true, emailSettings: cleaned });
  } catch (err: any) {
    console.error('[Email Settings] PUT error:', err?.message);
    return NextResponse.json({ error: err?.message || 'Failed to save' }, { status: 500 });
  }
}