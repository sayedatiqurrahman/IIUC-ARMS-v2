import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { hasPermission } from '@/lib/permissions';

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { prisma } = await import('@/lib/prisma');
    const dept = req.nextUrl.searchParams.get('department');
    const where: any = {};
    if (dept) where.department = dept;
    const batches = await prisma.batch.findMany({ where, orderBy: { createdAt: 'desc' } });
    const batchIds = batches.map(b => b.id);
    const students = batchIds.length > 0 ? await prisma.batchStudent.findMany({ where: { batchId: { in: batchIds } }, orderBy: { universityId: 'asc' } }) : [];
    const studentsByBatch: Record<string, any[]> = {};
    for (const s of students) {
      if (!studentsByBatch[s.batchId]) studentsByBatch[s.batchId] = [];
      studentsByBatch[s.batchId].push(s);
    }
    const result = batches.map(b => ({ ...b, students: studentsByBatch[b.id] || [], studentCount: (studentsByBatch[b.id] || []).length }));
    return NextResponse.json({ success: true, batches: result });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to load batches' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.admin);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    const effective = config.getEffectiveRole(email, profile?.role);
    const isCR = profile?.isCR || false;
    const isACR = profile?.isACR || false;
    if (!(await hasPermission('manageBatches', effective, isCR || isACR, email))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await req.json();
    const { action } = body;

    if (action === 'createBatch') {
      const { department, name, session, startSemester, idRange } = body;
      if (!department || !name || !session) {
        return NextResponse.json({ error: 'department, name, session required' }, { status: 400 });
      }
      const startDate = new Date();
      const targetEndDate = new Date(startDate);
      targetEndDate.setFullYear(targetEndDate.getFullYear() + 4);
      targetEndDate.setMonth(targetEndDate.getMonth() + 6);
      const batch = await prisma.batch.create({
        data: { department, name, session, idRange: idRange || null, startSemester: startSemester || '1st-semister', currentSemester: startSemester || '1st-semister', targetEndDate },
      });
      return NextResponse.json({ success: true, batch });
    }

    if (action === 'updateBatch') {
      const { batchId, name, session, currentSemester, isActive, isGraduated, idRange } = body;
      if (!batchId) return NextResponse.json({ error: 'batchId required' }, { status: 400 });
      const data: any = {};
      if (name !== undefined) data.name = name;
      if (session !== undefined) data.session = session;
      if (currentSemester !== undefined) data.currentSemester = currentSemester;
      if (isActive !== undefined) data.isActive = isActive;
      if (isGraduated !== undefined) { data.isGraduated = isGraduated; if (isGraduated) data.isActive = false; }
      if (idRange !== undefined) data.idRange = idRange || null;
      const batch = await prisma.batch.update({ where: { id: batchId }, data });
      return NextResponse.json({ success: true, batch });
    }

    if (action === 'deleteBatch') {
      const { batchId } = body;
      if (!batchId) return NextResponse.json({ error: 'batchId required' }, { status: 400 });
      await prisma.batchStudent.deleteMany({ where: { batchId } });
      await prisma.batch.delete({ where: { id: batchId } });
      return NextResponse.json({ success: true });
    }

    if (action === 'addStudent') {
      const { batchId, email: studentEmail, universityId, originalId, name, isReAdmission } = body;
      if (!batchId || !studentEmail || !universityId) {
        return NextResponse.json({ error: 'batchId, email, universityId required' }, { status: 400 });
      }
      const student = await prisma.batchStudent.upsert({
        where: { batchId_universityId: { batchId, universityId } },
        update: { email: studentEmail, originalId, name, isReAdmission: !!isReAdmission },
        create: { batchId, email: studentEmail, universityId, originalId, name, isReAdmission: !!isReAdmission },
      });
      const batch = await prisma.batch.findUnique({ where: { id: batchId } });
      if (batch) {
        await prisma.profile.upsert({
          where: { userId: studentEmail },
          create: { userId: studentEmail, email: studentEmail, batchId, universityId, department: batch.department, semester: batch.currentSemester },
          update: { batchId, universityId, department: batch.department, semester: batch.currentSemester },
        });
      }
      return NextResponse.json({ success: true, student });
    }

    if (action === 'removeStudent') {
      const { studentId } = body;
      if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });
      await prisma.batchStudent.delete({ where: { id: studentId } });
      return NextResponse.json({ success: true });
    }

    if (action === 'updateStudent') {
      const { studentId, universityId, originalId, name, isReAdmission } = body;
      if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });
      const data: any = {};
      if (universityId !== undefined) data.universityId = universityId;
      if (originalId !== undefined) data.originalId = originalId;
      if (name !== undefined) data.name = name;
      if (isReAdmission !== undefined) data.isReAdmission = isReAdmission;
      const student = await prisma.batchStudent.update({ where: { id: studentId }, data });
      return NextResponse.json({ success: true, student });
    }

    if (action === 'progressSemesters') {
      const semIds = config.semesters.map(s => s.id);
      const activeBatches = await prisma.batch.findMany({ where: { isActive: true } });
      let updated = 0;
      for (const batch of activeBatches) {
        const now = new Date();
        const lastUpdate = new Date(batch.updatedAt);
        const monthsSince = (now.getFullYear() - lastUpdate.getFullYear()) * 12 + (now.getMonth() - lastUpdate.getMonth());
        if (monthsSince >= 6) {
          const curIdx = semIds.indexOf(batch.currentSemester);
          if (curIdx < semIds.length - 1) {
            await prisma.batch.update({ where: { id: batch.id }, data: { currentSemester: semIds[curIdx + 1] } });
            updated++;
          } else {
            await prisma.batch.update({ where: { id: batch.id }, data: { isActive: false } });
            updated++;
          }
        }
        if (now > batch.targetEndDate) {
          await prisma.batch.update({ where: { id: batch.id }, data: { isActive: false } });
          updated++;
        }
      }
      return NextResponse.json({ success: true, updated });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: 'Batch action failed: ' + (err.message || '') }, { status: 500 });
  }
}
