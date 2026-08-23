/**
 * Faculty data stored as JSON files in the GitHub data repo.
 *
 * Structure:
 *   faculty_members/
 *     index.json              — list of all department slugs
 *     <department-slug>.json  — members for one department
 *
 * Each department file:
 *   { "department": "cse", "updatedAt": "...", "members": [ ... ] }
 *
 * Each member:
 *   { id, name, title, email, shortForm, memberType, sortOrder, claimedBy }
 */

import { config } from './config';
import { decrypt, isEncrypted } from './crypto';

const FACULTY_FOLDER = 'faculty_members';

interface FacultyMemberData {
  id: string;
  name: string;
  title?: string | null;
  email?: string | null;
  shortForm?: string | null;
  memberType: string;
  sortOrder: number;
  claimedBy?: string | null;
}

interface DepartmentFile {
  department: string;
  updatedAt: string;
  members: FacultyMemberData[];
}

interface FacultyIndex {
  departments: string[];
  updatedAt: string;
}

// ─── GitHub helpers ──────────────────────────────────────────

async function getGithubToken(): Promise<string> {
  try {
    const { getAppInstallations, getInstallationAccessToken } = await import('./github-app');
    const installations = await getAppInstallations();
    if (Array.isArray(installations) && installations.length > 0) {
      const token = await getInstallationAccessToken(installations[0].id);
      if (token) return token;
    }
  } catch {}
  return process.env.GITHUB_TOKEN || '';
}

function ghHeaders(token: string) {
  return {
    Authorization: token ? `token ${token}` : '',
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

/** Fetch a file from the data repo. Returns { content, sha } or null. */
async function getFile(path: string): Promise<{ content: string; sha: string } | null> {
  const token = await getGithubToken();
  if (!token) return null;
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}?ref=${config.branch}`;
  try {
    const res = await fetch(url, { headers: ghHeaders(token), cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    const content = atob(data.content.replace(/\n/g, ''));
    return { content, sha: data.sha };
  } catch {
    return null;
  }
}

/** Create or update a file in the data repo. Returns the new SHA or null. */
async function putFile(path: string, content: string, sha: string | null, message: string): Promise<string | null> {
  const token = await getGithubToken();
  if (!token) return null;
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}`;
  const body: any = {
    message,
    content: btoa(unescape(encodeURIComponent(content))),
    branch: config.branch,
  };
  if (sha) body.sha = sha;
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: ghHeaders(token),
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.content?.sha || null;
  } catch {
    return null;
  }
}

function deptSlug(department: string): string {
  return department
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ─── Public API ──────────────────────────────────────────────

/** Load all faculty members from the GitHub data repo (returns flattened array). */
export async function loadAllFaculty(): Promise<FacultyMemberData[]> {
  const indexFile = await getFile(`${FACULTY_FOLDER}/index.json`);
  if (!indexFile) return [];

  let index: FacultyIndex;
  try { index = JSON.parse(indexFile.content); } catch { return []; }
  if (!Array.isArray(index.departments) || index.departments.length === 0) return [];

  const allMembers: FacultyMemberData[] = [];

  // Fetch all department files in parallel (batched)
  const files = await Promise.allSettled(
    index.departments.map(slug => getFile(`${FACULTY_FOLDER}/${slug}.json`))
  );

  for (const result of files) {
    if (result.status !== 'fulfilled' || !result.value) continue;
    try {
      const deptFile: DepartmentFile = JSON.parse(result.value.content);
      if (Array.isArray(deptFile.members)) {
        for (const m of deptFile.members) {
          allMembers.push({ ...m, _department: deptFile.department } as any);
        }
      }
    } catch {}
  }

  return allMembers;
}

/** Load faculty for a specific department from the GitHub data repo. */
export async function loadDepartmentFaculty(department: string): Promise<FacultyMemberData[]> {
  const slug = deptSlug(department);
  const file = await getFile(`${FACULTY_FOLDER}/${slug}.json`);
  if (!file) return [];
  try {
    const deptFile: DepartmentFile = JSON.parse(file.content);
    return deptFile.members || [];
  } catch {
    return [];
  }
}

/** Load ALL department files and return them keyed by slug with metadata. */
export async function loadAllDepartments(): Promise<Record<string, DepartmentFile>> {
  const indexFile = await getFile(`${FACULTY_FOLDER}/index.json`);
  if (!indexFile) return {};

  let index: FacultyIndex;
  try { index = JSON.parse(indexFile.content); } catch { return {}; }

  const result: Record<string, DepartmentFile> = {};
  const files = await Promise.allSettled(
    index.departments.map(slug => getFile(`${FACULTY_FOLDER}/${slug}.json`))
  );

  for (const r of files) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    try {
      const deptFile: DepartmentFile = JSON.parse(r.value.content);
      const fileSlug = deptSlug(deptFile.department);
      result[fileSlug] = deptFile;
    } catch {}
  }

  return result;
}

