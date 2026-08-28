import crypto from 'crypto';
import { config } from './config';
import { getDepartmentFolder, findDepartment } from './departments';
import { matchCourseFolder } from './store/helpers';

const SEMS = ['1st-semister','2nd-semister','3rd-semister','4th-semister','5th-semister','6th-semister','7th-semister','8th-semister'];
const SEM_ORDINALS = ['1st','2nd','3rd','4th','5th','6th','7th','8th'];
const BATCH = 25;

// Convert a human semester label ("1st Semester") to the GitHub folder format
// ("1st-semister"). Passes through values already in the folder format.
export function semesterToGitHubFolder(semester: string): string {
  if (!semester) return semester;
  const s = semester.trim().toLowerCase();
  if (SEMS.includes(s)) return s;
  const idx = SEM_ORDINALS.findIndex(p => s.startsWith(p));
  if (idx >= 0) return SEMS[idx];
  return semester;
}

// Reject anything that could walk out of a single path segment (GitHub's
// Contents API resolves "..", so these must be blocked before building paths).
function cleanSegment(value: string, kind: 'dept' | 'sem' | 'code' | 'title'): string {
  const v = String(value ?? '').trim();
  if (!v) throw new Error(`Invalid ${kind}`);
  if (v.length > 200) throw new Error(`${kind} too long`);
  if (/[\\/\u0000-\u001F\u007F]/.test(v)) throw new Error(`Invalid ${kind}`);
  if (v === '.' || v === '..' || v.startsWith('..')) throw new Error(`Invalid ${kind}`);
  return v;
}

function validateCourseCode(value: string): string {
  const code = cleanSegment(value, 'code').toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z0-9]{2,8}[-]?\d{2,5}[A-Z]?$/.test(code)) throw new Error('Invalid course code');
  return code;
}

function validateDept(value: string): string {
  const deptId = cleanSegment(value, 'dept');
  if (!findDepartment(deptId)) throw new Error('Unknown department');
  return deptId;
}

function validateSemester(value: string): string {
  const sem = cleanSegment(value, 'sem');
  if (!SEMS.includes(sem)) throw new Error('Invalid semester');
  return sem;
}

function makeJwt(appId: string, privateKey: string) {
  const n = Math.floor(Date.now() / 1000);
  const h = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(JSON.stringify({ iat: n - 60, exp: n + 600, iss: appId })).toString('base64url');
  return h + '.' + p + '.' + crypto.createSign('RSA-SHA256').update(h + '.' + p).sign(privateKey, 'base64url');
}

