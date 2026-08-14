// Shared GitHub move / copy / rename driven by the repo bot token (server-side
// GitHub App). Unlike the old Contents-API loop (one HTTP call per file, which
// 504s on large folders), this rewrites in ONE commit:
// base ref → base tree (recursive) → delta tree → commit → ref.
//
// The delta is posted with `base_tree`, so only the CHANGED entries travel over
// the wire: `{path, sha: null}` deletions for every affected blob plus
// `{path, mode, type: 'blob', sha}` additions at the new paths. No `type: 'tree'`
// entries are ever re-submitted — referencing the old subtree shas is exactly what
// silently RESTORED the originals (the delete-path bug). base_tree + sha:null
// guarantees the originals are removed atomically in the same commit that adds
// the renamed/moved/copied files, so a rename can never leave a duplicate behind.

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

// Normalize a path for fuzzy matching: Unicode-normalize, collapse whitespace,
// lowercase. Guards against e.g. non-breaking spaces or case drift between the
// path the client sends and the path GitHub actually stored.
function normPath(p: string): string {
  return p
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// `from` and `to` are repo-root-relative (e.g. `upload_academic_files/qsis/...`).
// `to` may be a file path (single-item move/copy) or a folder path (folder
// move/copy). Returns how many blobs were rewritten.
export async function moveCopyRepoEntries(
  from: string,
  to: string,
  mode: 'move' | 'copy',
  message: string,
): Promise<{ ok: boolean; count: number; error?: string }> {
  const token = await getRepoBotToken(config.owner, config.repo);
  if (!token) return { ok: false, count: 0, error: 'No bot token available' };

  const refRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`, { headers: ghHeaders(token) });
  if (!refRes.ok) return { ok: false, count: 0, error: `Failed to read branch ref (${refRes.status})` };
  const baseCommitSha = (await refRes.json()).object.sha;

  const commitRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/commits/${baseCommitSha}`, { headers: ghHeaders(token) });
  if (!commitRes.ok) return { ok: false, count: 0, error: `Failed to read base commit (${commitRes.status})` };
  const baseTreeSha = (await commitRes.json()).tree.sha;

  const treeRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/trees/${baseTreeSha}?recursive=1`, { headers: ghHeaders(token) });
  if (!treeRes.ok) return { ok: false, count: 0, error: `Failed to read repo tree (${treeRes.status})` };
  const treeData = await treeRes.json();
  if (treeData.truncated) {
    return { ok: false, count: 0, error: 'Repo tree too large to resolve — please try again or contact admin' };
  }
  const fullTree: TreeEntry[] = treeData.tree || [];

  const fromSegCount = from.split('/').length;
  const fromDir = `${from}/`;
  const normFrom = normPath(from);
  const normFromDir = `${normFrom}/`;

  // Collect every blob under `from` (exact file, or folder prefix). Try exact
  // match first, then a normalized fallback (case / whitespace / NFC drift).
  const affected: TreeEntry[] = [];
  for (const item of fullTree) {
    if (item.type !== 'blob') continue;
    const p = item.path;
    if (p === from || p.startsWith(fromDir)) {
      affected.push(item);
    }
  }
  if (affected.length === 0) {
    for (const item of fullTree) {
      if (item.type !== 'blob') continue;
      const n = normPath(item.path);
      if (n === normFrom || n.startsWith(normFromDir)) affected.push(item);
    }
  }
  if (affected.length === 0) {
    return { ok: false, count: 0, error: 'Source not found in repo' };
  }

  const toBase = to.replace(/\/$/, '');

  // Build the delta tree: delete every old blob path (sha: null) and add every
  // rewritten blob at its new path. base_tree preserves everything else.
  const delta: { path: string; mode: string; type: string; sha: string | null }[] = [];
  for (const item of affected) {
    const rel = item.path === from ? '' : item.path.split('/').slice(fromSegCount).join('/');
    const newPath = rel ? `${toBase}/${rel}` : toBase;
    if (mode === 'move') {
      delta.push({ path: item.path, mode: item.mode, type: item.type, sha: null });
    }
    delta.push({ path: newPath, mode: item.mode, type: 'blob', sha: item.sha });
  }

  const newTreeRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/trees`, {
    method: 'POST',
    headers: ghHeaders(token),
    body: JSON.stringify({ base_tree: baseTreeSha, tree: delta }),
  });
  if (!newTreeRes.ok) return { ok: false, count: 0, error: `Failed to create tree (${newTreeRes.status})` };
  const newTreeSha = (await newTreeRes.json()).sha;

  const newCommitRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/commits`, {
    method: 'POST',
    headers: ghHeaders(token),
    body: JSON.stringify({ message, tree: newTreeSha, parents: [baseCommitSha] }),
  });
  if (!newCommitRes.ok) return { ok: false, count: 0, error: `Failed to create commit (${newCommitRes.status})` };
  const newCommitSha = (await newCommitRes.json()).sha;

  const refUpdateRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`, {
    method: 'PATCH',
    headers: ghHeaders(token),
    body: JSON.stringify({ sha: newCommitSha, force: true }),
  });
  if (!refUpdateRes.ok) return { ok: false, count: 0, error: `Failed to update branch (${refUpdateRes.status})` };
  return { ok: true, count: affected.length };
}
