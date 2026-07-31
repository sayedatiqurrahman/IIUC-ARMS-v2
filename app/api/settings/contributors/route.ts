import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { config } from '@/lib/config';
import { getUserEmail } from '@/lib/get-user';

async function getAdminEmail(req: NextRequest): Promise<string | null> {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.email) return session.user.email;
  } catch {}
  try {
    const email = await getUserEmail(req);
    if (email) return email;
  } catch {}
  return null;
}

function isAdmin(email: string | null): boolean {
  if (!email) return false;
  return config.adminEmails.includes(email.toLowerCase()) || config.ownerEmails.includes(email.toLowerCase());
}

export async function GET(req: NextRequest) {
  try {
    const { prisma } = await import('@/lib/prisma');
    const siteSettings = await prisma.siteSettings.findUnique({ where: { id: 'site-settings' } });
    const settings = (siteSettings?.contributorSettings as any) || {};
    return NextResponse.json(settings);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const email = await getAdminEmail(req);
    if (!isAdmin(email)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await req.json();
    const { prisma } = await import('@/lib/prisma');

    await prisma.siteSettings.upsert({
      where: { id: 'site-settings' },
      create: { id: 'site-settings', permissions: {}, contributorSettings: body },
      update: { contributorSettings: body },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
