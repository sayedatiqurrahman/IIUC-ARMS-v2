// Shared GitHub move / copy / rename driven by the repo bot token (server-side
// GitHub App). Unlike the old Contents-API loop (one HTTP call per file, which
// 504s on large folders), this rewrites the whole subtree in ONE commit:
// base ref → base tree (recursive) → new tree → commit → ref. So a folder with
// thousands of files moves/copies/renames instantly and atomically.

import { config } from '@/lib/config';
import { getRepoBotToken } from '@/lib/github-app';

const GITHUB_API = 'https://api.github.com';

function ghHeaders(token: string) {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

interface TreeEntry {
  path: string;
  mode: string;
  type: string;
  sha: string;
}

// `from` and `to` are repo-root-relative (e.g. `upload_academic_files/qsis/...`).
// `to` may be a file path (single-item move/copy) or a folder path ending in
// `/` (folder move/copy). Returns how many entries were rewritten.
export async function moveCopyRepoEntries(
  from: string,
  to: string,
  mode: 'move' | 'copy',
  message: string,
): Promise<{ ok: boolean; count: number }> {
  const token = await getRepoBotToken(config.owner, config.repo);
  if (!token) return { ok: false, count: 0 };

  const refRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`, { headers: ghHeaders(token) });
  if (!refRes.ok) return { ok: false, count: 0 };
  const baseCommitSha = (await refRes.json()).object.sha;

  const commitRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/commits/${baseCommitSha}`, { headers: ghHeaders(token) });
  if (!commitRes.ok) return { ok: false, count: 0 };
  const baseTreeSha = (await commitRes.json()).tree.sha;

  const treeRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/trees/${baseTreeSha}?recursive=1`, { headers: ghHeaders(token) });
  if (!treeRes.ok) return { ok: false, count: 0 };
  const fullTree: TreeEntry[] = (await treeRes.json()).tree || [];

  const fromDir = `${from}/`;
  const toIsFolder = to.endsWith('/');

  const affected: TreeEntry[] = [];
  const others: TreeEntry[] = [];
  for (const item of fullTree) {
    const p = item.path;
    if (p === from || p.startsWith(fromDir)) affected.push(item);
    else others.push(item);
  }
  if (affected.length === 0) return { ok: false, count: 0 };

  const rewrite = (p: string): string => {
    if (p === from) return to; // single-item move/copy → destination file path
    const rel = p.slice(fromDir.length);
    return `${toIsFolder ? to : `${to}/`}${rel}`; // folder entry → under destination
  };

  const rewritten: TreeEntry[] = affected.map(item => ({
    path: rewrite(item.path),
    mode: item.mode,
    type: item.type,
    sha: item.sha,
  }));

  // Move: drop the originals, keep the rest + rewritten. Copy: keep everything + rewritten.
  const kept = mode === 'move' ? others : fullTree;
  const newTreeItems = [...kept, ...rewritten].map(item => ({
    path: item.path,
    mode: item.mode,
    type: item.type,
    sha: item.sha,
  }));

  const newTreeRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/trees`, {
    method: 'POST',
    headers: ghHeaders(token),
    body: JSON.stringify({ tree: newTreeItems }),
  });
  if (!newTreeRes.ok) return { ok: false, count: 0 };
  const newTreeSha = (await newTreeRes.json()).sha;

  const newCommitRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/commits`, {
    method: 'POST',
    headers: ghHeaders(token),
    body: JSON.stringify({ message, tree: newTreeSha, parents: [baseCommitSha] }),
  });
  if (!newCommitRes.ok) return { ok: false, count: 0 };
  const newCommitSha = (await newCommitRes.json()).sha;

  const refUpdateRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`, {
    method: 'PATCH',
    headers: ghHeaders(token),
    body: JSON.stringify({ sha: newCommitSha, force: true }),
  });
  return { ok: refUpdateRes.ok, count: rewritten.length };
}
