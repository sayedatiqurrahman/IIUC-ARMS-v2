import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';

export async function GET(req: NextRequest) {
  try {
    const { prisma } = await import('@/lib/prisma');
    const email = await getUserEmail(req);
    if (!email) {
      console.error('[Profile GET] No user email — unauthorized');
      return NextResponse.json({ error: 'Unauthorized — not signed in' }, { status: 401 });
    }

    const userId = email;
    const profile = await prisma.profile.findUnique({ where: { userId } });
    console.log('[Profile GET] email:', email, 'found:', !!profile);

    return NextResponse.json(profile || { userId, email });
  } catch (err: any) {
    console.error('[Profile GET] Error:', err.message, err.stack);
    return NextResponse.json({ error: 'Database unavailable', details: err.message }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { prisma } = await import('@/lib/prisma');
    const email = await getUserEmail(req);
    if (!email) {
      console.error('[Profile POST] No user email — unauthorized');
      return NextResponse.json({ error: 'Unauthorized — not signed in' }, { status: 401 });
    }

    const userId = email;
    const body = await req.json();

    // Build update object — only include fields that are explicitly provided
    const updateData: Record<string, any> = {};
    const createData: Record<string, any> = { userId, email };

    const fields = [
      'name', 'universityId', 'whatsapp', 'semester', 'image',
      'facebook', 'twitter', 'linkedin', 'website',
      'hideWhatsapp', 'hideUniversityId', 'githubLogin', 'githubToken',
    ];

    for (const field of fields) {
      if (field in body) {
        const val = body[field];
        if (typeof val === 'boolean') {
          updateData[field] = val;
          createData[field] = val;
        } else if (val !== undefined && val !== null && val !== '') {
          updateData[field] = val;
          createData[field] = val;
        } else if (val === '' || val === null) {
          if (field !== 'githubLogin' && field !== 'githubToken' && field !== 'image') {
            updateData[field] = null;
            createData[field] = null;
          }
        }
      }
    }

    const profile = await prisma.profile.upsert({
      where: { userId },
      update: updateData,
      create: createData as any,
    });
    console.log('[Profile POST] Saved for:', userId, 'fields:', Object.keys(updateData));

    return NextResponse.json(profile);
  } catch (err: any) {
    console.error('[Profile POST] Error:', err.message, err.stack);
    return NextResponse.json({ error: 'Database unavailable', details: err.message }, { status: 503 });
  }
}
