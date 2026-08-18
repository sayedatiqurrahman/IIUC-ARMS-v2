import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { hasPermission } from '@/lib/permissions';

const GITHUB_API = 'https://api.github.com';

function ghHeaders(token: string) {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

export async function POST(req: NextRequest) {
  try {
    const email = await getUserEmail();
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const role = config.detectRole(email);
    const perms = await import('@/lib/permission-defaults').then(m => m.DEFAULT_PERMISSIONS);
    if (!hasPermission('createFolder', role, false, email)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { folderPath } = await req.json();
    if (!folderPath || typeof folderPath !== 'string') {
      return NextResponse.json({ error: 'folderPath required' }, { status: 400 });
    }

    const token = process.env.GITHUB_TOKEN || '';
    if (!token) return NextResponse.json({ error: 'No GitHub token configured' }, { status: 500 });
    const cleanPath = folderPath.replace(/^\/+|\/+$/g, '');

    const refRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`, { headers: ghHeaders(token) });
    if (!refRes.ok) return NextResponse.json({ error: 'Failed to read ref' }, { status: 502 });
    const baseCommitSha = (await refRes.json()).object.sha;

    const commitRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/commits/${baseCommitSha}`, { headers: ghHeaders(token) });
    if (!commitRes.ok) return NextResponse.json({ error: 'Failed to read commit' }, { status: 502 });
    const baseTreeSha = (await commitRes.json()).tree.sha;

    const treeRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/trees`, {
      method: 'POST',
      headers: ghHeaders(token),
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: [{ path: `${cleanPath}/.gitkeep`, mode: '100644', type: 'blob', content: '' }],
      }),
    });
    if (!treeRes.ok) return NextResponse.json({ error: 'Failed to create tree' }, { status: 502 });
    const treeData = await treeRes.json();

    const newCommitRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/commits`, {
      method: 'POST',
      headers: ghHeaders(token),
      body: JSON.stringify({
        message: `Create folder: ${cleanPath}`,
        tree: treeData.sha,
        parents: [baseCommitSha],
      }),
    });
    if (!newCommitRes.ok) return NextResponse.json({ error: 'Failed to create commit' }, { status: 502 });
    const newCommitData = await newCommitRes.json();

    const updateRefRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`, {
      method: 'PATCH',
      headers: ghHeaders(token),
      body: JSON.stringify({ sha: newCommitData.sha, force: true }),
    });
    if (!updateRefRes.ok) return NextResponse.json({ error: 'Failed to update ref' }, { status: 502 });

    return NextResponse.json({ success: true, path: cleanPath });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
