import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { canManageFaculty } from '@/lib/can-manage-faculty';
import { getDepartmentDisplayName, normalizeMemberType } from '@/lib/departments';

interface BulkMember {
  department?: string;
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
  shortForm?: string;
  shortform?: string;
  short?: string;
  memberType?: string;
  membertype?: string;
  type?: string;
  role?: string;
}

function pick<V>(...vals: (V | undefined)[]): V | undefined {
  for (const v of vals) if (v !== undefined && v !== null && v !== '') return v;
  return undefined;
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const callerEmail = await getUserEmail(req);
    if (!callerEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const callerProfile = await prisma.profile.findUnique({ where: { userId: callerEmail } });

    const body = await req.json();
    const { members, mode } = body as {
      members: BulkMember[];
      mode?: 'skip' | 'replace';
    };

    if (!Array.isArray(members) || members.length === 0) {
      return NextResponse.json({ error: 'members array is required' }, { status: 400 });
    }

    if (members.length > 500) {
      return NextResponse.json({ error: 'Maximum 500 members per import' }, { status: 400 });
    }

    let inserted = 0;
    let skipped = 0;
    let updated = 0;
    const errors: string[] = [];
    const affectedDepts = new Set<string>();

    for (const raw of members) {
      const department = pick(raw.department);
      const name = pick(raw.name);
      const title = pick(raw.title);
      const email = pick(raw.email);
      const phone = pick(raw.phone);
      const shortForm = pick(raw.shortForm, raw.shortform, raw.short);
      const memberType = pick(raw.memberType, raw.type, raw.membertype, raw.role);

      if (!department || !name) {
        errors.push(`Skipped: missing department or name`);
        skipped++;
        continue;
      }

      // Store the canonical department name so members match the department
      // dropdown regardless of the spelling the importer used.
      const storedDept = getDepartmentDisplayName(department);
      const storedType = normalizeMemberType(memberType);

      if (!(await canManageFaculty(callerEmail, callerProfile?.role || undefined, callerProfile?.department || undefined, storedDept))) {
        errors.push(`No permission for dept: ${department}`);
        skipped++;
        continue;
      }

      const existing = email
        ? await prisma.facultyMember.findFirst({ where: { email } })
        : null;

      if (existing && mode === 'replace') {
          await prisma.facultyMember.update({
            where: { id: existing.id },
            data: {
              department: storedDept,
              name,
              title: title || null,
              phone: phone || null,
              shortForm: shortForm?.toUpperCase() || null,
              memberType: storedType,
            },
          });
          updated++;
          affectedDepts.add(storedDept);
        } else if (existing) {
          skipped++;
        } else {
        const maxSort = await prisma.facultyMember.aggregate({
          where: { department: storedDept },
          _max: { sortOrder: true },
        });

        await prisma.facultyMember.create({
          data: {
            department: storedDept,
            name,
            title: title || null,
            email: email || null,
            phone: phone || null,
            shortForm: shortForm?.toUpperCase() || null,
            memberType: storedType,
            sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
          },
        });
        inserted++;
        affectedDepts.add(storedDept);
      }
    }

    // Keep the cloud data repo in sync with every affected department.
    try {
      const { mirrorDepartmentToCloud } = await import('@/lib/faculty-data');
      for (const dept of Array.from(affectedDepts)) await mirrorDepartmentToCloud(dept);
    } catch {}

    return NextResponse.json({
      success: true,
      inserted,
      updated,
      skipped,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
      total: members.length,
    });
  } catch {
    return NextResponse.json({ error: 'Bulk import failed' }, { status: 500 });
  }
}
