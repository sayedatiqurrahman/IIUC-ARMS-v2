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
    const folderName = (p.slice(prefix.length).split('/')[0] || '').toUpperCase();
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

export async function getAllFilesInFolder(token: string, folderPath: string): Promise<{ path: string; sha: string }[]> {
  const url = `${GITHUB_API}/repos/${config.owner}/${config.repo}/contents/${folderPath}`;
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (!res.ok) return [];
  const items = await res.json();
  if (!Array.isArray(items)) return [];
  const files: { path: string; sha: string }[] = [];
  for (const item of items) {
    if (item.type === 'file') files.push({ path: item.path, sha: item.sha });
    else if (item.type === 'dir') {
      const sub = await getAllFilesInFolder(token, item.path);
      files.push(...sub);
    }
  }
  return files;
}

async function batchDeleteFiles(token: string, files: { path: string; sha: string }[]): Promise<number> {
  if (files.length === 0) return 0;
  const refRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`, { headers: ghHeaders(token) });
  if (!refRes.ok) return 0;
  const refData = await refRes.json();
  const baseCommitSha = refData.object.sha;

  const commitRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/commits/${baseCommitSha}`, { headers: ghHeaders(token) });
  if (!commitRes.ok) return 0;
  const commitData = await commitRes.json();
  const baseTreeSha = commitData.tree.sha;

  const fullTreeRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/trees/${baseTreeSha}?recursive=1`, { headers: ghHeaders(token) });
  if (!fullTreeRes.ok) return 0;
  const fullTreeData = await fullTreeRes.json();

  const deletePaths = new Set(files.map(f => f.path));
  const keepItems = (fullTreeData.tree || []).filter((item: any) => !deletePaths.has(item.path));
  if (keepItems.length === 0) return 0;

  const treeItems = keepItems.map((item: any) => ({
    path: item.path, mode: item.mode, type: item.type,
    sha: item.type === 'blob' ? item.sha : undefined,
  }));

  const treeRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/trees`, {
    method: 'POST', headers: ghHeaders(token),
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
  });
  if (!treeRes.ok) return 0;
  const treeData = await treeRes.json();

  const newCommitRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/commits`, {
    method: 'POST', headers: ghHeaders(token),
    body: JSON.stringify({ message: `Delete course: ${files.length} files removed`, tree: treeData.sha, parents: [baseCommitSha] }),
  });
  if (!newCommitRes.ok) return 0;
  const newCommitData = await newCommitRes.json();

  await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`, {
    method: 'PATCH', headers: ghHeaders(token),
    body: JSON.stringify({ sha: newCommitData.sha, force: true }),
  });
  return files.length;
}

// Removes the course's GitHub folder and returns the number of files deleted.
export async function deleteCourseFolder(folderPath: string): Promise<number> {
  const token = await getAppBotToken();
  if (!token) return 0;
  const allFiles = await getAllFilesInFolder(token, folderPath);
  return batchDeleteFiles(token, allFiles);
}
