import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { ALL_PERMISSION_ACTIONS } from '@/components/admin/constants';
import { getCustomRoles, saveCustomRoles, type CustomRole } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const BUILT_IN_ROLES = new Set(['admin', 'manager', 'teacher', 'student', 'user', 'cr', 'acr', 'external']);
const ALL_ACTION_KEYS = new Set(ALL_PERMISSION_ACTIONS.map(a => a.key));

async function requireAdmin(req: NextRequest): Promise<{ error?: NextResponse }> {
  const email = await getUserEmail(req);
  if (!email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const role = config.getEffectiveRole(email);
  if (role !== 'admin') {
    return { error: NextResponse.json({ error: 'Only admins can manage roles' }, { status: 403 }) };
  }
  return {};
}

function sanitizeRole(raw: any): CustomRole | null {
  if (!raw || typeof raw !== 'object') return null;
  const key = typeof raw.key === 'string' ? raw.key.trim().toLowerCase().replace(/\s+/g, '-') : '';
  const label = typeof raw.label === 'string' ? raw.label.trim().slice(0, 40) : '';
  const icon = typeof raw.icon === 'string' && raw.icon ? raw.icon : 'fa-user-tag';
  const color = typeof raw.color === 'string' && raw.color ? raw.color : 'text-blue-400';
  if (!key || !/^[a-z0-9][a-z0-9-]{0,29}$/.test(key)) return null;
  if (BUILT_IN_ROLES.has(key)) return null;
  if (!label) return null;
  const permissions = Array.isArray(raw.permissions)
    ? raw.permissions.filter((p: any) => typeof p === 'string' && ALL_ACTION_KEYS.has(p))
    : [];
  return { key, label, icon, color, permissions };
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.admin);
  if (!rl.success) return rl.response!;
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;
  try {
    const roles = await getCustomRoles();
    return NextResponse.json({ success: true, roles });
  } catch {
    return NextResponse.json({ error: 'Failed to load roles' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.admin);
  if (!rl.success) return rl.response!;
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;
  try {
    const body = await req.json();
    const role = sanitizeRole(body.role || body);
    if (!role) {
      return NextResponse.json({ error: 'Invalid role. Key must be lowercase (a-z, 0-9, dashes) and not a built-in role name.' }, { status: 400 });
    }
    const roles = await getCustomRoles();
    const idx = roles.findIndex(r => r.key === role.key);
    if (idx >= 0) {
      roles[idx] = role;
    } else {
      roles.push(role);
    }
    await saveCustomRoles(roles);
    return NextResponse.json({ success: true, message: idx >= 0 ? `Role "${role.label}" updated` : `Role "${role.label}" created`, role });
  } catch {
    return NextResponse.json({ error: 'Failed to save role' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.admin);
  if (!rl.success) return rl.response!;
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;
  try {
    const url = new URL(req.url);
    const key = (url.searchParams.get('key') || '').trim();
    if (!key || BUILT_IN_ROLES.has(key)) {
      return NextResponse.json({ error: 'Invalid role key' }, { status: 400 });
    }
    const roles = await getCustomRoles();
    const next = roles.filter(r => r.key !== key);
    if (next.length === roles.length) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }
    await saveCustomRoles(next);
    return NextResponse.json({ success: true, message: `Role deleted` });
  } catch {
    return NextResponse.json({ error: 'Failed to delete role' }, { status: 500 });
  }
}
