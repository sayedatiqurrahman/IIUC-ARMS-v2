import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { getGoogleOAuthConfig, getConnectedSender } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const email = await getUserEmail(req);
  if (!email) return NextResponse.json({ connected: false, configured: getGoogleOAuthConfig().configured }, { status: 401 });
  const sender = await getConnectedSender(email);
  return NextResponse.json({
    connected: !!sender,
    email: sender?.email || null,
    configured: getGoogleOAuthConfig().configured,
  });
}
