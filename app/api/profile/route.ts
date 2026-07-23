import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export async function GET() {
  try {
    const { prisma } = await import('@/lib/prisma');
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.email;
    const profile = await prisma.profile.findUnique({ where: { userId } });

    return NextResponse.json(profile || { userId, email: session.user.email });
  } catch {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { prisma } = await import('@/lib/prisma');
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.email;
    const body = await req.json();
    const {
      universityId, name, whatsapp, semester, image,
      facebook, twitter, linkedin, website,
      hideWhatsapp, hideUniversityId, githubLogin,
    } = body;

    const profile = await prisma.profile.upsert({
      where: { userId },
      update: {
        email: session.user.email,
        name: name || null,
        universityId: universityId || null,
        whatsapp: whatsapp || null,
        semester: semester || null,
        image: image || (session as any).user?.image || null,
        facebook: facebook || null,
        twitter: twitter || null,
        linkedin: linkedin || null,
        website: website || null,
        hideWhatsapp: !!hideWhatsapp,
        hideUniversityId: !!hideUniversityId,
        githubLogin: githubLogin || null,
      },
      create: {
        userId,
        email: session.user.email,
        name: name || null,
        universityId: universityId || null,
        whatsapp: whatsapp || null,
        semester: semester || null,
        image: image || (session as any).user?.image || null,
        facebook: facebook || null,
        twitter: twitter || null,
        linkedin: linkedin || null,
        website: website || null,
        hideWhatsapp: !!hideWhatsapp,
        hideUniversityId: !!hideUniversityId,
        githubLogin: githubLogin || null,
      },
    });

    return NextResponse.json(profile);
  } catch {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }
}
