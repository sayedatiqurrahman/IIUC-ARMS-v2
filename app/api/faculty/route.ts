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

    // Public directory reads come from the cloud data repo (GitHub) once a full
    // backup exists — the directory no longer touches the database. A 60s cache
    // keeps repeated page loads fast. Falls back to the DB before the first
    // complete cloud backup has been written.
    {
      const { loadCloudFacultyIndex } = await import('@/lib/faculty-data');
      const cloud = await loadCloudFacultyIndex();
      if (cloud.complete && cloud.members.length > 0) {
        const rows = cloud.members.map(m => ({
          id: m.id,
          department: m._department ?? '',
          name: m.name,
          title: m.title ?? null,
          email: m.email ?? null,
          phone: m.phone ?? null,
          shortForm: m.shortForm ?? null,
          memberType: m.memberType || 'faculty',
          isCR: m.isCR || false,
          sortOrder: m.sortOrder ?? 0,
          isVisible: m.isVisible ?? false,
          claimedBy: m.claimedBy ?? null,
        }));

        let filtered = rows;
        if (department) {
          const canonical = resolveDepartment(department);
          filtered = findDepartment(canonical)
            ? rows.filter(m => resolveDepartment(m.department) === canonical)
            : rows.filter(m => m.department === department);
        }
        if (memberType) {
          // "staf" is a common typo for "staff" — treat both as the same value.
          const variants = memberType.toLowerCase() === 'staff' || memberType.toLowerCase() === 'staf'
            ? ['staff', 'staf']
            : [memberType.toLowerCase()];
          filtered = filtered.filter(m => variants.includes((m.memberType || '').toLowerCase()));
        }
        if (title) filtered = filtered.filter(m => m.title === title);
        if (search) {
          const q = search.toLowerCase();
          filtered = filtered.filter(m =>
            (m.name || '').toLowerCase().includes(q) ||
            (m.shortForm || '').toLowerCase().includes(q) ||
            (m.email || '').toLowerCase().includes(q) ||
            (m.title || '').toLowerCase().includes(q)
          );
        }

        filtered.sort((a, b) => a.department.localeCompare(b.department) || a.sortOrder - b.sortOrder);
        return NextResponse.json({ members: filtered });
      }
    }

    // All conditions are combined with AND so a department filter no longer gets
    // overwritten when a search term is also present.
    const conditions: any[] = [];
    // NOTE: the department filter is intentionally NOT applied in SQL. Stored
    // department values look nothing like canonical ids/names/short forms
    // (e.g. "Economics and Banking", "Center for General Education"), so any
    // exact-match SQL condition prunes those rows before the resolver below can
    // fix them. We fetch the matching rows for the other conditions and filter
    // by department in memory over the full result instead.
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
      } else {
        filtered = members.filter(m => m.department === department);
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

    // Keep the cloud data repo in sync so the directory stays available even
    // without the database.
    try { const { mirrorDepartmentToCloud } = await import('@/lib/faculty-data'); await mirrorDepartmentToCloud(storedDept); } catch {}

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

    // Keep the cloud data repo in sync.
    try { const { mirrorDepartmentToCloud } = await import('@/lib/faculty-data'); await mirrorDepartmentToCloud(target.department); } catch {}

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

    let targets: { id: string; department: string }[] = [];
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
      targets = await prisma.facultyMember.findMany({
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

    // Keep the cloud data repo in sync (visibility flag lives on each member).
    try {
      const { mirrorDepartmentToCloud, mirrorAllDepartmentsToCloud } = await import('@/lib/faculty-data');
      if (department) await mirrorDepartmentToCloud(department);
      else if (ids && ids.length > 0) for (const t of targets) await mirrorDepartmentToCloud(t.department);
      else if (all) await mirrorAllDepartmentsToCloud();
    } catch {}

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

    // Keep the cloud data repo in sync.
    try { const { mirrorDepartmentToCloud } = await import('@/lib/faculty-data'); await mirrorDepartmentToCloud(target.department); } catch {}

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
