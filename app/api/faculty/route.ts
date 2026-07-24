import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';

function canManageFaculty(email: string, profileRole?: string, profileDept?: string, targetDept?: string): boolean {
  const role = config.getEffectiveRole(email, profileRole);
  if (role === 'admin') return true;
  if (role === 'manager' && profileDept && profileDept === targetDept) return true;
  if (role === 'teacher') return true;
  return false;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const department = url.searchParams.get('department');
    const search = url.searchParams.get('search') || '';
    const role = url.searchParams.get('role');
    const title = url.searchParams.get('title') || '';

    const { prisma } = await import('@/lib/prisma');

    const where: any = {};
    if (department) where.department = department;
    if (role) where.memberType = role;
    if (title) where.title = title;
    if (search) {
      const q = search.toLowerCase();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { shortForm: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { title: { contains: q, mode: 'insensitive' } },
      ];
    }

    const members = await prisma.facultyMember.findMany({
      where,
      orderBy: [{ department: 'asc' }, { sortOrder: 'asc' }],
    });

    return NextResponse.json({ members });
  } catch (err: any) {
    console.error('[Faculty] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { department, name, title, email, phone, shortForm, memberType } = body;

    if (!department || !name) {
      return NextResponse.json({ error: 'department and name required' }, { status: 400 });
    }

    const callerEmail = await getUserEmail(req);
    if (!callerEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const callerProfile = await prisma.profile.findUnique({ where: { userId: callerEmail } });

    if (!canManageFaculty(callerEmail, callerProfile?.role || undefined, callerProfile?.department || undefined, department)) {
      return NextResponse.json({ error: 'You do not have permission to add faculty to this department' }, { status: 403 });
    }

    const maxSort = await prisma.facultyMember.aggregate({ where: { department }, _max: { sortOrder: true } });

    const member = await prisma.facultyMember.create({
      data: {
        department,
        name,
        title: title || null,
        email: email || null,
        phone: phone || null,
        shortForm: shortForm || null,
        memberType: memberType || 'faculty',
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
    });

    return NextResponse.json({ success: true, member });
  } catch (err: any) {
    console.error('[Faculty] Create error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, title, email, phone, shortForm, memberType } = body;

    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const callerEmail = await getUserEmail(req);
    if (!callerEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const callerProfile = await prisma.profile.findUnique({ where: { userId: callerEmail } });
    const target = await prisma.facultyMember.findUnique({ where: { id } });
    if (!target) return NextResponse.json({ error: 'Faculty member not found' }, { status: 404 });

    if (!canManageFaculty(callerEmail, callerProfile?.role || undefined, callerProfile?.department || undefined, target.department)) {
      return NextResponse.json({ error: 'You do not have permission to edit this faculty member' }, { status: 403 });
    }

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (title !== undefined) data.title = title || null;
    if (email !== undefined) data.email = email || null;
    if (phone !== undefined) data.phone = phone || null;
    if (shortForm !== undefined) data.shortForm = shortForm || null;
    if (memberType !== undefined) data.memberType = memberType;

    const updated = await prisma.facultyMember.update({ where: { id }, data });
    return NextResponse.json({ success: true, member: updated });
  } catch (err: any) {
    console.error('[Faculty] Update error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const callerEmail = await getUserEmail(req);
    if (!callerEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const callerProfile = await prisma.profile.findUnique({ where: { userId: callerEmail } });
    const target = await prisma.facultyMember.findUnique({ where: { id } });
    if (!target) return NextResponse.json({ error: 'Faculty member not found' }, { status: 404 });

    if (!canManageFaculty(callerEmail, callerProfile?.role || undefined, callerProfile?.department || undefined, target.department)) {
      return NextResponse.json({ error: 'You do not have permission to delete this faculty member' }, { status: 403 });
    }

    await prisma.facultyMember.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Faculty] Delete error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
