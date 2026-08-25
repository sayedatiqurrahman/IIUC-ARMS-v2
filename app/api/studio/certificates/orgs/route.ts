import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const orgs = await prisma.studioOrganization.findMany({
      where: { createdBy: email },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ orgs });
  } catch {
    return NextResponse.json({ error: 'Failed to load organizations' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { name, type, description } = body;
    if (!name?.trim()) return NextResponse.json({ error: 'Organization name required' }, { status: 400 });

    const { prisma } = await import('@/lib/prisma');

    let slug = slugify(name);
    const existing = await prisma.studioOrganization.findUnique({ where: { slug } });
    if (existing) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    const org = await prisma.studioOrganization.create({
      data: {
        name: name.trim(),
        slug,
        type: type || 'batch',
        description: description?.trim() || null,
        createdBy: email,
      },
    });

    return NextResponse.json({ success: true, org });
  } catch {
    return NextResponse.json({ error: 'Failed to create organization' }, { status: 500 });
  }
}
