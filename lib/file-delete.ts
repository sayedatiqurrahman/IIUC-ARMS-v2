// Shared GitHub deletion for files/folders. Always driven by the repo bot token
// (server-side GitHub App), so deletions never depend on a user's PAT. Removes
// the given paths — each may be a single file OR a folder prefix — in ONE atomic
// commit (tree → commit → ref).
//
// Unlike the old full-tree rewrite (which re-posted EVERY blob of the repo in a
// single `git/trees` call and 504'd on large repositories), the new tree is built
// from `base_tree` plus a tiny delta: one entry per requested path with
// `sha: null`. According to the Git Database API, a null sha removes the entry —
// for a `tree` entry that removes its whole subtree atomically.

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

async function getBotToken(): Promise<string | null> {
  try {
    return await getRepoBotToken(config.owner, config.repo);
  } catch {
    return null;
  }
}

// Deletes `paths` (repo-root-relative, e.g. `upload_academic_files/qsis/...`)
// in one commit. Returns the number of tree entries removed.
// Throws on failure so the caller can surface the error to the admin.
export async function deleteRepoEntries(paths: string[], fallbackToken?: string): Promise<number> {
  const token = (await getBotToken()) || fallbackToken;
  if (!token || paths.length === 0) throw new Error('No GitHub token available for deletion');

  const refRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`, { headers: ghHeaders(token) });
  if (!refRes.ok) {
    const body = await refRes.text().catch(() => '');
    console.error('[delete] Cannot read branch:', refRes.status, body.slice(0, 200));
    throw new Error(`Cannot read branch (${refRes.status}): your token may lack "Contents" read permission.`);
  }
  const baseCommitSha = (await refRes.json()).object.sha;

  const commitRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/commits/${baseCommitSha}`, { headers: ghHeaders(token) });
  if (!commitRes.ok) {
    const body = await commitRes.text().catch(() => '');
    console.error('[delete] Cannot read commit:', commitRes.status, body.slice(0, 200));
    throw new Error(`Cannot read commit (${commitRes.status}): token lacks permission.`);
  }
  const baseTreeSha = (await commitRes.json()).tree.sha;

  const treeRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/trees/${baseTreeSha}?recursive=1`, { headers: ghHeaders(token) });
  if (!treeRes.ok) {
    const body = await treeRes.text().catch(() => '');
    console.error('[delete] Cannot read tree:', treeRes.status, body.slice(0, 200));
    throw new Error(`Cannot read tree (${treeRes.status}): repo may be too large for recursive listing.`);
  }
  const fullTree = (await treeRes.json()).tree || [];

  // Verify + count what will be removed. (Deletion itself no longer re-uploads
  // the whole tree, so a large listing only undercounts the log.)
  const deletePaths = new Set<string>();
  const folderTargets = new Set<string>();
  for (const item of fullTree) {
    const p = String(item.path || '');
    for (const target of paths) {
      if (p === target) {
        if (item.type === 'tree') folderTargets.add(target);
        deletePaths.add(p);
      } else if (p.startsWith(`${target}/`)) {
        deletePaths.add(p);
      }
    }
  }
  if (deletePaths.size === 0) throw new Error(`No matching files found in repo for: ${paths.join(', ')}`);

  // Delta: ONE `sha: null` entry per requested path combined with `base_tree`.
  // A tree entry with sha:null removes its whole subtree atomically; a blob
  // entry removes the single file.
  const matched = paths.filter(
    (t) => deletePaths.has(t) || Array.from(deletePaths).some((d) => d.startsWith(`${t}/`)),
  );
  const makeChanges = (): { path: string; mode: string; type: string; sha: null }[] =>
    matched.map((t) => {
      const exact = fullTree.find((i: any) => String(i.path) === t);
      const isFolder =
        folderTargets.has(t)
        || exact?.type === 'tree'
        || Array.from(deletePaths).some((d) => d.startsWith(`${t}/`) && d !== t);
      return { path: t, mode: isFolder ? '040000' : '100644', type: isFolder ? 'tree' : 'blob', sha: null };
    });

  let treesRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/trees`, {
    method: 'POST',
    headers: ghHeaders(token),
    body: JSON.stringify({ base_tree: baseTreeSha, tree: makeChanges() }),
  });
  if (!treesRes.ok) {
    // Fallback: null every affected entry individually (always supported).
    const allRemoved = Array.from(deletePaths);
    for (const t of Array.from(folderTargets)) if (!allRemoved.includes(t)) allRemoved.push(t);
    const changes = allRemoved.map((p: string) => {
      const ex = fullTree.find((i: any) => String(i.path) === p);
      return { path: p, mode: ex?.mode || '100644', type: ex?.type === 'tree' ? 'tree' : 'blob', sha: null };
    });
    treesRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/trees`, {
      method: 'POST',
      headers: ghHeaders(token),
      body: JSON.stringify({ base_tree: baseTreeSha, tree: changes }),
    });
  }
  if (!treesRes.ok) {
    const body = await treesRes.text().catch(() => '');
    console.error('[delete] Cannot create tree:', treesRes.status, body.slice(0, 300));
    throw new Error(`Cannot create new tree (${treesRes.status}): ${body.slice(0, 200) || 'token may lack write permission'}`);
  }
  const newTreeSha = (await treesRes.json()).sha;

  const newCommitRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/commits`, {
    method: 'POST',
    headers: ghHeaders(token),
    body: JSON.stringify({
      message: `Delete: ${paths.length} path(s) via app bot`,
      tree: newTreeSha,
      parents: [baseCommitSha],
    }),
  });
  if (!newCommitRes.ok) {
    const body = await newCommitRes.text().catch(() => '');
    console.error('[delete] Cannot create commit:', newCommitRes.status, body.slice(0, 300));
    throw new Error(`Cannot create commit (${newCommitRes.status}): ${body.slice(0, 200) || 'token may lack write permission'}`);
  }
  const newCommitSha = (await newCommitRes.json()).sha;

  const refUpdateRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`, {
    method: 'PATCH',
    headers: ghHeaders(token),
    body: JSON.stringify({ sha: newCommitSha, force: true }),
  });
  if (!refUpdateRes.ok) {
    const body = await refUpdateRes.text().catch(() => '');
    console.error('[delete] Cannot update branch:', refUpdateRes.status, body.slice(0, 300));
    throw new Error(`Cannot update branch (${refUpdateRes.status}): concurrent commit may have happened — try again`);
  }
  return deletePaths.size;
}