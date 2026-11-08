import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { removeConnectedSender } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const email = await getUserEmail(req);
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await removeConnectedSender(email);
  return NextResponse.json({ success: true });
}
