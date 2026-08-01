import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;
  const dept = req.nextUrl.searchParams.get('department');
  const semester = req.nextUrl.searchParams.get('semester');
  if (!dept || !semester) {
    return NextResponse.json({ success: false, error: 'department and semester required' }, { status: 400 });
  }
  try {
    const { fetchCoursesFromGitHub } = await import('@/lib/github-folders');
    const courses = await fetchCoursesFromGitHub(dept, semester);
    return NextResponse.json({ success: true, courses });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to fetch from GitHub' }, { status: 500 });
  }
}
