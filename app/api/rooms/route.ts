import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;
  try {
    const { prisma } = await import('@/lib/prisma');
    const dept = req.nextUrl.searchParams.get('department');
    const where: any = { isActive: true };
    if (dept) where.department = dept;
    const rooms = await prisma.room.findMany({ where, orderBy: [{ department: 'asc' }, { name: 'asc' }] });
    return NextResponse.json({ success: true, rooms });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to load rooms' }, { status: 500 });
  }
}

async function checkPermission(req: NextRequest) {
  const email = await getUserEmail(req);
  if (!email) return { ok: false, error: 'Unauthorized' };
  const { prisma } = await import('@/lib/prisma');
  const profile = await prisma.profile.findUnique({ where: { userId: email } });
  const effective = config.getEffectiveRole(email, profile?.role);
  const customPerms = (profile?.customPermissions || {}) as Record<string, boolean>;
  if (customPerms.manageRooms === true) return { ok: true, effective };
  if (effective !== 'admin' && effective !== 'manager' && effective !== 'teacher') {
    return { ok: false, error: 'Forbidden' };
  }
  return { ok: true, effective };
}

function parseRoomFields(body: any) {
  const { department, name, capacity, gender, building, floor, numberOfColumns, chairsPerColumn } = body;
  return {
    department, name,
    capacity: capacity || 40,
    gender: gender || 'both',
    building: building || null,
    floor: floor || null,
    numberOfColumns: numberOfColumns ? Number(numberOfColumns) : null,
    chairsPerColumn: chairsPerColumn ? Number(chairsPerColumn) : null,
  };
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.admin);
  if (!rl.success) return rl.response!;
  try {
    const perm = await checkPermission(req);
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.error === 'Unauthorized' ? 401 : 403 });
    const { prisma } = await import('@/lib/prisma');
    const body = await req.json();
    const fields = parseRoomFields(body);
    if (!fields.department || !fields.name) {
      return NextResponse.json({ error: 'department and name required' }, { status: 400 });
    }
    const room = await prisma.room.upsert({
      where: { department_name: { department: fields.department, name: fields.name } },
      update: fields,
      create: fields,
    });
    return NextResponse.json({ success: true, room });
  } catch {
    return NextResponse.json({ error: 'Failed to save room' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.admin);
  if (!rl.success) return rl.response!;
  try {
    const perm = await checkPermission(req);
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.error === 'Unauthorized' ? 401 : 403 });
    const { prisma } = await import('@/lib/prisma');
    const body = await req.json();
    const { id, ...data } = body;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    if (data.numberOfColumns !== undefined) data.numberOfColumns = data.numberOfColumns ? Number(data.numberOfColumns) : null;
    if (data.chairsPerColumn !== undefined) data.chairsPerColumn = data.chairsPerColumn ? Number(data.chairsPerColumn) : null;
    if (data.capacity !== undefined) data.capacity = Number(data.capacity) || 40;
    if (data.building !== undefined && !data.building) data.building = null;
    if (data.floor !== undefined && !data.floor) data.floor = null;
    const room = await prisma.room.update({ where: { id }, data });
    return NextResponse.json({ success: true, room });
  } catch {
    return NextResponse.json({ error: 'Failed to update room' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.admin);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { prisma } = await import('@/lib/prisma');
    const id = req.nextUrl.searchParams.get('id');
    if (id) {
      await prisma.room.update({ where: { id }, data: { isActive: false } });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete room' }, { status: 500 });
  }
}
