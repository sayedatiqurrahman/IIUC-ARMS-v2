import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export const maxDuration = 60;

// Proxies the Git LFS batch request through the server to avoid CORS.
// The browser cannot call api.github.com/info/lfs/objects/batch directly
// because GitHub does not return Access-Control-Allow-Origin headers for LFS.
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.upload);
  if (!rl.success) return rl.response!;

  try {
    const { token, owner, repo, body } = await req.json();
    if (!token || !owner || !repo || !body) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const batchRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}.git/info/lfs/objects/batch`,
      {
        method: 'POST',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.git-lfs+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    // GitHub's LFS server rejects GitHub App installation tokens (ghs_) under
    // the `token` scheme — they must be sent as `Bearer` (OAuth-style). Retry
    // once with Bearer so PATs and App tokens both work.
    if (batchRes.status === 401 || batchRes.status === 403) {
      const bearerRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}.git/info/lfs/objects/batch`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.git-lfs+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      );
      if (bearerRes.status !== 401 && bearerRes.status !== 403) {
        const data = await bearerRes.json();
        return NextResponse.json(data, { status: bearerRes.status });
      }
    }

    const data = await batchRes.json();
    return NextResponse.json(data, { status: batchRes.status });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'LFS batch proxy failed' }, { status: 500 });
  }
}
