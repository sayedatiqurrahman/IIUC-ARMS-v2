import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    if (!token) return NextResponse.json({ ok: false, error: 'No token provided' });

    const results: any = {};
    const repoFullName = `${config.owner}/${config.repo}`;

    // Test 1: Read user
    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
    });
    results.user = { status: userRes.status };
    if (userRes.ok) {
      const user = await userRes.json();
      results.user.login = user.login;
      results.user.name = user.name;
    }

    // Test 2: Read repo
    const repoRes = await fetch(`https://api.github.com/repos/${repoFullName}`, {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
    });
    results.repo = { status: repoRes.status };
    if (repoRes.ok) {
      const repo = await repoRes.json();
      results.repo.default_branch = repo.default_branch;
    }

    // Test 3: Read refs
    const refRes = await fetch(`https://api.github.com/repos/${repoFullName}/git/refs/heads/main`, {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
    });
    results.refs = { status: refRes.status };

    // Test 4: Try creating a test branch (then delete it)
    if (refRes.ok) {
      const refData = await refRes.json();
      const testBranch = `test-perms-${Date.now()}`;
      const createRes = await fetch(`https://api.github.com/repos/${repoFullName}/git/refs`, {
        method: 'POST',
        headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: `refs/heads/${testBranch}`, sha: refData.object.sha }),
      });
      results.createBranch = { status: createRes.status };
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        results.createBranch.message = err.message;
      }

      // Clean up: delete the test branch
      if (createRes.ok) {
        await fetch(`https://api.github.com/repos/${repoFullName}/git/refs/heads/${testBranch}`, {
          method: 'DELETE',
          headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
        });
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message });
  }
}
