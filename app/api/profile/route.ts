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
  } catch (err) {
    console.error('[Profile GET] Error:', err);
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

    // Build update object — only include fields that are explicitly provided
    const updateData: Record<string, any> = {};
    const createData: Record<string, any> = { userId, email: session.user.email };

    const fields = [
      'name', 'universityId', 'whatsapp', 'semester', 'image',
      'facebook', 'twitter', 'linkedin', 'website',
      'hideWhatsapp', 'hideUniversityId', 'githubLogin',
    ];

    for (const field of fields) {
      if (field in body) {
        const val = body[field];
        // For strings: only set if provided and non-empty, otherwise null
        // For booleans: always set (they have defaults)
        if (typeof val === 'boolean') {
          updateData[field] = val;
          createData[field] = val;
        } else if (val !== undefined && val !== null && val !== '') {
          updateData[field] = val;
          createData[field] = val;
        } else if (val === '' || val === null) {
          // Only clear if explicitly set to empty/null AND the field is not githubLogin/image
          // (those should never be cleared by profile save)
          if (field !== 'githubLogin' && field !== 'image') {
            updateData[field] = null;
            createData[field] = null;
          }
        }
      }
    }

    // Always set image from session if not provided
    if (!updateData.image && (session as any).user?.image) {
      updateData.image = (session as any).user.image;
      if (!createData.image) createData.image = (session as any).user.image;
    }

    const profile = await prisma.profile.upsert({
      where: { userId },
      update: updateData,
      create: createData as any,
    });

    return NextResponse.json(profile);
  } catch (err) {
    console.error('[Profile POST] Error:', err);
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }
}
