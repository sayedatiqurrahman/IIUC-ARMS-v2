// Shared GitHub deletion for files/folders. Always driven by the repo bot token
// (server-side GitHub App), so deletions never depend on a user's PAT. Removes
// the given paths — each may be a single file OR a folder prefix — in ONE atomic
// commit (tree → commit → ref) instead of one Contents-API call per file.

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
// in one commit. Returns the number of tree entries removed, or 0 on failure /
// nothing matched. A path is matched exactly or as a folder prefix (path + '/').
export async function deleteRepoEntries(paths: string[], fallbackToken?: string): Promise<number> {
  const token = (await getBotToken()) || fallbackToken;
  if (!token || paths.length === 0) return 0;

  const refRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`, { headers: ghHeaders(token) });
  if (!refRes.ok) return 0;
  const baseCommitSha = (await refRes.json()).object.sha;

  const commitRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/commits/${baseCommitSha}`, { headers: ghHeaders(token) });
  if (!commitRes.ok) return 0;
  const baseTreeSha = (await commitRes.json()).tree.sha;

  const treeRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/trees/${baseTreeSha}?recursive=1`, { headers: ghHeaders(token) });
  if (!treeRes.ok) return 0;
  const fullTree = (await treeRes.json()).tree || [];

  // Collect every entry under any requested path (exact file or folder prefix).
  const deletePaths = new Set<string>();
  for (const item of fullTree) {
    const p = String(item.path || '');
    for (const target of paths) {
      if (p === target || p.startsWith(`${target}/`)) {
        deletePaths.add(p);
        break;
      }
    }
  }
  if (deletePaths.size === 0) return 0;

  // Only blob (and submodule) entries go into the new tree — tree entries are
  // rebuilt by GitHub from the blob paths. Passing the old subtree entries with
  // their shas would reference the PRE-DELETE folders and silently restore the
  // deleted files. No base_tree either (it would retain unlisted paths).
  const treeItems = fullTree
    .filter((item: any) => item.type !== 'tree' && !deletePaths.has(String(item.path || '')))
    .map((item: any) => ({
      path: item.path,
      mode: item.mode,
      type: item.type,
      sha: item.sha,
    }));

  const newTreeRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/trees`, {
    method: 'POST',
    headers: ghHeaders(token),
    // NOTE: no base_tree here! With base_tree GitHub *retains* any path not listed
    // in `tree`, so the deleted files would come straight back. The new tree must
    // explicitly enumerate every kept entry (blobs + subtrees with their shas).
    body: JSON.stringify({ tree: treeItems }),
  });
  if (!newTreeRes.ok) return 0;
  const newTreeSha = (await newTreeRes.json()).sha;

  const newCommitRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/commits`, {
    method: 'POST',
    headers: ghHeaders(token),
    body: JSON.stringify({
      message: `Delete: ${paths.length} path(s) via app bot`,
      tree: newTreeSha,
      parents: [baseCommitSha],
    }),
  });
  if (!newCommitRes.ok) return 0;
  const newCommitSha = (await newCommitRes.json()).sha;

  const refUpdateRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`, {
    method: 'PATCH',
    headers: ghHeaders(token),
    body: JSON.stringify({ sha: newCommitSha, force: true }),
  });
  return refUpdateRes.ok ? deletePaths.size : 0;
}
