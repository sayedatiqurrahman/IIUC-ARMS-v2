import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

function canReviewFaculty(email: string, profileRole?: string): boolean {
  const role = config.getEffectiveRole(email, profileRole);
  return role === 'admin' || role === 'teacher' || role === 'manager';
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const callerEmail = await getUserEmail(req);
    if (!callerEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const callerProfile = await prisma.profile.findUnique({ where: { userId: callerEmail } });
    const url = new URL(req.url);
    const status = url.searchParams.get('status') || 'pending';

    if (canReviewFaculty(callerEmail, callerProfile?.role || undefined)) {
      const where: any = {};
      if (status !== 'all') where.status = status;
      const requests = await prisma.facultyRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return NextResponse.json({ requests });
    }

    const requests = await prisma.facultyRequest.findMany({
      where: { requesterId: callerEmail, status },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return NextResponse.json({ requests });
  } catch {
    return NextResponse.json({ error: 'Failed to load requests' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const callerEmail = await getUserEmail(req);
    if (!callerEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { department, name, title, email, phone, shortForm, memberType, notes } = body;

    if (!department || !name) {
      return NextResponse.json({ error: 'department and name required' }, { status: 400 });
    }

    const { prisma } = await import('@/lib/prisma');
    const request = await prisma.facultyRequest.create({
      data: {
        requesterId: callerEmail,
        department,
        name,
        title: title || null,
        email: email || null,
        phone: phone || null,
        shortForm: shortForm || null,
        memberType: memberType || 'faculty',
        notes: notes || null,
      },
    });

    return NextResponse.json({ success: true, request });
  } catch {
    return NextResponse.json({ error: 'Failed to submit request' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const callerEmail = await getUserEmail(req);
    if (!callerEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const callerProfile = await prisma.profile.findUnique({ where: { userId: callerEmail } });

    if (!canReviewFaculty(callerEmail, callerProfile?.role || undefined)) {
      return NextResponse.json({ error: 'Only admin/teacher/manager can review requests' }, { status: 403 });
    }

    const body = await req.json();
    const { requestId, action } = body as { requestId: string; action: 'approve' | 'reject' };

    if (!requestId || !action) {
      return NextResponse.json({ error: 'requestId and action required' }, { status: 400 });
    }

    const request = await prisma.facultyRequest.findUnique({ where: { id: requestId } });
    if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    if (request.status !== 'pending') {
      return NextResponse.json({ error: 'Request already reviewed' }, { status: 400 });
    }

    if (action === 'approve') {
      const existing = request.email
        ? await prisma.facultyMember.findFirst({ where: { email: request.email } })
        : null;

      if (!existing) {
        const maxSort = await prisma.facultyMember.aggregate({
          where: { department: request.department },
          _max: { sortOrder: true },
        });

        await prisma.facultyMember.create({
          data: {
            department: request.department,
            name: request.name,
            title: request.title,
            email: request.email,
            phone: request.phone,
            shortForm: request.shortForm,
            memberType: request.memberType,
            sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
          },
        });
      }
    }

    await prisma.facultyRequest.update({
      where: { id: requestId },
      data: {
        status: action === 'approve' ? 'approved' : 'rejected',
        reviewedBy: callerEmail,
        reviewedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to review request' }, { status: 500 });
  }
}
