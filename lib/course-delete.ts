// Shared GitHub helpers for deleting a course's folder in the files repo.
// Used by the courses API (direct + approval flows), the admin delete-requests
// API, and the Telegram webhook's course-delete callbacks.

import { config } from '@/lib/config';
import { getAppInstallations, getInstallationAccessToken } from '@/lib/github-app';

const GITHUB_API = 'https://api.github.com';

function ghHeaders(token: string) {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

export function normalizeCourseFolderName(name: string): string {
  return String(name).toUpperCase().replace(/\s+/g, '');
}

// Find the real course folder on GitHub for a code inside a dept/semester dir,
// tolerating any spacing and non-ASCII titles (e.g. Arabic), by matching the
// normalized folder name against the code (CODE or CODE - title).
export async function findCourseFolderPathInRepo(token: string, baseDir: string, code: string): Promise<string | null> {
  const refRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`, { headers: ghHeaders(token) });
  if (!refRes.ok) return null;
  const baseCommitSha = (await refRes.json()).object.sha;
  const commitRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/commits/${baseCommitSha}`, { headers: ghHeaders(token) });
  if (!commitRes.ok) return null;
  const baseTreeSha = (await commitRes.json()).tree.sha;
  const treeRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/trees/${baseTreeSha}?recursive=1`, { headers: ghHeaders(token) });
  if (!treeRes.ok) return null;
  const treeData = await treeRes.json();
  const prefix = `${baseDir}/`;
  const codeNorm = normalizeCourseFolderName(code);
  for (const item of (treeData.tree || [])) {
    const p = String(item.path || '');
    if (!p.startsWith(prefix)) continue;
    const folderName = p.slice(prefix.length).split('/')[0] || '';
    if (!folderName) continue;
    const folderNorm = normalizeCourseFolderName(folderName);
    if (folderNorm === codeNorm || folderNorm.startsWith(`${codeNorm}-`)) return `${baseDir}/${folderName}`;
  }
  return null;
}

export async function getAppBotToken(): Promise<string | null> {
  try {
    const installations = await getAppInstallations();
    if (!Array.isArray(installations) || installations.length === 0) return null;
    return await getInstallationAccessToken(installations[0].id);
  } catch { return null; }
}

async function getBranchBase(baseToken: string): Promise<{ baseCommitSha: string; baseTreeSha: string } | null> {
  const refRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`, { headers: ghHeaders(baseToken) });
  if (!refRes.ok) return null;
  const baseCommitSha = (await refRes.json()).object.sha;
  const commitRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/commits/${baseCommitSha}`, { headers: ghHeaders(baseToken) });
  if (!commitRes.ok) return null;
  return { baseCommitSha, baseTreeSha: (await commitRes.json()).tree.sha };
}

async function getFullTree(baseToken: string, baseTreeSha: string): Promise<any[]> {
  const treeRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/trees/${baseTreeSha}?recursive=1`, { headers: ghHeaders(baseToken) });
  if (!treeRes.ok) return [];
  return (await treeRes.json()).tree || [];
}

function withPrefix(folderPath: string): string {
  return folderPath.endsWith('/') ? folderPath : folderPath + '/';
}

// List every blob under a folder — one recursive-tree request instead of the
// old per-subfolder contents walk (which made deletes very slow).
export async function getAllFilesInFolder(token: string, folderPath: string): Promise<{ path: string; sha: string }[]> {
  const prefix = withPrefix(folderPath);
  try {
    const base = await getBranchBase(token);
    if (base) {
      const fullTree = await getFullTree(token, base.baseTreeSha);
      const files = fullTree
        .filter((item: any) => item.type === 'blob' && String(item.path || '').startsWith(prefix))
        .map((item: any) => ({ path: item.path, sha: item.sha }));
      if (files.length > 0 || fullTree.length > 0) return files;
    }
  } catch {}

  // Fallback: recursive contents walk (older API path)
  const walk = async (dir: string): Promise<{ path: string; sha: string }[]> => {
    const url = `${GITHUB_API}/repos/${config.owner}/${config.repo}/contents/${dir}`;
    const res = await fetch(url, { headers: ghHeaders(token) });
    if (!res.ok) return [];
    const items = await res.json();
    if (!Array.isArray(items)) return [];
    const out: { path: string; sha: string }[] = [];
    for (const item of items) {
      if (item.type === 'file') out.push({ path: item.path, sha: item.sha });
      else if (item.type === 'dir') out.push(...(await walk(item.path)));
    }
    return out;
  };
  return walk(folderPath);
}

// Delete a list of tree entries (blobs and/or subtrees) in ONE commit by
// setting each entry's sha to null. This is the only way the git trees API
// actually removes entries — merely omitting them from the submitted tree makes
// GitHub inherit them from base_tree again (the bug that made course deletion
// silently do nothing).
async function batchDeleteEntries(token: string, entries: { path: string; mode: string; type: string }[]): Promise<number> {
  if (entries.length === 0) return 0;
  const base = await getBranchBase(token);
  if (!base) return 0;

  const treeItems = entries.map(e => ({ path: e.path, mode: e.mode, type: e.type, sha: null }));
  const treeRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/trees`, {
    method: 'POST', headers: ghHeaders(token),
    body: JSON.stringify({ base_tree: base.baseTreeSha, tree: treeItems }),
  });
  if (!treeRes.ok) return 0;
  const treeData = await treeRes.json();

  const newCommitRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/commits`, {
    method: 'POST', headers: ghHeaders(token),
    body: JSON.stringify({ message: `Delete course: ${entries.length} file(s) removed`, tree: treeData.sha, parents: [base.baseCommitSha] }),
  });
  if (!newCommitRes.ok) return 0;
  const newCommitData = await newCommitRes.json();

  const refRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`, {
    method: 'PATCH', headers: ghHeaders(token),
    body: JSON.stringify({ sha: newCommitData.sha, force: true }),
  });
  return refRes.ok ? entries.length : 0;
}

// Removes the course's GitHub folder and returns the number of entries deleted.
// Throws on failure so the caller can surface the error to the admin.
export async function deleteCourseFolder(folderPath: string): Promise<number> {
  const token = await getAppBotToken();
  if (!token) throw new Error('No GitHub App token available for course deletion');

  const prefix = withPrefix(folderPath);
  const base = await getBranchBase(token);
  if (!base) throw new Error('Cannot read branch from GitHub');
  const fullTree = await getFullTree(token, base.baseTreeSha);
  if (fullTree.length === 0) throw new Error('Cannot read repo tree from GitHub');

  // Collect the folder's tree entry plus everything nested under it. Deleting
  // the folder's own tree entry alone would normally be enough, but collecting
  // nested entries too keeps it robust if the folder path spacing ever differs
  // from the tree path while the nested blobs still match.
  const entries = fullTree.filter((item: any) => {
    const p = String(item.path || '');
    return p === folderPath || p.startsWith(prefix);
  });
  if (entries.length === 0) throw new Error(`No matching files found in repo for folder: ${folderPath}`);

  return batchDeleteEntries(token, entries.map((item: any) => ({ path: item.path, mode: item.mode, type: item.type })));
}
