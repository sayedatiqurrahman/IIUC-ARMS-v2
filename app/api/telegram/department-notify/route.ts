import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

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

    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'history';

    if (action === 'history') {
      const { getNotificationHistory } = await import('@/lib/telegram');
      const department = url.searchParams.get('department') || undefined;
      const limit = parseInt(url.searchParams.get('limit') || '30');
      const history = await getNotificationHistory({ department, limit });
      return NextResponse.json({ success: true, history });
    }

    if (action === 'connected-count') {
      const { getConnectedUsersCount, getDepartmentConnectedUsersCount } = await import('@/lib/telegram');
      const total = await getConnectedUsersCount();
      const allDepts = ['CSE', 'EEE', 'BBA', 'ENG', 'ARCH', 'LLB', 'PHARM'];
      const byDept = await getDepartmentConnectedUsersCount(allDepts);
      return NextResponse.json({ success: true, total, byDept });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    console.error('[TG DeptNotify] GET error:', err?.message);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
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
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { departments, message, title, semester } = body;

    if (!departments || !Array.isArray(departments) || departments.length === 0) {
      return NextResponse.json({ error: 'Select at least one department' }, { status: 400 });
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }
    if (message.length > 2000) {
      return NextResponse.json({ error: 'Message too long (max 2000 chars)' }, { status: 400 });
    }

    const { sendDepartmentNotifications } = await import('@/lib/telegram');
    const label = departments.includes('ALL') ? 'All Departments' : departments.join(', ');
    const result = await sendDepartmentNotifications(departments, message.trim(), {
      type: 'admin_broadcast',
      title: title?.trim() || `Admin: ${label}`,
      sentBy: email,
      semester: semester || undefined,
    });

    return NextResponse.json({
      success: true,
      sent: result.sent,
      failed: result.failed,
      skipped: result.skipped,
      message: `Sent to ${result.sent} users${result.failed > 0 ? ` (${result.failed} failed)` : ''}`,
    });
  } catch (err: any) {
    console.error('[TG DeptNotify] POST error:', err?.message);
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
  }
}
