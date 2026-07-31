import { config } from '@/lib/config';
import { FACULTIES } from '@/lib/departments';
import { getAppInstallations, getInstallationAccessToken } from '@/lib/github-app';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const API = `https://api.telegram.org/bot${TOKEN}`;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://iiuc-arms.eu.cc';

// ─── GitHub token resolver (App token > env token > empty) ─────────

let cachedToken: string | null = null;
let cachedTokenTs = 0;
const TOKEN_CACHE_TTL = 50 * 60 * 1000;

export async function resolveGithubToken(): Promise<string> {
  if (cachedToken && Date.now() - cachedTokenTs < TOKEN_CACHE_TTL) return cachedToken;

  // Try env token first
  if (process.env.GITHUB_TOKEN) {
    cachedToken = process.env.GITHUB_TOKEN;
    cachedTokenTs = Date.now();
    return cachedToken;
  }

  // Try GitHub App installation token
  try {
    const installations = await getAppInstallations();
    if (Array.isArray(installations) && installations.length > 0) {
      const token = await getInstallationAccessToken(installations[0].id);
      if (token) {
        cachedToken = token;
        cachedTokenTs = Date.now();
        return token;
      }
    }
  } catch {}

  return '';
}

// ─── Telegram API helpers ─────────────────────────────────────────

export async function sendMessage(chatId: number, text: string, extra?: any) {
  const res = await fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[TG] sendMessage FAILED: ${res.status} ${body.substring(0, 300)}`);
  }
  return res;
}

export async function sendChatAction(chatId: number, action: string = 'typing') {
  return fetch(`${API}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action }),
  });
}

export async function sendMessageWithButton(chatId: number, text: string, buttonText: string, buttonUrl: string) {
  return fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[{ text: buttonText, url: buttonUrl }]],
      },
    }),
  });
}

export async function sendMessageWithButtons(chatId: number, text: string, buttons: { text: string; callback_data?: string; url?: string }[][]) {
  return fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: buttons,
      },
    }),
  });
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  return fetch(`${API}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text, show_alert: false }),
  });
}

export async function editMessageText(chatId: number, messageId: number, text: string, extra?: any) {
  return fetch(`${API}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra }),
  });
}

