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
const CACHE_TTL = 2 * 60 * 1000;

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
    const p: string = item.path;
    if (!p.startsWith(config.uploadPath + '/')) continue;

    const fileName = p.split('/').pop() || '';
    if (fileName === '.gitkeep' || fileName.toLowerCase() === 'readme.md') continue;

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

    // Skip blobs that are .gitkeep or README.md (already filtered above)
    if (item.type !== 'blob') continue;

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

// Find course folders from tree even if they have no real files
export function findCourseLocations(tree: any[], courseCode: string): { dept: string; sem: string; title: string }[] {
  const code = courseCode.toUpperCase().trim();
  const codeNoHyphen = code.replace('-', '');
  const COURSE_RE = /^([A-Z]{2,5}-\d{3,5})\s*-\s*(.+)/i;
  const results: { dept: string; sem: string; title: string }[] = [];
  const seen = new Set<string>();

  for (const item of tree) {
    const p: string = item.path;
    if (!p.startsWith(config.uploadPath + '/')) continue;
    const rel = p.substring(config.uploadPath.length + 1);
    const parts = rel.split('/');
    if (parts.length < 3) continue;

    const courseFolder = parts[2] || '';
    const m = courseFolder.match(COURSE_RE);
    if (!m) continue;

    const folderCode = m[1].toUpperCase();
    const folderCodeNoHyphen = folderCode.replace('-', '');
    if (folderCode !== code && folderCodeNoHyphen !== codeNoHyphen) continue;

    const key = `${parts[0]}/${parts[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ dept: parts[0], sem: parts[1], title: m[2].trim() });
  }

  return results;
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
    `<b>Quick Start:</b>\n` +
    `• Type a course code → <code>QSM-3602</code>\n` +
    `• Type a course code → <code>/code QSM-3602</code>\n` +
    `• Browse all → <code>/departments</code>\n` +
    `• Search anything → <code>/search notes</code>\n\n` +
    `<i>📚 Powered by IIUC-ARMS</i>`
  );
}

export function buildHelpMessage(): string {
  return (
    `📖 <b>IIUC-ARMS Bot — Commands</b>\n\n` +
    `<b>📚 Course Lookup:</b>\n` +
    `<code>QSM-3602</code> — Type any course code\n` +
    `<code>/code QSM-3602</code> — Same as above\n` +
    `→ Shows file counts, category breakdown & Open button\n\n` +
    `<b>🔍 Search & Browse:</b>\n` +
    `<code>/search notes</code> — Search files & courses\n` +
    `<code>/departments</code> — List all departments\n` +
    `<code>/semester 3</code> — Browse semester 3\n` +
    `<code>/courses</code> — List all courses\n` +
    `<code>/courses qs</code> — Courses in QSIS dept\n` +
    `<code>/courses qs 3</code> — QSIS 3rd semester\n` +
    `<code>/stats</code> — Site statistics\n\n` +
    `<b>📢 Admin:</b>\n` +
    `<code>/broadcast &lt;msg&gt;</code> — Announce to all users\n\n` +
    `<i>Tap any Open button to view on IIUC-ARMS website.</i>`
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
  const COURSE_RE = /^([A-Z]{2,5}-\d{3,5})\s*-\s*(.+)/i;

  // 1) Search file names
  const fileMatches: { path: string; parts: string[] }[] = [];
  for (const item of tree) {
    if (item.type !== 'blob') continue;
    const p: string = item.path;
    if (!p.startsWith(config.uploadPath + '/')) continue;
    const fileName = p.split('/').pop() || '';
    if (fileName === '.gitkeep' || fileName.toLowerCase() === 'readme.md') continue;
    if (!fileName.toLowerCase().includes(q)) continue;
    const rel = p.substring(config.uploadPath.length + 1);
    fileMatches.push({ path: p, parts: rel.split('/') });
  }

  // 2) Search course folder names
  const courseMatches = new Map<string, { dept: string; sem: string; folder: string; code: string; title: string }>();
  for (const item of tree) {
    const p: string = item.path;
    if (!p.startsWith(config.uploadPath + '/')) continue;
    const rel = p.substring(config.uploadPath.length + 1);
    const parts = rel.split('/');
    if (parts.length < 3) continue;
    const courseFolder = parts[2] || '';
    if (!COURSE_RE.test(courseFolder)) continue;
    const m = courseFolder.match(COURSE_RE)!;
    const code = m[1].toUpperCase();
    const title = m[2].trim();
    const key = `${parts[0]}/${parts[1]}/${code}`;
    if (!courseMatches.has(key)) {
      courseMatches.set(key, { dept: parts[0], sem: parts[1], folder: courseFolder, code, title });
    }
  }

  // Filter course matches by query
  const matchedCourses = Array.from(courseMatches.values()).filter(c =>
    c.code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)
  );

  if (fileMatches.length === 0 && matchedCourses.length === 0) {
    return `🔍 No results for "<b>${esc(query)}</b>"\n\nTry a different search term.`;
  }

  let msg = `<b>🔍 Search: "${esc(query)}"</b>\n\n`;
  const buttons: any[][] = [];

  // Show matched courses
  for (const c of matchedCourses.slice(0, 5)) {
    const semLabel = config.semesters.find(s => s.id === c.sem)?.label || c.sem;
    const courseFiles = tree.filter(item => {
      const ip: string = item.path;
      if (item.type !== 'blob') return false;
      if (!ip.startsWith(config.uploadPath + '/')) return false;
      const fileName = ip.split('/').pop() || '';
      if (fileName === '.gitkeep' || fileName.toLowerCase() === 'readme.md') return false;
      return ip.includes(c.folder + '/');
    });

    const catCounts: Record<string, number> = {};
    for (const f of courseFiles) {
      const rel = f.path.substring(config.uploadPath.length + 1);
      const fParts = rel.split('/');
      let catName = 'other';
      for (let i = 3; i < fParts.length; i++) {
        const fn = fParts[i].toLowerCase();
        if (fn === 'mid' || fn === 'final') continue;
        catName = detectCategory(fParts[i]);
        break;
      }
      catCounts[catName] = (catCounts[catName] || 0) + 1;
    }

    const catParts = Object.entries(catCounts).map(([k, v]) => {
      const meta = CATEGORY_META[k];
      return `${meta?.icon || '📁'} ${meta?.label || k}: ${v}`;
    }).join(' · ');

    msg += `📚 <b>${esc(c.code)}</b> — ${esc(c.title)}\n`;
    msg += `  📍 ${esc(semLabel)} · ${esc(getDeptName(c.dept))}\n`;
    if (catParts) msg += `  ${catParts}\n`;
    const directUrl = `${SITE_URL}/?dept=${c.dept}&sem=${c.sem}&course=${c.code}`;
    buttons.push([{ text: `📂 Open ${c.code} — ${getDeptName(c.dept)} ${semLabel}`, url: directUrl }]);
    msg += '\n';
  }

  // Show matched files (limit 5)
  if (fileMatches.length > 0) {
    msg += `<b>📄 Files:</b>\n`;
    for (const m of fileMatches.slice(0, 5)) {
      const dept = m.parts[0];
      const sem = m.parts[1];
      let courseCode = '';
      for (let i = 2; i < m.parts.length; i++) {
        const cm = m.parts[i].match(COURSE_RE);
        if (cm) { courseCode = cm[1].toUpperCase(); break; }
      }
      const fileName = m.path.split('/').pop() || '';
      const directUrl = `${SITE_URL}/?dept=${dept}&sem=${sem}&course=${courseCode}`;
      msg += `  📄 <a href="${directUrl}">${esc(fileName)}</a> — ${esc(getDeptName(dept))}\n`;
    }
  }

  if (matchedCourses.length > 5 || fileMatches.length > 5) {
    msg += `\n<a href="${buildBrowseLink({ q: query })}">View all on IIUC-ARMS →</a>`;
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
  const courseDeptMap = new Map<string, string>();
  let totalFiles = 0;
  let totalLinks = 0;

  const validSems = new Set(config.semesters.map(s => s.id));

  for (const item of tree) {
    if (item.type !== 'blob') continue;
    const p: string = item.path;
    if (!p.startsWith(config.uploadPath + '/')) continue;

    const rel = p.substring(config.uploadPath.length + 1);
    const parts = rel.split('/');
    if (parts.length < 3) continue;

    const dept = parts[0];
    const sem = parts[1];

    if (!validSems.has(sem)) continue;
    if (parts[parts.length - 1] === '.gitkeep') continue;

    const fileName = parts[parts.length - 1].toLowerCase();
    const isReadme = fileName === 'readme.md';

    if (isReadme) {
      totalLinks++;
      continue;
    }

    deptCounts.set(dept, (deptCounts.get(dept) || 0) + 1);
    semCounts.set(sem, (semCounts.get(sem) || 0) + 1);
    totalFiles++;

    const courseFolder = parts[2];
    const codeMatch = courseFolder.match(/^([A-Z]{2,5}-?\d{3,5})/i);
    if (codeMatch) {
      const code = codeMatch[1].toUpperCase();
      courseSet.add(code);
      if (!courseDeptMap.has(code)) courseDeptMap.set(code, dept);
    }
  }

  let msg = `<b>📊 IIUC-ARMS Statistics</b>\n\n`;
  msg += `📄 Total files: <b>${totalFiles}</b>\n`;
  msg += `🔗 Shared links: <b>${totalLinks}</b>\n`;
  msg += `📚 Total courses: <b>${courseSet.size}</b>\n`;
  msg += `🏢 Departments: <b>${deptCounts.size}</b>\n\n`;

  msg += `<b>By Department:</b>\n`;
  const sortedDepts = Array.from(deptCounts.entries()).sort((a, b) => b[1] - a[1]);
  for (const [dept, count] of sortedDepts.slice(0, 10)) {
    msg += `  ${getDeptName(dept)}: ${count} files\n`;
  }
  if (sortedDepts.length > 10) msg += `  <i>...and ${sortedDepts.length - 10} more</i>\n`;

  msg += `\n<b>By Semester:</b>\n`;
  const sortedSems = Array.from(semCounts.entries()).sort((a, b) => {
    const ai = config.semesters.findIndex(s => s.id === a[0]);
    const bi = config.semesters.findIndex(s => s.id === b[0]);
    return ai - bi;
  });
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
  // Start menu callbacks
  if (data === 'start_faculties') return { type: 'start_faculties', args: [] };
  if (data === 'start_contributors') return { type: 'start_contributors', args: [] };
  if (data === 'start_devby') return { type: 'start_devby', args: [] };
  if (data === 'start_help') return { type: 'start_help', args: [] };
  return null;
}

// ─── Department-wise Notification Helpers ─────────────────────────

export interface NotificationLogEntry {
  department: string;
  type: string;
  title: string;
  message: string;
  sentBy?: string;
  recipientCount: number;
}

export async function sendDepartmentNotifications(
  departments: string[],
  message: string,
  options?: { type?: string; title?: string; sentBy?: string; delayMs?: number; semester?: string }
): Promise<{ sent: number; failed: number; skipped: number }> {
  const { prisma } = await import('@/lib/prisma');
  const type = options?.type || 'routine_update';
  const title = options?.title || 'Notification';
  const delayMs = options?.delayMs ?? 100;

  const where: any = { telegramChatId: { not: null } };

  if (!departments.includes('ALL')) {
    where.department = { in: departments };
  }

  if (options?.semester) {
    where.semester = options.semester;
  }

  const profiles = await prisma.profile.findMany({
    where,
    select: { telegramChatId: true, name: true, department: true, userId: true },
  });

  if (profiles.length === 0) return { sent: 0, failed: 0, skipped: 0 };

  let sent = 0;
  let failed = 0;

  for (const p of profiles) {
    if (!p.telegramChatId) continue;
    try {
      const chatId = Number(p.telegramChatId);
      if (isNaN(chatId)) continue;
      await sendMessage(chatId, message, { disable_web_page_preview: true });
      sent++;
    } catch {
      failed++;
    }
    // Rate limit: 100ms between sends to avoid Telegram API limits
    if (delayMs > 0) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  // Log to database
  try {
    await prisma.telegramNotification.create({
      data: {
        department: departments.join(','),
        type,
        title,
        message: message.substring(0, 2000),
        sentBy: options?.sentBy || null,
        recipientCount: sent,
      },
    });
  } catch (err: any) {
    console.error('[TG] Failed to log notification:', err?.message);
  }

  return { sent, failed, skipped: profiles.length - sent - failed };
}

export async function getNotificationHistory(options?: { department?: string; type?: string; limit?: number }) {
  const { prisma } = await import('@/lib/prisma');
  const where: any = {};
  if (options?.department) where.department = options.department;
  if (options?.type) where.type = options.type;

  return prisma.telegramNotification.findMany({
    where,
    orderBy: { sentAt: 'desc' },
    take: options?.limit || 50,
  });
}

export async function getConnectedUsersCount(): Promise<number> {
  const { prisma } = await import('@/lib/prisma');
  return prisma.profile.count({
    where: { telegramChatId: { not: null } },
  });
}

export async function getDepartmentConnectedUsersCount(departments: string[]): Promise<Record<string, number>> {
  const { prisma } = await import('@/lib/prisma');
  const profiles = await prisma.profile.findMany({
    where: {
      department: { in: departments },
      telegramChatId: { not: null },
    },
    select: { department: true },
  });

  const counts: Record<string, number> = {};
  for (const dept of departments) counts[dept] = 0;
  for (const p of profiles) {
    if (p.department && counts[p.department] !== undefined) {
      counts[p.department]++;
    }
  }
  return counts;
}
