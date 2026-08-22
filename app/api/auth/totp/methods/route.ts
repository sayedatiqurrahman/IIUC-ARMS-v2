import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';

export async function POST(req: NextRequest) {
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { methods } = await req.json();
    if (!Array.isArray(methods)) {
      return NextResponse.json({ error: 'methods must be an array' }, { status: 400 });
    }

    const validMethods = ['email', 'google', 'magiclink'];
    const filtered = methods.filter((m: string) => validMethods.includes(m));

    if (!filtered.includes('email')) {
      filtered.unshift('email');
    }

    const { prisma } = await import('@/lib/prisma');
    await prisma.profile.update({
      where: { userId: email },
      data: { totpMethods: JSON.stringify(filtered) },
    });

    return NextResponse.json({ success: true, totpMethods: filtered });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to update methods' }, { status: 500 });
  }
}