export async function deleteMessage(chatId: number, messageId: number) {
  return fetch(`${API}/deleteMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
  });
}

// ─── GitHub tree cache ────────────────────────────────────────────

let treeCache: { tree: any[]; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

export async function getGithubTree(): Promise<any[]> {
  if (treeCache && Date.now() - treeCache.ts < CACHE_TTL) return treeCache.tree;

  const token = await resolveGithubToken();
  const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' };
  if (token) headers['Authorization'] = `token ${token}`;

  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/git/trees/${config.branch}?recursive=1`;
  const res = await fetch(url, { headers, cache: 'no-store' });
  if (!res.ok) return [];
  const data = await res.json();
  treeCache = { tree: data.tree || [], ts: Date.now() };
  return treeCache.tree;
}

// ─── Category detection ───────────────────────────────────────────

export function detectCategory(name: string): string {
  const l = name.toLowerCase();
  if (l === 'sheet') return 'sheet';
  if (l === 'notes' || l === 'note') return 'notes';
  if (l === 'previous questions' || l.includes('previous question')) return 'questions';
  if (l === 'syllabus') return 'syllabus';
  return 'other';
}

// Detect README.md (shared links) for a course in the tree
export function hasSharedLinks(tree: any[], deptId: string, semId: string, courseFolder: string): boolean {
  const prefix = `${config.uploadPath}/${deptId}/${semId}/${courseFolder}/`;
  for (const item of tree) {
    if (item.type !== 'blob') continue;
    if (!item.path.startsWith(prefix)) continue;
    const fileName = item.path.split('/').pop();
    if (fileName?.toLowerCase() === 'readme.md') return true;
  }
  return false;
}

// Count README.md files under a course folder (shared links indicator)
export function countSharedLinks(tree: any[], deptId: string, semId: string, courseFolder: string): number {
  const prefix = `${config.uploadPath}/${deptId}/${semId}/${courseFolder}/`;
  let count = 0;
  for (const item of tree) {
    if (item.type !== 'blob') continue;
    if (!item.path.startsWith(prefix)) continue;
    const fileName = item.path.split('/').pop();
    if (fileName?.toLowerCase() === 'readme.md') count++;
  }
  return count;
}

export const CATEGORY_META: Record<string, { label: string; icon: string; folder: string }> = {
  sheet:     { label: 'Sheets',             icon: '📊', folder: 'sheet' },
  notes:     { label: 'Notes',              icon: '📝', folder: 'NOTES' },
  questions: { label: 'Previous Questions', icon: '📋', folder: 'Previous Questions' },
  syllabus:  { label: 'Syllabus',           icon: '📘', folder: 'Syllabus' },
  other:     { label: 'Other',              icon: '📁', folder: 'Other' },
};

// ─── Department name lookup ───────────────────────────────────────

export function getDeptName(deptId: string): string {
  for (const f of FACULTIES) {
    const d = f.departments.find(dd => dd.id === deptId);
    if (d) return d.shortName;
  }
  return deptId.toUpperCase();
}

export function getDeptFullName(deptId: string): string {
  for (const f of FACULTIES) {
    const d = f.departments.find(dd => dd.id === deptId);
    if (d) return d.name;
  }
  return deptId;
}

// ─── Course file search ───────────────────────────────────────────

export interface FoundFile {
  path: string;
  fileName: string;
  category: string;
  semester: string;
  department: string;
  courseFolder: string;
  courseCode: string;
}

export interface CourseInfo {
  courseCode: string;
  departments: string[];
  semesters: string[];
  categories: string[];
  totalFiles: number;
}

export function findCourseFiles(tree: any[], courseCode: string): FoundFile[] {
  const code = courseCode.toUpperCase().trim();
  const codeNoHyphen = code.replace('-', '');
  const results: FoundFile[] = [];

  for (const item of tree) {
    if (item.type !== 'blob') continue;
    const p: string = item.path;
    if (!p.startsWith(config.uploadPath + '/')) continue;

    const rel = p.substring(config.uploadPath.length + 1);
    const parts = rel.split('/');
    if (parts.length < 4) continue;

    const deptId = parts[0];
    const semId = parts[1];

    // New structure: dept/sem/COURSE/Mid|Final/cat/file (course at parts[2])
    // Old structure: dept/sem/cat/COURSE/file (course at parts[3])
    const COURSE_RE = /^([A-Z]{2,5}-\d{3,5})\s*-\s*(.+)/i;
    let courseIdx = -1;
    if (parts[2] && COURSE_RE.test(parts[2])) {
      courseIdx = 2;
    } else if (parts[3] && COURSE_RE.test(parts[3])) {
      courseIdx = 3;
    }
    if (courseIdx < 0) continue;

    const courseFolder = parts[courseIdx];
    const dashIdx = courseFolder.indexOf(' - ');
    const folderCode = dashIdx > 0 ? courseFolder.substring(0, dashIdx).toUpperCase() : courseFolder.split(' ')[0].toUpperCase();
    const folderCodeNoHyphen = folderCode.replace('-', '');

    if (folderCode !== code && folderCodeNoHyphen !== codeNoHyphen) continue;

    // Determine category from remaining parts
    let category = 'other';
    const catIdx = courseIdx + 1;
    if (catIdx < parts.length) {
      const next = parts[catIdx];
      if (next === 'Mid' || next === 'Final') {
        if (catIdx + 1 < parts.length) {
          category = detectCategory(parts[catIdx + 1]);
        }
      } else if (next !== '.gitkeep' && next.toLowerCase() !== 'readme.md') {
        category = detectCategory(next);
      }
    }

    results.push({
      path: p,
      fileName: parts.slice(courseIdx + 1).join('/') || courseFolder,
      category,
      semester: semId,
      department: deptId,
      courseFolder,
      courseCode: code,
    });
  }

  return results;
}

export function getCourseInfo(files: FoundFile[]): CourseInfo | null {
  if (files.length === 0) return null;
  const depts = Array.from(new Set(files.map(f => f.department)));
  const sems = Array.from(new Set(files.map(f => f.semester)));
  const cats = Array.from(new Set(files.map(f => f.category)));
  return {
    courseCode: files[0].courseCode,
    departments: depts,
    semesters: sems,
    categories: cats,
    totalFiles: files.length,
  };
}

// ─── Website deep link builder ────────────────────────────────────

function telegramLink(url: string): string {
  return SITE_URL + '/open?url=' + encodeURIComponent(url);
}

export function buildBrowseLink(params: Record<string, string>): string {
  const qs = new URLSearchParams(params);
  return telegramLink(SITE_URL + '/?' + qs.toString());
}

export function buildCourseLink(courseCode: string, dept?: string, sem?: string, cat?: string): string {
  const params: Record<string, string> = { q: courseCode };
  if (dept) params.dept = dept;
  if (sem) params.sem = sem;
  if (cat) params.cat = cat;
  return telegramLink(SITE_URL + '/?' + new URLSearchParams(params).toString());
}

// ─── Message builders ─────────────────────────────────────────────

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildWelcomeMessage(): string {
  return (
    `🎓 <b>IIUC-ARMS Bot</b>\n\n` +
    `Find academic resources for IIUC courses.\n\n` +
    `<b>How to use:</b>\n` +
    `• Send a course code → <code>QUR101</code>\n` +
    `• Search files → <code>/search notes</code>\n` +
    `• List departments → <code>/departments</code>\n` +
    `• Browse semester → <code>/semester 3</code>\n\n` +
    `<b>📎 Shared Links:</b>\n` +
    `Courses with 📎 have shared links.\n` +
    `Open on website to view and add links.\n\n` +
    `All results link directly to the website — no files shared here.\n\n` +
    `<i>📚 Powered by IIUC-ARMS</i>`
  );
}

export function buildHelpMessage(): string {
  return (
    `📖 <b>IIUC-ARMS Bot Commands</b>\n\n` +
    `<b>🔍 Browse & Search:</b>\n` +
    `<code>QUR101</code> — Search a course by code\n` +
    `<code>/course-code QSM-3602</code> — Search a specific course\n` +
    `<code>/courses</code> — List all courses (dept > sem > courses)\n` +
    `<code>/courses qs</code> — Courses in QSIS dept only\n` +
    `<code>/courses qs 3</code> — Courses in QSIS, 3rd semester\n` +
    `<code>/departments</code> — List all departments with links\n` +
    `<code>/semester 3</code> — Courses in semester 3\n` +
    `<code>/search notes</code> — Search files by name\n` +
    `<code>/stats</code> — View site statistics\n\n` +
    `<b>📎 Shared Links:</b>\n` +
    `Courses with 📎 have shared links (notes, resources).\n` +
    `Open on website to view and add shared links.\n\n` +
    `<b>📢 Admin Only:</b>\n` +
    `<code>/broadcast &lt;message&gt;</code> — Send announcement to all users\n\n` +
    `<b>Examples:</b>\n` +
    `• <code>QUR101</code>\n` +
    `• <code>/course-code QSM-3602</code>\n` +
    `• <code>/courses cse 3</code>\n` +
    `• <code>/search notes</code>\n` +
    `• <code>/semester 3</code>\n` +
    `• <code>/stats</code>\n\n` +
    `<i>All results show links to the website. No files are shared directly.</i>`
  );
}

export function buildCourseResult(courseCode: string, info: CourseInfo, files: FoundFile[], tree?: any[]): string {
  let msg = `<b>📚 ${esc(courseCode)}</b>\n`;
  msg += `📄 ${info.totalFiles} file${info.totalFiles !== 1 ? 's' : ''} found\n\n`;

  // Group by dept > sem
  const byDept = new Map<string, Map<string, FoundFile[]>>();
  for (const f of files) {
    if (!byDept.has(f.department)) byDept.set(f.department, new Map());
    const semMap = byDept.get(f.department)!;
    if (!semMap.has(f.semester)) semMap.set(f.semester, []);
    semMap.get(f.semester)!.push(f);
  }

  for (const [dept, semMap] of Array.from(byDept.entries())) {
    const deptName = getDeptFullName(dept);
    msg += `<b>🏢 ${esc(deptName)} (${getDeptName(dept)})</b>\n`;
    for (const [sem, sFiles] of Array.from(semMap.entries())) {
      const semLabel = config.semesters.find(s => s.id === sem)?.label || sem;
      const categories = Array.from(new Set(sFiles.map(f => f.category)));
      const catList = categories.map(c => {
        const meta = CATEGORY_META[c];
        return `${meta?.icon || '📁'} ${meta?.label || c}`;
      }).join(' · ');
      const link = buildCourseLink(courseCode, dept, sem);
      const links = tree ? hasSharedLinks(tree, dept, sem, sFiles[0]?.courseFolder || '') : false;
      const linkBadge = links ? ' 📎 Shared Links' : '';
      msg += `  📅 ${esc(semLabel)} — ${sFiles.length} files${linkBadge}\n`;
      msg += `    ${catList}\n`;
      msg += `    <a href="${link}">Open on IIUC-ARMS →</a>\n\n`;
    }
  }

  return msg.trim();
}

export function buildCategoryResult(courseCode: string, category: string, files: FoundFile[]): string {
  const meta = CATEGORY_META[category];
  if (!meta || files.length === 0) {
    return `❌ No ${CATEGORY_META[category]?.label || category} found for <b>${esc(courseCode)}</b>.`;
  }

  const byDept: Record<string, Record<string, FoundFile[]>> = {};
  for (const f of files) {
    if (!byDept[f.department]) byDept[f.department] = {};
    if (!byDept[f.department][f.semester]) byDept[f.department][f.semester] = [];
    byDept[f.department][f.semester].push(f);
  }

  let msg = `<b>${meta.icon} ${meta.label} — ${esc(courseCode)}</b>\n\n`;

  for (const [dept, sems] of Object.entries(byDept)) {
    const deptName = getDeptFullName(dept);
    msg += `<b>📂 ${esc(deptName)}</b>\n`;

    for (const [sem, sFiles] of Object.entries(sems)) {
      const semLabel = config.semesters.find(s => s.id === sem)?.label || sem;
      const link = buildCourseLink(courseCode, dept, sem, category);
      msg += `  📅 ${esc(semLabel)} — <a href="${link}">${sFiles.length} file${sFiles.length > 1 ? 's' : ''} → Open</a>\n`;
    }
    msg += '\n';
  }

  return msg.trim();
}

export function buildDeptList(): string {
  let msg = `<b>📂 Departments</b>\n\n`;

  for (const fac of FACULTIES) {
    msg += `<b>${esc(fac.name)}</b>\n`;
    for (const d of fac.departments) {
      const link = buildBrowseLink({ dept: d.id });
      msg += `  • ${esc(d.shortName)} — <a href="${link}">Browse →</a>\n`;
    }
    msg += '\n';
  }

  return msg.trim();
}

export function buildSemesterList(semNumber: string): string {
  const num = parseInt(semNumber);
  if (num < 1 || num > 8) return `❌ Invalid semester. Use 1-8.`;

  const semId = `${num}${num === 1 ? 'st' : num === 2 ? 'nd' : num === 3 ? 'rd' : 'th'}-semister`;
  const semLabel = config.semesters.find(s => s.id === semId)?.label || semId;

  let msg = `<b>📅 ${esc(semLabel)}</b>\n\n`;
  msg += `Browse all departments for this semester:\n\n`;

  for (const fac of FACULTIES) {
    msg += `<b>${esc(fac.shortName)}</b>\n`;
    for (const d of fac.departments) {
      const link = buildBrowseLink({ dept: d.id, sem: semId });
      msg += `  • ${esc(d.shortName)} — <a href="${link}">Open →</a>\n`;
    }
    msg += '\n';
  }

  return msg.trim();
}

export function buildSearchResults(query: string, tree: any[]): string {
  const q = query.toLowerCase();
  const matches: { path: string; parts: string[] }[] = [];

  for (const item of tree) {
    if (item.type !== 'blob') continue;
    const p: string = item.path;
    if (!p.startsWith(config.uploadPath + '/')) continue;
    const fileName = p.split('/').pop() || '';
    if (!fileName.toLowerCase().includes(q)) continue;
    const rel = p.substring(config.uploadPath.length + 1);
    matches.push({ path: p, parts: rel.split('/') });
  }

  if (matches.length === 0) {
    return `🔍 No results for "<b>${esc(query)}</b>"\n\nTry a different search term.`;
  }

  const shown = matches.slice(0, 10);
  let msg = `<b>🔍 Search: "${esc(query)}"</b>\n`;
  msg += `Found ${matches.length} file${matches.length > 1 ? 's' : ''}\n\n`;

  for (const m of shown) {
    const dept = m.parts[0];
    const sem = m.parts[1];
    const cat = m.parts[2];
    const course = m.parts[3] || '';
    const courseCode = course.split('-')[0]?.toUpperCase() || course;
    const fileName = m.path.split('/').pop() || '';
    const link = buildCourseLink(courseCode, dept, sem);
    msg += `📄 <a href="${link}">${esc(fileName)}</a>\n`;
    msg += `   ${esc(getDeptName(dept))} · ${esc(courseCode)}\n\n`;
  }

  if (matches.length > 10) {
    msg += `<i>...and ${matches.length - 10} more. Search on website →</i>\n`;
    msg += `<a href="${buildBrowseLink({ q: query })}">Open IIUC-ARMS →</a>`;
  }

  return msg.trim();
}

// ─── Callback data builders ───────────────────────────────────────

export function catCallbackData(courseCode: string, category: string): string {
  return `cat:${courseCode}:${category}`;
}

export function deleteConfirmData(courseId: string): string {
  return `del_confirm:${courseId}`;
}

export function deleteRejectData(courseId: string): string {
  return `del_reject:${courseId}`;
}

export function broadcastCallbackData(action: 'confirm' | 'cancel'): string {
  return `broadcast:${action}`;
}

// ─── Course listing by dept/sem ────────────────────────────────────

export function buildCoursesList(tree: any[], deptId?: string, semId?: string): string {
  // Structure: Map<dept, Map<sem, Map<code, {title, files, folder}>>>
  const tree2 = new Map<string, Map<string, Map<string, { title: string; files: number; folder: string }>>>();

  for (const item of tree) {
    if (item.type !== 'blob') continue;
    const p: string = item.path;
    if (!p.startsWith(config.uploadPath + '/')) continue;

    const rel = p.substring(config.uploadPath.length + 1);
    const parts = rel.split('/');
    if (parts.length < 4) continue;

    const dept = parts[0];
    const sem = parts[1];
    const courseFolder = parts[3];

    if (deptId && dept !== deptId) continue;
    if (semId && sem !== semId) continue;

    const codeMatch = courseFolder.match(/^([A-Z]{2,5}-?\d{3,5})\s*-\s*(.+)/i);
    if (!codeMatch) continue;

    const code = codeMatch[1].toUpperCase();
    const title = codeMatch[2].trim();

    if (!tree2.has(dept)) tree2.set(dept, new Map());
    const semMap = tree2.get(dept)!;
    if (!semMap.has(sem)) semMap.set(sem, new Map());
    const courseMap = semMap.get(sem)!;
    if (!courseMap.has(code)) {
      courseMap.set(code, { title, files: 0, folder: courseFolder });
    }
    courseMap.get(code)!.files++;
  }

  if (tree2.size === 0) {
    const filter = deptId && semId ? ` in ${getDeptName(deptId)} / ${semId}` : deptId ? ` in ${getDeptName(deptId)}` : semId ? ` in ${semId}` : '';
    return `📚 No courses found${filter}.\n\nTry:\n• <code>/departments</code> to browse\n• <code>/semester 3</code> to see semesters`;
  }

  let msg = `<b>📚 Courses</b>\n`;

  const sortedDepts = Array.from(tree2.keys()).sort();
  for (const dept of sortedDepts) {
    const semMap = tree2.get(dept)!;
    msg += `\n<b>🏢 ${esc(getDeptFullName(dept))}</b>\n`;

    const sortedSems = Array.from(semMap.keys()).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    for (const sem of sortedSems) {
      const courseMap = semMap.get(sem)!;
      const semLabel = config.semesters.find(s => s.id === sem)?.label || sem;
      msg += `\n  📅 <b>${esc(semLabel)}</b>\n`;

      const sortedCourses = Array.from(courseMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      for (const [code, info] of sortedCourses) {
        const link = buildCourseLink(code, dept, sem);
        const links = hasSharedLinks(tree, dept, sem, info.folder);
        const linkBadge = links ? ' 📎' : '';
        msg += `    • <code>${esc(code)}</code> — ${esc(info.title)} (${info.files} files${linkBadge})\n`;
        msg += `      <a href="${link}">Open →</a>\n`;
      }
    }
  }

  return msg.trim();
}

// ─── Stats builder ─────────────────────────────────────────────────

export function buildStatsMessage(tree: any[]): string {
  const deptCounts = new Map<string, number>();
  const semCounts = new Map<string, number>();
  const courseSet = new Set<string>();
  let totalFiles = 0;

  for (const item of tree) {
    if (item.type !== 'blob') continue;
    const p: string = item.path;
    if (!p.startsWith(config.uploadPath + '/')) continue;

    const rel = p.substring(config.uploadPath.length + 1);
    const parts = rel.split('/');
    if (parts.length < 4) continue;

    const dept = parts[0];
    const sem = parts[1];
    const courseFolder = parts[3];

    deptCounts.set(dept, (deptCounts.get(dept) || 0) + 1);
    semCounts.set(sem, (semCounts.get(sem) || 0) + 1);
    totalFiles++;

    const codeMatch = courseFolder.match(/^([A-Z]{2,5}-?\d{3,5})/i);
    if (codeMatch) courseSet.add(codeMatch[1].toUpperCase());
  }

  let msg = `<b>📊 IIUC-ARMS Statistics</b>\n\n`;
  msg += `📄 Total files: <b>${totalFiles}</b>\n`;
  msg += `📚 Total courses: <b>${courseSet.size}</b>\n`;
  msg += `🏢 Departments: <b>${deptCounts.size}</b>\n\n`;

  msg += `<b>By Department:</b>\n`;
  const sortedDepts = Array.from(deptCounts.entries()).sort((a, b) => b[1] - a[1]);
  for (const [dept, count] of sortedDepts.slice(0, 10)) {
    msg += `  ${getDeptName(dept)}: ${count} files\n`;
  }
  if (sortedDepts.length > 10) msg += `  <i>...and ${sortedDepts.length - 10} more</i>\n`;

  msg += `\n<b>By Semester:</b>\n`;
  const sortedSems = Array.from(semCounts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [sem, count] of sortedSems) {
    const semLabel = config.semesters.find(s => s.id === sem)?.label || sem;
    msg += `  ${semLabel}: ${count} files\n`;
  }

  return msg.trim();
}

// ─── Broadcast message builder ─────────────────────────────────────

export function buildBroadcastPreview(message: string, fromName: string): string {
  return (
    `📢 <b>Announcement</b>\n\n` +
    `${message}\n\n` +
    `— <i>${esc(fromName)}</i>\n` +
    `<i>IIUC-ARMS</i>`
  );
}

export function parseCallbackData(data: string): { type: string; args: string[] } | null {
  const parts = data.split(':');
  if (parts[0] === 'cat' && parts.length === 3) {
    return { type: 'cat', args: [parts[1], parts[2]] };
  }
  if (parts[0] === 'search' && parts.length >= 2) {
    return { type: 'search', args: [parts.slice(1).join(':')] };
  }
  if (parts[0] === 'del_confirm' && parts.length === 2) {
    return { type: 'del_confirm', args: [parts[1]] };
  }
  if (parts[0] === 'del_reject' && parts.length === 2) {
    return { type: 'del_reject', args: [parts[1]] };
  }
  if (parts[0] === 'broadcast' && parts.length >= 2) {
    return { type: 'broadcast', args: [parts[1]] };
  }
  return null;
}