async function api(method: string, urlPath: string, body: any, token: string) {
  const bodyStr = body ? JSON.stringify(body) : null;
  const res = await fetch('https://api.github.com' + urlPath, {
    method,
    headers: {
      'Authorization': 'Bearer ' + token,
      'User-Agent': 'IIUC-ARMS',
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(bodyStr ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(bodyStr ? { body: bodyStr } : {}),
  });
  const data = await res.json();
  return { s: res.status, d: data };
}

/* ─── Cloud Data Files (course/teacher mapping etc.) ────────────────── */

export interface CloudTeacherMap {
  version?: number;
  updatedAt?: number;
  updatedBy?: string;
  departments?: Record<string, Record<string, { code: string; title?: string; teacher?: string; room?: string }[]>>;
}

const CLOUD_CACHE_TTL = 60 * 1000;
let cloudCache: { key: string; ts: number; data: CloudTeacherMap } | null = null;

async function getCloudFileToken(): Promise<string | null> {
  const appId = process.env.GITHUB_ID;
  const privateKey = (process.env.GITHUB_PRIVATE_KEY || '').replace(/\\n/g, '\n').replace(/^"/, '').replace(/"$/, '');
  if (!appId || !privateKey) return null;
  const jwt = makeJwt(appId, privateKey);
  const inst = await api('GET', `/repos/${config.owner}/${config.repo}/installation`, null, jwt);
  if (inst.s !== 200) return null;
  const tok = (await api('POST', `/app/installations/${inst.d.id}/access_tokens`, null, jwt)).d.token;
  return tok || null;
}

// Read a UTF-8 file from the data repo (GitHub = the cloud storage backend).
export async function readCloudFile(path: string): Promise<string | null> {
  const token = await getCloudFileToken();
  if (!token) return null;
  const res = await api('GET', `/repos/${config.owner}/${config.repo}/contents/${path}`, null, token);
  if (res.s !== 200 || !res.d?.content) return null;
  const buffer = Buffer.from(res.d.content, 'base64');
  return buffer.toString('utf8');
}

// Write (create or update) a UTF-8 file in the data repo.
export async function writeCloudFile(path: string, content: string, message: string): Promise<{ success: boolean; error?: string }> {
  const token = await getCloudFileToken();
  if (!token) return { success: false, error: 'Cloud not configured' };
  const existing = await api('GET', `/repos/${config.owner}/${config.repo}/contents/${path}`, null, token);
  const body: any = {
    message,
    content: Buffer.from(content, 'utf8').toString('base64'),
  };
  if (existing.s === 200 && existing.d?.sha) body.sha = existing.d.sha;
  const res = await api('PUT', `/repos/${config.owner}/${config.repo}/contents/${path}`, body, token);
  if (res.s === 200 || res.s === 201) return { success: true };
  return { success: false, error: res.d?.message || 'Failed to save to cloud' };
}

// course-teachers.json holds "which course is taught by which teacher" per
// department + semester. Routines barely change each semester, so teachers are
// remembered here and re-applied automatically when building a routine.
export async function fetchCloudTeacherMapping(force = false): Promise<CloudTeacherMap> {
  const key = `${config.owner}/${config.repo}/course-teachers`;
  if (!force && cloudCache && cloudCache.key === key && Date.now() - cloudCache.ts < CLOUD_CACHE_TTL) {
    return cloudCache.data;
  }
  const raw = await readCloudFile(`${config.routineDataFolder}/course-teachers.json`);
  let data: CloudTeacherMap = {};
  if (raw) {
    try { data = JSON.parse(raw); } catch {}
  }
  if (!data || typeof data !== 'object') data = {};
  if (!data.departments) data.departments = {};
  cloudCache = { key, ts: Date.now(), data };
  return data;
}

export async function saveTeacherMapping(mapping: CloudTeacherMap, byEmail: string): Promise<{ success: boolean; error?: string }> {
  const payload: CloudTeacherMap = {
    version: 1,
    updatedAt: Date.now(),
    updatedBy: byEmail,
    departments: mapping.departments || {},
  };
  const res = await writeCloudFile(
    `${config.routineDataFolder}/course-teachers.json`,
    JSON.stringify(payload, null, 2),
    'Update course-teacher mapping',
  );
  if (res.success) {
    cloudCache = { key: `${config.owner}/${config.repo}/course-teachers`, ts: Date.now(), data: payload };
  }
  return res;
}

function parseCourseFolder(name: string): { code: string; title: string } | null {
  return matchCourseFolder(name);
}

export async function fetchCoursesFromGitHub(deptId: string, semester: string): Promise<{ code: string; title: string }[]> {
  const appId = process.env.GITHUB_ID;
  const privateKey = (process.env.GITHUB_PRIVATE_KEY || '').replace(/\\n/g, '\n').replace(/^"/, '').replace(/"$/, '');
  if (!appId || !privateKey) return [];

  try {
    const safeDept = validateDept(deptId);
    const safeSem = validateSemester(semester);
    const jwt = makeJwt(appId, privateKey);
    const inst = await api('GET', `/repos/${config.owner}/${config.repo}/installation`, null, jwt);
    if (inst.s !== 200) return [];
    const tok = (await api('POST', `/app/installations/${inst.d.id}/access_tokens`, null, jwt)).d.token;

    const folderPath = `${config.uploadPath}/${getDepartmentFolder(safeDept)}/${safeSem}`;
    const treeRes = await api('GET', `/repos/${config.owner}/${config.repo}/contents/${folderPath}`, null, tok);
    if (treeRes.s !== 200 || !Array.isArray(treeRes.d)) return [];

    const courses: { code: string; title: string }[] = [];
    for (const item of treeRes.d) {
      if (item.type !== 'dir') continue;
      const parsed = parseCourseFolder(item.name);
      if (parsed) courses.push(parsed);
    }
    return courses;
  } catch {
    return [];
  }
}

export async function createCourseFolder(deptId: string, semester: string, courseCode: string, courseTitle: string): Promise<{ success: boolean; error?: string }> {
  const appId = process.env.GITHUB_ID;
  const privateKey = (process.env.GITHUB_PRIVATE_KEY || '').replace(/\\n/g, '\n').replace(/^"/, '').replace(/"$/, '');
  if (!appId || !privateKey) return { success: false, error: 'GitHub App not configured' };

  try {
    const safeDept = validateDept(deptId);
    const safeSem = validateSemester(semester);
    const safeCode = validateCourseCode(courseCode);
    const safeTitle = cleanSegment(courseTitle, 'title').replace(/\s+/g, ' ');

    const jwt = makeJwt(appId, privateKey);
    const inst = await api('GET', `/repos/${config.owner}/${config.repo}/installation`, null, jwt);
    if (inst.s !== 200) return { success: false, error: 'Failed to get installation' };
    const tok = (await api('POST', `/app/installations/${inst.d.id}/access_tokens`, null, jwt)).d.token;

    const refRes = await api('GET', `/repos/${config.owner}/${config.repo}/git/refs/heads/main`, null, tok);
    if (refRes.s !== 200) return { success: false, error: 'Failed to get ref' };
    let currentSha = refRes.d.object.sha;

    const folderName = `${safeCode} - ${safeTitle}`;
    const subfolders = ['Mid/NOTES', 'Mid/Previous Questions', 'Final/NOTES', 'Final/Previous Questions', 'sheet', 'Syllabus', 'Other'];
    const deptFolder = getDepartmentFolder(safeDept);
    const paths = subfolders.map(sf => `${config.uploadPath}/${deptFolder}/${safeSem}/${folderName}/${sf}/.gitkeep`);

    const treeRes = await api('POST', `/repos/${config.owner}/${config.repo}/git/trees`, {
      base_tree: currentSha,
      tree: paths.map(p => ({ path: p, mode: '100644', type: 'blob', sha: 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391' })),
    }, tok);
    if (treeRes.s !== 201) return { success: false, error: 'Failed to create tree' };

    const commitRes = await api('POST', `/repos/${config.owner}/${config.repo}/git/commits`, {
      message: `Add course folder: ${folderName} in ${deptFolder}/${safeSem}`,
      tree: treeRes.d.sha,
      parents: [currentSha],
    }, tok);
    if (commitRes.s !== 201) return { success: false, error: 'Failed to commit' };

    await api('PATCH', `/repos/${config.owner}/${config.repo}/git/refs/heads/main`, { sha: commitRes.d.sha, force: true }, tok);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function createDepartmentFolders(deptId: string): Promise<{ success: boolean; created: number; error?: string }> {
  const appId = process.env.GITHUB_ID;
  const privateKey = (process.env.GITHUB_PRIVATE_KEY || '').replace(/\\n/g, '\n').replace(/^"/, '').replace(/"$/, '');

  if (!appId || !privateKey) {
    return { success: false, created: 0, error: 'GitHub App credentials not configured' };
  }

  try {
    const safeDept = validateDept(deptId);
    const jwt = makeJwt(appId, privateKey);
    const inst = await api('GET', `/repos/${config.owner}/${config.repo}/installation`, null, jwt);
    if (inst.s !== 200) return { success: false, created: 0, error: 'Failed to get installation' };

    const tok = (await api('POST', `/app/installations/${inst.d.id}/access_tokens`, null, jwt)).d.token;

    const refRes = await api('GET', `/repos/${config.owner}/${config.repo}/git/refs/heads/main`, null, tok);
    if (refRes.s !== 200) return { success: false, created: 0, error: 'Failed to get ref' };
    let currentSha = refRes.d.object.sha;

    // Get existing tree
    const treeRes = await api('GET', `/repos/${config.owner}/${config.repo}/git/trees/${currentSha}?recursive=1`, null, tok);
    const existing = new Set(treeRes.d.tree.map((f: any) => f.path));

    // Build paths — only semester folders and related-sources (course subfolders are created on demand)
    const paths: string[] = [];
    const deptFolder = getDepartmentFolder(safeDept);
    for (const sem of SEMS) {
      const p = `${config.uploadPath}/${deptFolder}/${sem}/.gitkeep`;
      if (!existing.has(p)) paths.push(p);
    }
    const rp = `${config.uploadPath}/${deptFolder}/${config.relatedSourcesFolder}/.gitkeep`;
    if (!existing.has(rp)) paths.push(rp);

    if (paths.length === 0) {
      return { success: true, created: 0 };
    }

    let created = 0;
    const totalBatches = Math.ceil(paths.length / BATCH);

    for (let i = 0; i < paths.length; i += BATCH) {
      const batch = paths.slice(i, i + BATCH);
      const batchNum = Math.floor(i / BATCH) + 1;

      const entries = batch.map(p => ({
        path: p,
        mode: '100644',
        type: 'blob',
        sha: 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391',
      }));

      const treeRes2 = await api('POST', `/repos/${config.owner}/${config.repo}/git/trees`, {
        base_tree: currentSha,
        tree: entries,
      }, tok);

      if (treeRes2.s !== 201) continue;

      const commitRes = await api('POST', `/repos/${config.owner}/${config.repo}/git/commits`, {
        message: `Create folder structure for ${deptId} (batch ${batchNum}/${totalBatches})`,
        tree: treeRes2.d.sha,
        parents: [currentSha],
      }, tok);

      if (commitRes.s !== 201) continue;

      currentSha = commitRes.d.sha;
      created += batch.length;
    }

    if (created > 0) {
      await api('PATCH', `/repos/${config.owner}/${config.repo}/git/refs/heads/main`, { sha: currentSha, force: true }, tok);
    }

    return { success: true, created };
  } catch (e: any) {
    return { success: false, created: 0, error: e.message };
  }
}
