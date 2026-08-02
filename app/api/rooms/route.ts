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
    const where: any = {};
    if (dept) where.department = dept;
    const rooms = await prisma.room.findMany({ where, orderBy: [{ department: 'asc' }, { name: 'asc' }] });
    return NextResponse.json({ success: true, rooms });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to load rooms' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.admin);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const role = config.getEffectiveRole(email);
    if (role !== 'admin' && role !== 'manager' && role !== 'teacher') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { prisma } = await import('@/lib/prisma');
    const body = await req.json();
    const { department, name, capacity, gender, building, floor } = body;
    if (!department || !name) {
      return NextResponse.json({ error: 'department and name required' }, { status: 400 });
    }
    const room = await prisma.room.upsert({
      where: { department_name: { department, name } },
      update: { capacity: capacity || 40, gender: gender || 'both', building, floor },
      create: { department, name, capacity: capacity || 40, gender: gender || 'both', building, floor },
    });
    return NextResponse.json({ success: true, room });
  } catch {
    return NextResponse.json({ error: 'Failed to save room' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.admin);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const role = config.getEffectiveRole(email);
    if (role !== 'admin' && role !== 'manager') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { prisma } = await import('@/lib/prisma');
    const id = req.nextUrl.searchParams.get('id');
    if (id) {
      await prisma.room.delete({ where: { id } });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete room' }, { status: 500 });
  }
}
