import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.email;

  const profile = await prisma.profile.findUnique({ where: { userId } });

  return NextResponse.json(profile || { userId, email: session.user.email });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.email;
  const body = await req.json();
  const { universityId, name, whatsapp, semester } = body;

  const profile = await prisma.profile.upsert({
    where: { userId },
    update: {
      email: session.user.email,
      name: name || null,
      universityId: universityId || null,
      whatsapp: whatsapp || null,
      semester: semester || null,
      image: (session as any).user?.image || null,
    },
    create: {
      userId,
      email: session.user.email,
      name: name || null,
      universityId: universityId || null,
      whatsapp: whatsapp || null,
      semester: semester || null,
      image: (session as any).user?.image || null,
    },
  });

  return NextResponse.json(profile);
}
