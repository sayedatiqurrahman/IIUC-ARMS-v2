import { NextRequest, NextResponse } from 'next/server';
import { verifyTurnstile } from '@/lib/verifyTurnstile';

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();

    if (!token) {
      return NextResponse.json({ success: false, error: 'Token required' }, { status: 400 });
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || undefined;
    const valid = await verifyTurnstile(token, ip);

    if (!valid) {
      return NextResponse.json({ success: false, error: 'Verification failed' }, { status: 403 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Verification error' }, { status: 500 });
  }
}
