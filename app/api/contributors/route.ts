import { NextResponse } from 'next/server';
import { loadContributors } from '@/lib/contributor-data';

export const maxDuration = 60;

export async function GET() {
  try {
    const { contributors, settings } = await loadContributors();
    return NextResponse.json({ contributors, settings });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load contributors' }, { status: 500 });
  }
}
