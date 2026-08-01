import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';

export async function GET(req: NextRequest) {
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const method = req.nextUrl.searchParams.get('method') || 'email';

    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({ where: { userId: email } });

    const totpEnabled = profile?.totpEnabled || false;
    const totpMethods = (profile?.totpMethods as string[]) || ['email'];

    let totpRequired = totpEnabled;
    if (totpEnabled && method) {
      totpRequired = totpMethods.includes(method);
    }

    return NextResponse.json({
      totpEnabled,
      totpRequired,
      totpMethods,
      totpSetupRequired: !!(profile?.totpSecret && !profile?.totpEnabled),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
