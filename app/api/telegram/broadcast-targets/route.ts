import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export interface BroadcastTarget {
  id: string;
  label: string;
  chatId: string;
  type: 'channel' | 'group' | 'personal';
  enabled: boolean;
}

async function getTargets(): Promise<BroadcastTarget[]> {
  const { prisma } = await import('@/lib/prisma');
  const settings = await prisma.siteSettings.findUnique({ where: { id: 'site-settings' } });
  return (settings?.broadcastTargets as unknown as BroadcastTarget[]) || [];
}

async function saveTargets(targets: BroadcastTarget[]) {
  const { prisma } = await import('@/lib/prisma');
  await prisma.siteSettings.upsert({
    where: { id: 'site-settings' },
    update: { broadcastTargets: targets },
    create: { id: 'site-settings', broadcastTargets: targets, permissions: {} },
  });
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;

  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const role = config.getEffectiveRole(email);
    if (role !== 'admin' && !config.ownerEmails.includes(email.toLowerCase())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const targets = await getTargets();
    return NextResponse.json({ success: true, targets });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load targets' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.admin);
  if (!rl.success) return rl.response!;

  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const isOwner = config.ownerEmails.includes(email.toLowerCase());
    const role = config.getEffectiveRole(email);
    if (!isOwner && role !== 'admin') {
      return NextResponse.json({ error: 'Only admin/owner can manage targets' }, { status: 403 });
    }

    const body = await req.json();
    const { action, target } = body;

    const targets = await getTargets();

    if (action === 'add') {
      if (!target?.label?.trim() || !target?.chatId?.trim()) {
        return NextResponse.json({ error: 'Label and Chat ID are required' }, { status: 400 });
      }
      const newTarget: BroadcastTarget = {
        id: `bt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        label: target.label.trim(),
        chatId: target.chatId.trim(),
        type: target.type || 'group',
        enabled: target.enabled !== false,
      };
      targets.push(newTarget);
      await saveTargets(targets);
      return NextResponse.json({ success: true, targets, added: newTarget });
    }

    if (action === 'update') {
      if (!target?.id) {
        return NextResponse.json({ error: 'Target id required' }, { status: 400 });
      }
      const idx = targets.findIndex(t => t.id === target.id);
      if (idx === -1) return NextResponse.json({ error: 'Target not found' }, { status: 404 });
      targets[idx] = { ...targets[idx], ...target, id: targets[idx].id };
      await saveTargets(targets);
      return NextResponse.json({ success: true, targets });
    }

    if (action === 'delete') {
      if (!target?.id) {
        return NextResponse.json({ error: 'Target id required' }, { status: 400 });
      }
      const filtered = targets.filter(t => t.id !== target.id);
      if (filtered.length === targets.length) {
        return NextResponse.json({ error: 'Target not found' }, { status: 404 });
      }
      await saveTargets(filtered);
      return NextResponse.json({ success: true, targets: filtered });
    }

    if (action === 'toggle') {
      if (!target?.id) {
        return NextResponse.json({ error: 'Target id required' }, { status: 400 });
      }
      const idx = targets.findIndex(t => t.id === target.id);
      if (idx === -1) return NextResponse.json({ error: 'Target not found' }, { status: 404 });
      targets[idx].enabled = !targets[idx].enabled;
      await saveTargets(targets);
      return NextResponse.json({ success: true, targets });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to save target' }, { status: 500 });
  }
}
