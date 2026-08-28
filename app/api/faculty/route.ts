import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { canManageFaculty } from '@/lib/can-manage-faculty';
import { findDepartment, resolveDepartment, getDepartmentDisplayName, normalizeMemberType } from '@/lib/departments';

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

    // All conditions are combined with AND so a department filter no longer gets
    // overwritten when a search term is also present.
    const conditions: any[] = [];
    if (department) {
      const found = findDepartment(department);
      if (found) {
        conditions.push({
          OR: [
            { department: found.department.id },
            { department: found.department.name },
            ...(found.department.folder ? [{ department: found.department.folder }] : []),
            ...(found.department.shortName ? [{ department: found.department.shortName }] : []),
          ],
        });
      } else {
        conditions.push({ department });
      }
    }
    if (memberType) {
      // "staf" is a common typo for "staff" — treat both as the same value.
      const variants = memberType.toLowerCase() === 'staff' || memberType.toLowerCase() === 'staf'
        ? ['staff', 'staf']
        : [memberType];
      conditions.push({ memberType: { in: variants } });
    }
    if (title) conditions.push({ title });
    if (search) {
      const q = search.toLowerCase();
      conditions.push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { shortForm: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { title: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    const where: any = {};
    if (conditions.length > 0) where.AND = conditions;

    const members = await prisma.facultyMember.findMany({
      where,
      orderBy: [{ department: 'asc' }, { sortOrder: 'asc' }],
    });

    // Department values in the DB are not always the canonical id/name/short
    // form (e.g. "Finance" vs "Department of Finance"). Resolve every stored
    // value to its canonical id so members always show under the right
    // department, no matter how they were entered.
    let filtered = members;
    if (department) {
      const canonical = resolveDepartment(department);
      if (canonical && findDepartment(canonical)) {
        filtered = members.filter(m => resolveDepartment(m.department) === canonical);
      }
    }

    return NextResponse.json({ members: filtered });
  } catch {
    return NextResponse.json({ error: 'Failed to load faculty' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const body = await req.json();
    const { department, name, title, email, phone, shortForm } = body;
    const memberType = body.memberType ?? body.type ?? body.role;

    if (!department || !name) {
      return NextResponse.json({ error: 'department and name required' }, { status: 400 });
    }

    const callerEmail = await getUserEmail(req);
    if (!callerEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const storedDept = getDepartmentDisplayName(department);

    const { prisma } = await import('@/lib/prisma');
    const callerProfile = await prisma.profile.findUnique({ where: { userId: callerEmail } });

    if (!(await canManageFaculty(callerEmail, callerProfile?.role || undefined, callerProfile?.department || undefined, storedDept))) {
      return NextResponse.json({ error: 'You do not have permission to add faculty to this department' }, { status: 403 });
    }

    const maxSort = await prisma.facultyMember.aggregate({ where: { department: storedDept }, _max: { sortOrder: true } });

    const member = await prisma.facultyMember.create({
      data: {
        department: storedDept,
        name,
        title: title || null,
        email: email || null,
        phone: phone || null,
        shortForm: shortForm || null,
        memberType: normalizeMemberType(memberType),
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
