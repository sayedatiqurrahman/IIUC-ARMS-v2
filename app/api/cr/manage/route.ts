import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

// GET: list students in CR's department+semester
export async function GET(req: NextRequest) {
  try {
    const { prisma } = await import('@/lib/prisma');
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    if (!profile?.isCR) return NextResponse.json({ error: 'Not a CR' }, { status: 403 });

    const dept = profile.department;
    const sem = profile.semester;
    if (!dept) return NextResponse.json({ error: 'No department set' }, { status: 400 });

    const where: any = { department: dept, role: 'student' };
    if (sem) where.semester = sem;

    const students = await prisma.profile.findMany({
      where,
      select: { userId: true, name: true, email: true, shortForm: true, semester: true, isCR: true, isACR: true },
      orderBy: { name: 'asc' },
    });

    const currentACR = students.find(s => s.isACR);

    return NextResponse.json({
      myDepartment: dept,
      mySemester: sem,
      students,
      currentACR: currentACR || null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: assign ACR or transfer CR role
export async function POST(req: NextRequest) {
  try {
    const { prisma } = await import('@/lib/prisma');
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    if (!profile?.isCR) return NextResponse.json({ error: 'Not a CR' }, { status: 403 });

    const body = await req.json();
    const { action, targetEmail } = body;

    if (!targetEmail) return NextResponse.json({ error: 'targetEmail required' }, { status: 400 });

    const target = await prisma.profile.findUnique({ where: { userId: targetEmail } });
    if (!target) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    // Verify same department
    if (target.department !== profile.department) {
      return NextResponse.json({ error: 'Student must be in your department' }, { status: 400 });
    }

    // Verify same semester if both have semester set
    if (profile.semester && target.semester && profile.semester !== target.semester) {
      return NextResponse.json({ error: 'Student must be in your semester' }, { status: 400 });
    }

    if (action === 'assignACR') {
      // Remove current ACR first
      await prisma.profile.updateMany({ where: { department: profile.department, isACR: true }, data: { isACR: false } });
      // Set new ACR
      await prisma.profile.update({ where: { userId: targetEmail }, data: { isACR: true } });
      return NextResponse.json({ success: true, message: `${target.name || targetEmail} is now ACR` });
    }

    if (action === 'removeACR') {
      await prisma.profile.update({ where: { userId: targetEmail }, data: { isACR: false } });
      return NextResponse.json({ success: true, message: `ACR removed from ${target.name || targetEmail}` });
    }

    if (action === 'transferCR') {
      // Transfer CR role: self loses CR, target gains CR and loses ACR
      await prisma.profile.update({ where: { userId: email }, data: { isCR: false } });
      await prisma.profile.update({ where: { userId: targetEmail }, data: { isCR: true, isACR: false } });
      return NextResponse.json({ success: true, message: `CR role transferred to ${target.name || targetEmail}` });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