/** Save a department's faculty data back to the GitHub data repo. */
export async function saveDepartmentFaculty(
  department: string,
  members: FacultyMemberData[]
): Promise<boolean> {
  const slug = deptSlug(department);
  const path = `${FACULTY_FOLDER}/${slug}.json`;
  const existing = await getFile(path);

  const deptFile: DepartmentFile = {
    department,
    updatedAt: new Date().toISOString(),
    members: members.sort((a, b) => a.sortOrder - b.sortOrder),
  };

  const content = JSON.stringify(deptFile, null, 2);
  const sha = existing?.sha || null;
  const newSha = await putFile(path, content, sha, `feat: update faculty — ${department}`);

  if (!newSha) return false;

  // Update index
  await ensureIndex(department, slug);
  return true;
}

/** Ensure the index.json includes the given department slug. */
async function ensureIndex(department: string, slug: string): Promise<void> {
  const indexFile = await getFile(`${FACULTY_FOLDER}/index.json`);
  let index: FacultyIndex;
  if (indexFile) {
    try { index = JSON.parse(indexFile.content); } catch {
      index = { departments: [], updatedAt: '' };
    }
  } else {
    index = { departments: [], updatedAt: '' };
  }

  if (!index.departments.includes(slug)) {
    index.departments.push(slug);
  }
  index.updatedAt = new Date().toISOString();

  await putFile(
    `${FACULTY_FOLDER}/index.json`,
    JSON.stringify(index, null, 2),
    indexFile?.sha || null,
    `feat: update faculty index — add ${department}`
  );
}

/** Seed initial data: writes all department files to the GitHub repo. */
export async function seedFacultyToGithub(members: Array<{ department: string; name: string; title?: string; email?: string; phone?: string; shortForm?: string; memberType?: string; claimedBy?: string; id?: string; sortOrder?: number }>): Promise<{ written: number; depts: number }> {
  const byDept = new Map<string, typeof members>();
  for (const m of members) {
    const slug = deptSlug(m.department);
    if (!byDept.has(slug)) byDept.set(slug, []);
    byDept.get(slug)!.push(m);
  }

  let written = 0;
  const depts: string[] = [];

  for (const [slug, deptMembers] of Array.from(byDept.entries())) {
    const department = deptMembers[0].department;
    const membersData: FacultyMemberData[] = deptMembers.map((m, i) => ({
      id: m.id || `seed-${slug}-${i}`,
      name: m.name,
      title: m.title || null,
      email: m.email || null,
      shortForm: m.shortForm || null,
      memberType: m.memberType || 'faculty',
      sortOrder: m.sortOrder ?? (i + 1),
      claimedBy: m.claimedBy || null,
    }));

    const ok = await saveDepartmentFaculty(department, membersData);
    if (ok) {
      written += membersData.length;
      depts.push(department);
    }
  }

  return { written, depts: depts.length };
}
