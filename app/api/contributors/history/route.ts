import { NextResponse } from 'next/server';
import { loadContributorHistory } from '@/lib/contributor-data';

export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const login = searchParams.get('login')?.trim();
    if (!login) {
      return NextResponse.json({ error: 'Missing login' }, { status: 400 });
    }

    const history = await loadContributorHistory(login);
    return NextResponse.json(history);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load contribution history' }, { status: 500 });
  }
}
