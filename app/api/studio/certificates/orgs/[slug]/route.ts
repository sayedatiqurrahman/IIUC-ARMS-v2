import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rl = rateLimit(_req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const { slug } = await params;
    const { prisma } = await import('@/lib/prisma');
    const org = await prisma.studioOrganization.findUnique({
      where: { slug },
      include: {
        certificates: { orderBy: { issuedAt: 'desc' }, take: 50 },
      },
    });
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    return NextResponse.json({ org });
  } catch {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const email = await (await import('@/lib/get-user')).getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { slug } = await params;
    const { prisma } = await import('@/lib/prisma');
    const org = await prisma.studioOrganization.findUnique({ where: { slug } });
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    if (org.createdBy !== email) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const body = await req.json();
    const updateData: Record<string, any> = {};
    if (body.name?.trim()) updateData.name = body.name.trim();
    if (body.description !== undefined) updateData.description = body.description?.trim() || null;
    if (body.type) updateData.type = body.type;
    if (body.logoUrl !== undefined) updateData.logoUrl = body.logoUrl;
    if (body.isActive !== undefined) updateData.isActive = !!body.isActive;

    await prisma.studioOrganization.update({ where: { slug }, data: updateData });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}
