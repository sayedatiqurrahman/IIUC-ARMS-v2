import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { hasPermission } from '@/lib/permissions';

export async function GET() {
  try {
    const { prisma } = await import('@/lib/prisma');
    const settings = await prisma.siteSettings.findUnique({ where: { id: 'site-settings' } });
    const raw = (settings as any)?.supportConfig;
    const supportConfig = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
    const postingRaw = (settings as any)?.postingChannels;
    const postingChannels = postingRaw ? (typeof postingRaw === 'string' ? JSON.parse(postingRaw) : postingRaw) : [];
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

    // Use raw SQL since these fields are new and Prisma client may not be regenerated yet
    const p = prisma as any;
    const existing = await p.siteSettings.findUnique({ where: { id: 'site-settings' } });

    if (existing) {
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
