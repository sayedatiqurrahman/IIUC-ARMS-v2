import { config } from '@/lib/config';
import { FACULTIES } from '@/lib/departments';
import { CATEGORY_META, getDeptFullName, getDeptName, hasSharedLinks, detectCategory } from './categories';
import { FoundFile, CourseInfo } from './courses';
import { buildCourseLink, buildBrowseLink } from './links';
import { SITE_URL } from './api';

// ─── Message builders ─────────────────────────────────────────────

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildConnectMessage(): string {
  return (
    `🔗 <b>Connect Your Telegram to IIUC-ARMS</b>\n\n` +
    `<b>Why connect?</b>\n` +
    `• 📅 Get instant class routine updates\n` +
    `• 📝 Receive exam schedule notifications\n` +
    `• 📚 Know when new files are uploaded\n` +
    `• 🎓 Batch announcements & updates\n\n` +
    `<b>How to connect:</b>\n` +
    `Send: <code>/connect yourmail@ugrad.iiuc.ac.bd</code>\n\n` +
    `Then open the web app → Dashboard → Connections → Telegram → Send OTP.\n\n` +
    `<i>You can connect up to 3 Telegram accounts from\n` +
    `Dashboard → Connections in the web app.</i>`
  );
}

export function buildWelcomeMessage(): string {
  return (
    `🎓 <b>IIUC-ARMS Bot</b>\n\n` +
    `Find academic resources for IIUC courses.\n\n` +
    `<b>Quick Start:</b>\n` +
    `• Type a course code → <code>QSM-3602</code>\n` +
    `• Browse all → <code>/departments</code>\n` +
    `• Search anything → <code>/search notes</code>\n\n` +
    `<b>Account:</b>\n` +
    `• <code>/connect</code> — Link your Telegram for notifications\n` +
    `• <code>/status</code> — Check connection status\n` +
    `• <code>/help</code> — All commands\n\n` +
    `<i>📚 Powered by IIUC-ARMS</i>`
  );
}

export function buildHelpMessage(): string {
  return (
    `📖 <b>IIUC-ARMS Bot — Commands</b>\n\n` +
    `<b>🔗 Account:</b>\n` +
    `<code>/connect yourmail@ugrad.iiuc.ac.bd</code> — Link your account\n` +
    `<code>/status</code> — Check connection status\n` +
    `<code>/disconnect</code> — Unlink your account\n\n` +
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