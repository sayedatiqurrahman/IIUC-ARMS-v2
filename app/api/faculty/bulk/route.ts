import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

function canManageFaculty(email: string, profileRole?: string, profileDept?: string, targetDept?: string): boolean {
  const role = config.getEffectiveRole(email, profileRole);
  if (role === 'admin') return true;
  if (role === 'manager' && profileDept && profileDept === targetDept) return true;
  if (role === 'teacher') return true;
  return false;
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
      members: Array<{
        department?: string;
        name?: string;
        title?: string;
        email?: string;
        phone?: string;
        shortForm?: string;
        memberType?: string;
      }>;
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

    for (const m of members) {
      if (!m.department || !m.name) {
        errors.push(`Skipped: missing department or name`);
        skipped++;
        continue;
      }

      if (!canManageFaculty(callerEmail, callerProfile?.role || undefined, callerProfile?.department || undefined, m.department)) {
        errors.push(`No permission for dept: ${m.department}`);
        skipped++;
        continue;
      }

      const existing = m.email
        ? await prisma.facultyMember.findFirst({ where: { email: m.email } })
        : null;

      if (existing && mode === 'replace') {
        await prisma.facultyMember.update({
          where: { id: existing.id },
          data: {
            department: m.department,
            name: m.name,
            title: m.title || null,
            phone: m.phone || null,
            shortForm: m.shortForm?.toUpperCase() || null,
            memberType: m.memberType || 'faculty',
          },
        });
        updated++;
      } else if (existing) {
        skipped++;
      } else {
        const maxSort = await prisma.facultyMember.aggregate({
          where: { department: m.department },
          _max: { sortOrder: true },
        });

        await prisma.facultyMember.create({
          data: {
            department: m.department,
            name: m.name,
            title: m.title || null,
            email: m.email || null,
            phone: m.phone || null,
            shortForm: m.shortForm?.toUpperCase() || null,
            memberType: m.memberType || 'faculty',
            sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
          },
        });
        inserted++;
      }
    }

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
