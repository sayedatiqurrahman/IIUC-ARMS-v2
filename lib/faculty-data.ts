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

export interface FacultyMemberData {
  id: string;
  name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  shortForm?: string | null;
  memberType: string;
  sortOrder: number;
  claimedBy?: string | null;
  isCR?: boolean;
  isVisible?: boolean;
  _department?: string;
}

interface DepartmentFile {
  department: string;
  updatedAt: string;
  members: FacultyMemberData[];
}

interface FacultyIndex {
  departments: string[];
  updatedAt: string;
  complete?: boolean;
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
          allMembers.push({ ...m, _department: deptFile.department });
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

// The directory is large and barely changes, so reads are cached for a short
// TTL — this is what lets the live directory page skip the database entirely.
const FACULTY_CACHE_TTL = 60 * 1000;
let facultyCache: { ts: number; data: FacultyMemberData[]; complete: boolean } | null = null;

/**
 * Load the cloud faculty directory (flattened) plus whether the cloud copy is
 * "complete" (a full backup has been written for every department). The GET
 * route only serves from the cloud once complete — otherwise it falls back to
 * the DB so a partial backup can never show a half-empty directory.
 */
export async function loadCloudFacultyIndex(): Promise<{ members: FacultyMemberData[]; complete: boolean }> {
  if (facultyCache && Date.now() - facultyCache.ts < FACULTY_CACHE_TTL) {
    return { members: facultyCache.data, complete: facultyCache.complete };
  }

  const indexFile = await getFile(`${FACULTY_FOLDER}/index.json`);
  let complete = false;
  const members: FacultyMemberData[] = [];

  if (indexFile) {
    let index: FacultyIndex;
    try { index = JSON.parse(indexFile.content); } catch { index = { departments: [], updatedAt: '' }; }
    complete = index.complete === true;

    if (Array.isArray(index.departments) && index.departments.length > 0) {
      const files = await Promise.allSettled(
        index.departments.map(slug => getFile(`${FACULTY_FOLDER}/${slug}.json`))
      );
      for (const result of files) {
        if (result.status !== 'fulfilled' || !result.value) continue;
        try {
          const deptFile: DepartmentFile = JSON.parse(result.value.content);
          if (Array.isArray(deptFile.members)) {
            for (const m of deptFile.members) {
              members.push({ ...m, _department: deptFile.department });
            }
          }
        } catch {}
      }
    }
  }

  facultyCache = { ts: Date.now(), data: members, complete };
  return { members, complete };
}

/** Force-refresh the cloud directory cache (call after a write-back). */
export function invalidateFacultyCache(): void {
  facultyCache = null;
}

/**
 * Rewrite one department's faculty file in the data repo from the live DB.
 * Called after every create/edit/delete/claim so the repo stays the current
 * must up with the DB (the DB remains the write authority).
 */
export async function mirrorDepartmentToCloud(department: string): Promise<{ success: boolean; error?: string }> {
  const { resolveDepartment, findDepartment, getDepartmentDisplayName } = await import('@/lib/departments');
  const { prisma } = await import('@/lib/prisma');

  try {
    const canonical = resolveDepartment(department);
    const found = findDepartment(canonical);
    // All stored spellings that resolve to this department (canonical name + id/
    // short/folder variants + legacy values like "Finance").
    const deptValues = found
      ? [
          found.department.id,
          found.department.name,
          ...(found.department.folder ? [found.department.folder] : []),
          ...(found.department.shortName ? [found.department.shortName] : []),
        ]
      : [department];

    const rows = await prisma.facultyMember.findMany({ where: { department: { in: deptValues } } });
    const deptRows = rows.filter(r => resolveDepartment(r.department) === canonical);

    const members: FacultyMemberData[] = deptRows.map(r => ({
      id: r.id,
      name: r.name,
      title: r.title || null,
      email: r.email || null,
      phone: r.phone || null,
      shortForm: r.shortForm || null,
      memberType: r.memberType,
      sortOrder: r.sortOrder,
      claimedBy: r.claimedBy || null,
      isCR: r.isCR || false,
      isVisible: r.isVisible || false,
    }));

    const headerDept = found ? getDepartmentDisplayName(canonical) : department;
    const ok = await saveDepartmentFaculty(headerDept, members);
    if (!ok) return { success: false, error: 'Cloud write failed' };
    invalidateFacultyCache();
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Mirror failed' };
  }
}

/**
 * Rewrite every department file from the DB (a full backup) and mark the cloud
 * copy as complete so live reads can switch over. `rows` may be supplied by
 * callers that already have the full list (e.g. the admin sync route).
 */
export async function mirrorAllDepartmentsToCloud(rows?: any[]): Promise<{ written: number; depts: number }> {
  let all: any;
  if (rows) {
    all = rows;
  } else {
    const { prisma } = await import('@/lib/prisma');
    all = await prisma.facultyMember.findMany();
  }
  const members = all.map((m: any) => ({
    department: m.department,
    name: m.name,
    title: m.title || undefined,
    email: m.email || undefined,
    phone: m.phone || undefined,
    shortForm: m.shortForm || undefined,
    memberType: m.memberType,
    claimedBy: m.claimedBy || undefined,
    id: m.id,
    sortOrder: m.sortOrder,
    isCR: m.isCR || false,
    isVisible: m.isVisible || false,
  }));
  return seedFacultyToGithub(members);
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
      index = { departments: [], updatedAt: '', complete: false };
    }
  } else {
    index = { departments: [], updatedAt: '', complete: false };
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
export async function seedFacultyToGithub(members: Array<{ department: string; name: string; title?: string; email?: string; phone?: string; shortForm?: string; memberType?: string; claimedBy?: string; id?: string; sortOrder?: number; isCR?: boolean; isVisible?: boolean }>): Promise<{ written: number; depts: number }> {
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
      phone: m.phone || null,
      shortForm: m.shortForm || null,
      memberType: m.memberType || 'faculty',
      sortOrder: m.sortOrder ?? (i + 1),
      claimedBy: m.claimedBy || null,
      isCR: m.isCR || false,
      isVisible: m.isVisible || false,
    }));

    const ok = await saveDepartmentFaculty(department, membersData);
    if (ok) {
      written += membersData.length;
      depts.push(department);
    }
  }

  // A full seeding covers every department → mark the cloud copy complete so
  // the live directory can be served from it.
  await markIndexComplete();

  return { written, depts: depts.length };
}

async function markIndexComplete(): Promise<void> {
  const indexFile = await getFile(`${FACULTY_FOLDER}/index.json`);
  let index: FacultyIndex;
  if (indexFile) {
    try { index = JSON.parse(indexFile.content); } catch {
      index = { departments: [], updatedAt: '', complete: false };
    }
  } else {
    index = { departments: [], updatedAt: '', complete: false };
  }
  index.complete = true;
  index.updatedAt = new Date().toISOString();
  await putFile(
    `${FACULTY_FOLDER}/index.json`,
    JSON.stringify(index, null, 2),
    indexFile?.sha || null,
    'feat: mark faculty cloud backup complete'
  );
  invalidateFacultyCache();
}
