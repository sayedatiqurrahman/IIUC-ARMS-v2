import { config } from '@/lib/config';
import { FACULTIES } from '@/lib/departments';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const API = `https://api.telegram.org/bot${TOKEN}`;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://qsis-arms.eu.cc';

// ─── Telegram API helpers ─────────────────────────────────────────

export async function sendMessage(chatId: number, text: string, extra?: any) {
  return fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra }),
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

  const token = process.env.GITHUB_TOKEN || '';
  const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' };
  if (token) headers['Authorization'] = `token ${token}`;

  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/git/trees/${config.branch}?recursive=1`;
  const res = await fetch(url, { headers, next: { revalidate: 300 } });
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
    const catFolder = parts[2];
    const courseFolder = parts[3];

    const courseParts = courseFolder.split('-');
    const coursePrefix = courseParts[0]?.toUpperCase() || '';
    if (coursePrefix !== code) continue;

    const category = detectCategory(catFolder);

    results.push({
      path: p,
      fileName: parts.slice(4).join('/') || courseFolder,
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

export function buildBrowseLink(params: Record<string, string>): string {
  const qs = new URLSearchParams(params);
  return `${SITE_URL}/?${qs.toString()}`;
}

export function buildCourseLink(courseCode: string, dept?: string, sem?: string, cat?: string): string {
  const params: Record<string, string> = { q: courseCode };
  if (dept) params.dept = dept;
  if (sem) params.sem = sem;
  if (cat) params.cat = cat;
  return buildBrowseLink(params);
}

// ─── Message builders ─────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildWelcomeMessage(): string {
  return (
    `🎓 <b>IIUC-ARMS Bot</b>\n\n` +
    `Find academic resources for IIUC courses.\n\n` +
    `<b>How to use:</b>\n` +
    `• Send a course code → <code>QUR101</code>\n` +
    `• Search files → <code>/search notes</code>\n` +
    `• List departments → <code>/departments</code>\n\n` +
    `All results link directly to the website — no files shared here.\n\n` +
    `<i>📚 Powered by IIUC-ARMS</i>`
  );
}

export function buildHelpMessage(): string {
  return (
    `📖 <b>Commands</b>\n\n` +
    `<code>QUR101</code> — Search a course by code\n` +
    `<code>/search &lt;query&gt;</code> — Search files, courses, semesters\n` +
    `<code>/departments</code> — List all departments\n` +
    `<code>/semester &lt;1-8&gt;</code> — Browse a semester\n` +
    `<code>/help</code> — Show this help\n\n` +
    `<b>Examples:</b>\n` +
    `• <code>QUR101</code>\n` +
    `• <code>/search notes</code>\n` +
    `• <code>/semester 3</code>\n` +
    `• <code>/departments</code>\n\n` +
    `<i>All results link to the website for download.</i>`
  );
}

export function buildCourseResult(courseCode: string, info: CourseInfo): string {
  const deptNames = info.departments.map(d => getDeptName(d)).join(', ');
  const semLabels = info.semesters.map(s => config.semesters.find(ss => ss.id === s)?.label || s).join(', ');

  let msg = `<b>📚 ${esc(courseCode)}</b>\n`;
  msg += `📂 Found in: <b>${esc(deptNames)}</b>\n`;
  msg += `📅 Semesters: <b>${esc(semLabels)}</b>\n`;
  msg += `📄 Files: ${info.totalFiles}\n\n`;
  msg += `Select a category to open on website:`;

  return msg;
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

export function parseCallbackData(data: string): { type: string; args: string[] } | null {
  const parts = data.split(':');
  if (parts[0] === 'cat' && parts.length === 3) {
    return { type: 'cat', args: [parts[1], parts[2]] };
  }
  if (parts[0] === 'search' && parts.length >= 2) {
    return { type: 'search', args: [parts.slice(1).join(':')] };
  }
  return null;
}
