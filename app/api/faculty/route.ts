import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { canManageFaculty } from '@/lib/can-manage-faculty';
import { findDepartment } from '@/lib/departments';

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const url = new URL(req.url);
    const department = url.searchParams.get('department');
    const search = url.searchParams.get('search') || '';
    const memberType = url.searchParams.get('memberType') || url.searchParams.get('role');
    const title = url.searchParams.get('title') || '';
    const myClaim = url.searchParams.get('myClaim');

    const { prisma } = await import('@/lib/prisma');

    if (myClaim) {
      const email = await getUserEmail(req);
      if (!email) return NextResponse.json({ members: [] });
      const claimed = await prisma.facultyMember.findFirst({ where: { claimedBy: email } });
      return NextResponse.json({ members: claimed ? [claimed] : [] });
    }

    const where: any = {};
    if (department) {
      const found = findDepartment(department);
      if (found) {
        where.OR = [
          { department: found.department.id },
          { department: found.department.name },
          ...(found.department.folder ? [{ department: found.department.folder }] : []),
          ...(found.department.shortName ? [{ department: found.department.shortName }] : []),
        ];
      } else {
        where.department = department;
      }
    }
    if (memberType) where.memberType = memberType;
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
  } catch {
    return NextResponse.json({ error: 'Failed to load faculty' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
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

    if (!(await canManageFaculty(callerEmail, callerProfile?.role || undefined, callerProfile?.department || undefined, department))) {
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
  } catch {
    return NextResponse.json({ error: 'Failed to create' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const body = await req.json();
    const { id, name, title, email, phone, shortForm, memberType, isVisible } = body;

    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const callerEmail = await getUserEmail(req);
    if (!callerEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const callerProfile = await prisma.profile.findUnique({ where: { userId: callerEmail } });
    const target = await prisma.facultyMember.findUnique({ where: { id } });
    if (!target) return NextResponse.json({ error: 'Faculty member not found' }, { status: 404 });

    if (!(await canManageFaculty(callerEmail, callerProfile?.role || undefined, callerProfile?.department || undefined, target.department)) && target.claimedBy !== callerEmail) {
      return NextResponse.json({ error: 'You do not have permission to edit this faculty member' }, { status: 403 });
    }

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (title !== undefined) data.title = title || null;
    if (email !== undefined) data.email = email || null;
    if (phone !== undefined) data.phone = phone || null;
    if (shortForm !== undefined) data.shortForm = shortForm || null;
    if (memberType !== undefined) data.memberType = memberType;
    if (isVisible !== undefined) data.isVisible = isVisible;

    const updated = await prisma.facultyMember.update({ where: { id }, data });
    return NextResponse.json({ success: true, member: updated });
  } catch {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const body = await req.json();
    const { ids, isVisible, department, all } = body as {
      ids?: string[];
      isVisible?: boolean;
      department?: string;
      all?: boolean;
    };

    if (isVisible === undefined) {
      return NextResponse.json({ error: 'isVisible required' }, { status: 400 });
    }

    const callerEmail = await getUserEmail(req);
    if (!callerEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const callerProfile = await prisma.profile.findUnique({ where: { userId: callerEmail } });

    const where: any = {};
    if (all) {
      if (config.getEffectiveRole(callerEmail, callerProfile?.role || undefined) !== 'admin') {
        return NextResponse.json({ error: 'Only admins can toggle all faculty' }, { status: 403 });
      }
    } else if (department) {
      if (!(await canManageFaculty(callerEmail, callerProfile?.role || undefined, callerProfile?.department || undefined, department))) {
        return NextResponse.json({ error: 'No permission for this department' }, { status: 403 });
      }
      where.department = department;
    } else if (ids && ids.length > 0) {
      const targets = await prisma.facultyMember.findMany({
        where: { id: { in: ids } },
        select: { id: true, department: true },
      });
      for (const t of targets) {
        if (!(await canManageFaculty(callerEmail, callerProfile?.role || undefined, callerProfile?.department || undefined, t.department))) {
          return NextResponse.json({ error: 'No permission for this department' }, { status: 403 });
        }
      }
      where.id = { in: ids };
    } else {
      return NextResponse.json({ error: 'Provide ids, department, or all flag' }, { status: 400 });
    }

    const result = await prisma.facultyMember.updateMany({ where, data: { isVisible } });
    return NextResponse.json({ success: true, count: result.count });
  } catch {
    return NextResponse.json({ error: 'Failed to update visibility' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
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

    if (!(await canManageFaculty(callerEmail, callerProfile?.role || undefined, callerProfile?.department || undefined, target.department))) {
      return NextResponse.json({ error: 'You do not have permission to delete this faculty member' }, { status: 403 });
    }

    await prisma.facultyMember.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
