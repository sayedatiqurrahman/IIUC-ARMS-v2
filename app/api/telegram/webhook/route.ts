import { NextRequest, NextResponse } from 'next/server';
import {
  sendMessage,
  sendChatAction,
  answerCallbackQuery,
  editMessageText,
  deleteMessage,
  getGithubTree,
  findCourseFiles,
  findCourseLocations,
  getCourseInfo,
  buildWelcomeMessage,
  buildHelpMessage,
  buildConnectMessage,
  buildCourseResult,
  buildCategoryResult,
  buildDeptList,
  buildSemesterList,
  buildSearchResults,
  buildCourseLink,
  buildBrowseLink,
  buildCoursesList,
  buildStatsMessage,
  broadcastCallbackData,
  catCallbackData,
  parseCallbackData,
  CATEGORY_META,
  esc,
  getDeptName,
  getDeptFullName,
  resolveGithubToken,
} from '@/lib/telegram';
import { config } from '@/lib/config';
import { getDepartmentFolder, findDepartment, FACULTIES } from '@/lib/departments';
import { getAppInstallations, getInstallationAccessToken } from '@/lib/github-app';
import { deleteCourseFolder, findCourseFolderPathInRepo } from '@/lib/course-delete';
import { isBlockedChat, updateBlocklist } from '@/lib/telegram/block';
import { commitFilesToBranch } from '@/lib/github-commit';
import { matchCourseFolder, normalizeCourseCode } from '@/lib/store/helpers';
import { validateRepoPath } from '@/lib/repo-path';
import { registerBotCommands } from '@/lib/telegram/commands';
import { configuredSecret } from '@/lib/telegram/secret';

const COURSE_REGEX = /^[A-Z]{2,5}-?\d{3,5}[A-Z]?$/i;
const GITHUB_API = 'https://api.github.com';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://iiuc-arms.eu.cc';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── Chat ID logging: every message the bot receives gets logged ───
// This lets the admin panel discover all chats without dropping the webhook.
const chatLogCache = new Map<number, { title: string; type: string; username?: string; lastSeen: number }>();
let chatLogFlushTimer: NodeJS.Timeout | null = null;

function logChatFromMessage(msg: any) {
  const chat = msg.chat;
  if (!chat?.id) return;
  chatLogCache.set(chat.id, {
    title: chat.title || chat.first_name || 'Unknown',
    type: chat.type,
    username: chat.username,
    lastSeen: Date.now(),
  });
  // Flush to DB at most every 30 seconds
  if (!chatLogFlushTimer) {
    chatLogFlushTimer = setTimeout(() => { chatLogFlushTimer = null; flushChatLog(); }, 30_000);
  }
}

async function flushChatLog() {
  if (chatLogCache.size === 0) return;
  try {
    const { prisma } = await import('@/lib/prisma');
    const p = prisma as any;
    // Ensure column exists
    try {
      const tableInfo = await p.$queryRawUnsafe(`PRAGMA table_info(SiteSettings)`);
      const cols = new Set((tableInfo as any[]).map((c: any) => c.name));
      if (!cols.has('telegramChats')) {
        await p.$executeRawUnsafe(`ALTER TABLE SiteSettings ADD COLUMN telegramChats TEXT`);
      }
    } catch {}

    const rows = await p.$queryRawUnsafe(`SELECT telegramChats FROM SiteSettings WHERE id = 'site-settings'`);
    const raw = (rows as any[])[0]?.telegramChats;
    const existing: any[] = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];

    // Merge: update existing entries, add new ones
    const merged = new Map<string, any>();
    for (const c of existing) merged.set(String(c.id), c);
    Array.from(chatLogCache.entries()).forEach(([id, info]) => {
      merged.set(String(id), { id: String(id), ...info });
    });

    const updated = Array.from(merged.values());
    const json = JSON.stringify(updated);

    if ((rows as any[]).length > 0) {
      await p.$executeRawUnsafe(`UPDATE SiteSettings SET telegramChats = ? WHERE id = 'site-settings'`, json);
    } else {
      await p.$executeRawUnsafe(`INSERT INTO SiteSettings (id, permissions, telegramChats) VALUES ('site-settings', '{}', ?)`, json);
    }
    chatLogCache.clear();
  } catch (err: any) {
    console.error('[TG] Failed to flush chat log:', err?.message);
  }
}

function openLink(target: string): string {
  return SITE_URL + '/open?url=' + encodeURIComponent(target);
}

// Resolve a connected admin/requester chat id from a user id (email).
async function resolveRequesterChat(userId: string): Promise<number | null> {
  try {
    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({ where: { userId } });
    const chatId = (profile as any)?.telegramChatId;
    return chatId ? Number(chatId) : null;
  } catch { return null; }
}

// ═══ Telegram file-upload wizard ═══════════════════════════════════
// BotFather-style step flow: department → semester → course (or create new)
// → category → (Mid/Final → Spring/Autumn + year) → send file → GitHub.
// Upload state is persisted per-chat in SiteSettings.telegramUploadStates so a
// server cold start never drops a user mid-flow.

interface UploadFlowState {
  dept?: string; // canonical department id
  sem?: string; // semester id, e.g. '3rd-semister'
  courses?: { code: string; title: string; folder: string }[];
  courseFolder?: string;
  courseCode?: string;
  category?: string; // sheet|notes|questions|syllabus|other
  term?: 'Mid' | 'Final';
  season?: 'Spring' | 'Autumn';
  session?: string; // e.g. 'Spring 2024'
  stage: string; // dept|sem|course|newcourse|category|term|season|year|file|askid
  connectedEmail?: string;
  universityId?: string;
  ts: number;
}

const UPLOAD_STATE_TTL = 12 * 60 * 60 * 1000;
const MAX_BOT_UPLOAD_BYTES = 20 * 1024 * 1024;
const SAFE_FILE_EXTS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'webp', 'csv', 'txt', 'rtf', 'odt', 'ods']);
const SESSION_YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
const TERM_CATEGORIES = new Set(['notes', 'sheet', 'questions']);
const UPLOAD_CATEGORIES: { key: string; label: string }[] = [
  { key: 'sheet', label: '📊 Sheets' },
  { key: 'notes', label: '📝 Notes' },
  { key: 'questions', label: '📋 Previous Questions' },
  { key: 'syllabus', label: '📘 Syllabus' },
  { key: 'other', label: '📁 Other' },
];

let uploadColumnChecked = false;
async function ensureUploadColumn() {
  if (uploadColumnChecked) return;
  uploadColumnChecked = true;
  try {
    const { prisma } = await import('@/lib/prisma');
    const p = prisma as any;
    const tableInfo = await p.$queryRawUnsafe(`PRAGMA table_info(SiteSettings)`);
    const cols = new Set((tableInfo as any[]).map((c: any) => c.name));
    if (!cols.has('telegramUploadStates')) {
      await p.$executeRawUnsafe(`ALTER TABLE SiteSettings ADD COLUMN telegramUploadStates TEXT`);
    }
  } catch {}
}

async function readUploadStates(): Promise<Record<string, any>> {
  const map: Record<string, any> = {};
  try {
    const { prisma } = await import('@/lib/prisma');
    const p = prisma as any;
    await ensureUploadColumn();
    const rows = await p.$queryRawUnsafe(`SELECT telegramUploadStates FROM SiteSettings WHERE id = 'site-settings'`);
    const raw = (rows as any[])[0]?.telegramUploadStates;
    if (raw) {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {}
  return map;
}

async function writeUploadStates(map: Record<string, any>) {
  try {
    const { prisma } = await import('@/lib/prisma');
    const p = prisma as any;
    await ensureUploadColumn();
    await p.$executeRawUnsafe(`UPDATE SiteSettings SET telegramUploadStates = ? WHERE id = 'site-settings'`, JSON.stringify(map));
  } catch {}
}

async function getUploadState(chatId: number): Promise<UploadFlowState | null> {
  try {
    const map = await readUploadStates();
    const st = map[String(chatId)];
    if (!st) return null;
    if (Date.now() - (st.ts || 0) > UPLOAD_STATE_TTL) {
      delete map[String(chatId)];
      await writeUploadStates(map);
      return null;
    }
    return st as UploadFlowState;
  } catch { return null; }
}

async function setUploadState(chatId: number, state: UploadFlowState | null) {
  try {
    const map = await readUploadStates();
    if (state) {
      state.ts = Date.now();
      map[String(chatId)] = state;
    } else {
      delete map[String(chatId)];
    }
    await writeUploadStates(map);
  } catch {}
}

function semLabel(semId: string): string {
  return config.semesters.find(s => s.id === semId)?.label || semId;
}

function chunkBy<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function uploadDeptButtons(): any[][] {
  const rows: any[][] = [];
  for (const fac of FACULTIES) {
    rows.push(...chunkBy(fac.departments.map(d => ({ text: d.shortName, callback_data: `up:dept:${d.id}` })), 4));
  }
  rows.push([{ text: '❌ Cancel', callback_data: 'up:cancel' }]);
  return rows;
}

function uploadSemButtons(): any[][] {
  const rows = chunkBy(config.semesters.map(s => ({ text: s.id.replace('-semister', ''), callback_data: `up:sem:${s.id}` })), 4);
  rows.push([{ text: '❌ Cancel', callback_data: 'up:cancel' }]);
  return rows;
}

function uploadCourseButtons(state: UploadFlowState): any[][] {
  const rows = chunkBy((state.courses || []).map(c => ({ text: c.code, callback_data: `up:pick:${c.code}` })), 2);
  rows.push([{ text: '➕ Create New Course', callback_data: 'up:newcourse' }]);
  rows.push([{ text: '❌ Cancel', callback_data: 'up:cancel' }]);
  return rows;
}

function uploadCategoryButtons(): any[][] {
  const rows = chunkBy(UPLOAD_CATEGORIES.map(c => ({ text: c.label, callback_data: `up:cat:${c.key}` })), 2);
  rows.push([{ text: '❌ Cancel', callback_data: 'up:cancel' }]);
  return rows;
}

function uploadTermButtons(): any[][] {
  return [
    [{ text: 'Mid', callback_data: 'up:term:Mid' }, { text: 'Final', callback_data: 'up:term:Final' }],
    [{ text: '❌ Cancel', callback_data: 'up:cancel' }],
  ];
}

function uploadSeasonButtons(): any[][] {
  return [
    [{ text: '🌱 Spring', callback_data: 'up:season:Spring' }, { text: '🍂 Autumn', callback_data: 'up:season:Autumn' }],
    [{ text: '❌ Cancel', callback_data: 'up:cancel' }],
  ];
}

function uploadYearButtons(season: string): any[][] {
  const rows = chunkBy(SESSION_YEARS.map(y => ({ text: `${season} ${y}`, callback_data: `up:session:${season}:${y}` })), 4);
  rows.push([{ text: '❌ Cancel', callback_data: 'up:cancel' }]);
  return rows;
}

// Courses already present under uploadPath/{deptFolder}/{semId}/ in the repo.
// Handles both the new structure (…/COURSE/Mid|Final/cat/file) and the old
// one (…/cat/COURSE/file).
function listCoursesForDeptSem(tree: any[], deptFolder: string, semId: string): { code: string; title: string; folder: string }[] {
  const prefix = `${config.uploadPath}/${deptFolder}/${semId}/`;
  const map = new Map<string, { code: string; title: string; folder: string }>();
  for (const item of tree) {
    const p: string = item.path;
    if (!p.startsWith(prefix)) continue;
    const segs = p.slice(prefix.length).split('/');
    if (!segs[0]) continue;
    let folderSeg = segs[0];
    let m = matchCourseFolder(folderSeg);
    if (!m && segs.length >= 2) {
      m = matchCourseFolder(segs[1]);
      if (m) folderSeg = segs[1];
    }
    if (!m) continue;
    map.set(m.code, { code: m.code, title: m.title, folder: folderSeg });
  }
  return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
}

// Parse "QSM-3602 - Islamic Studies" (code + optional title)
function parseNewCourseInput(text: string): { code: string; title: string; folder: string } | null {
  const t = text.trim();
  const m = t.match(/^([A-Z]{2,5}\s*[-–—]?\s*\d{3,5}[A-Z]?)\s*[-–—]?\s*(.*)$/i);
  if (!m) return null;
  const code = normalizeCourseCode(m[1]);
  const title = (m[2] || '').trim().replace(/\s+/g, ' ') || code;
  if (title.length > 60) return null;
  return { code, title, folder: `${code} - ${title}` };
}

function sanitizeFileName(name: string): string {
  const base = name.replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (base.slice(0, 80) || 'file');
}

function buildUploadFolderPath(state: UploadFlowState): string {
  const deptFolder = getDepartmentFolder(state.dept || '');
  const segs = [config.uploadPath, deptFolder, state.sem || '', state.courseFolder || ''];
  if (state.term) segs.push(state.term);
  segs.push(state.category ? CATEGORY_META[state.category]?.folder || 'Other' : '');
  return segs.filter(Boolean).join('/');
}

// The GitHub folder path the site will show for this course, trimmed to
// upload_academic_files (used only for display).
function buildUploadFolderPreview(state: UploadFlowState): string {
  return buildUploadFolderPath(state).replace(/^upload_academic_files\//, '') + ' / <your-file>';
}

async function resolveConnectedEmail(chatId: number): Promise<string | null> {
  try {
    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findFirst({
      where: { telegramChatId: String(chatId), telegramVerified: true },
      select: { userId: true },
    });
    return profile?.userId || null;
  } catch { return null; }
}

async function profileUniversityId(email: string): Promise<string | null> {
  try {
    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({ where: { userId: email }, select: { universityId: true } });
    return (profile as any)?.universityId || null;
  } catch { return null; }
}

// Called once the path is fully known: resolves identity then asks for the file.
async function askUploadMessage(chatId: number, messageId: number, state: UploadFlowState) {
  const email = await resolveConnectedEmail(chatId);
  if (email) {
    state.connectedEmail = email;
    state.universityId = state.universityId || (await profileUniversityId(email)) || undefined;
  }

  if (!state.connectedEmail && !state.universityId) {
    state.stage = 'askid';
    await setUploadState(chatId, state);
    await editMessageText(chatId, messageId,
      `🪪 <b>Your University ID</b>\n\n` +
      `To track who uploaded this file, please send your <b>University / Student ID</b>.\n\n` +
      `Example: <code>22-43211-3</code> or <code>C232101</code>\n\n` +
      `<i>Tip: <code>/connect</code> your account to skip this next time.</i>`,
      { reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'up:cancel' }]] } }
    );
    return;
  }

  state.stage = 'file';
  await setUploadState(chatId, state);
  await editMessageText(chatId, messageId,
    `📤 <b>Send the file</b>\n\n` +
    `It will be saved at:\n<code>${buildUploadFolderPreview(state)}</code>\n\n` +
    `Now send me the <b>file</b> (PDF, Word, Excel, PowerPoint, image, CSV).`,
    { reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'up:cancel' }]] } }
  );
}

async function downloadTelegramFile(fileId: string): Promise<{ buffer: Buffer; ext: string } | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  try {
    const g = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
    if (!g.ok) return null;
    const d = await g.json();
    const filePath: string = d?.result?.file_path;
    if (!filePath) return null;
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const ext = (filePath.split('.').pop() || '').toLowerCase();
    return { buffer, ext };
  } catch { return null; }
}

// Direct-to-main commit via the GitHub App bot token (falls back to env GITHUB_TOKEN).
async function commitBotUpload(fullPath: string, contentBase64: string, message: string, authorName: string): Promise<string> {
  const token = await resolveGithubToken();
  if (!token) throw new Error('GitHub upload service is unavailable right now.');
  const refRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`, { headers: ghHeaders(token) });
  if (!refRes.ok) throw new Error(`Cannot read repository (${refRes.status}).`);
  const baseSha = (await refRes.json()).object.sha;
  const clean = authorName.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim() || 'Telegram Bot';
  return commitFilesToBranch({
    token,
    owner: config.owner,
    repo: config.repo,
    branch: config.branch,
    baseSha,
    files: [{ path: fullPath, content: contentBase64 }],
    message,
    author: { name: clean, email: `${clean.toLowerCase().replace(/[^a-z0-9]/g, '')}@users.noreply.github.com` },
  });
}

// Commit with the uploader's OWN GitHub token so the contribution shows on their
// GitHub account (green contribution graph + their name on the commit). Author
// identity is resolved from their profile so GitHub links the commit to them.
async function commitUserUpload(
  profile: { githubToken: string; githubLogin?: string | null; name?: string | null },
  fullPath: string,
  contentBase64: string,
  message: string
): Promise<string> {
  const token = profile.githubToken;

  // Resolve the author's real GitHub identity (id, name, verified email) using
  // their token. GitHub links commits to the account whose email matches — the
  // {id}+{login}@users.noreply.github.com format is the official way to make a
  // commit "count" on the user's contributions graph.
  let authorEmail = '';
  let authorName = profile.githubLogin || profile.name || 'GitHub User';
  try {
    const meRes = await fetch(`${GITHUB_API}/user`, { headers: ghHeaders(token) });
    if (meRes.ok) {
      const me = await meRes.json();
      authorName = me?.name || me?.login || authorName;
      if (me?.email) authorEmail = me.email;
      else if (typeof me?.id === 'number' && me?.login) authorEmail = `${me.id}+${me.login}@users.noreply.github.com`;
    }
  } catch {}

  // Prefer the user's primary verified email (requires user:email scope) — but
  // only when the /user call didn't already give us a real address.
  if (!authorEmail) {
    try {
      const emRes = await fetch(`${GITHUB_API}/user/emails`, { headers: ghHeaders(token) });
      if (emRes.ok) {
        const emails: any[] = await emRes.json();
        const primary = emails.find((e: any) => e?.verified && e?.primary) || emails.find((e: any) => e?.verified);
        if (primary?.email) authorEmail = primary.email;
      }
    } catch {}
  }
  if (!authorEmail) authorEmail = `${profile.githubLogin || 'github'}_contributor@users.noreply.github.com`;

  const refRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`, { headers: ghHeaders(token) });
  if (!refRes.ok) throw new Error(`GitHub rejected your connected token (${refRes.status}) — check it in Dashboard → Connections → GitHub.`);
  const baseSha = (await refRes.json()).object.sha;
  const cleanName = authorName.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim() || 'GitHub User';

  return commitFilesToBranch({
    token,
    owner: config.owner,
    repo: config.repo,
    branch: config.branch,
    baseSha,
    files: [{ path: fullPath, content: contentBase64 }],
    message,
    author: { name: cleanName, email: authorEmail },
  });
}

// Try the uploader's personal GitHub token first so their contribution is
// credited; automatically fall back to the bot token if that fails.
async function commitUpload(
  email: string | null,
  fullPath: string,
  contentBase64: string,
  message: string,
  senderName: string
): Promise<{ commitSha: string; via: 'user' | 'bot'; githubUser?: string | null }> {
  if (email) {
    try {
      const { prisma } = await import('@/lib/prisma');
      const prof = await prisma.profile.findUnique({
        where: { userId: email },
        select: { githubToken: true, githubLogin: true, name: true },
      });
      if (prof?.githubToken) {
        const commitSha = await commitUserUpload(prof as any, fullPath, contentBase64, message);
        return { commitSha, via: 'user', githubUser: prof.githubLogin || null };
      }
    } catch (e: any) {
      console.warn('[TG] User-token commit failed — falling back to bot token:', e?.message);
    }
  }

  const commitSha = await commitBotUpload(fullPath, contentBase64, message, senderName);
  return { commitSha, via: 'bot' };
}

async function handleUploadDocument(chatId: number, msg: any, state: UploadFlowState) {
  const doc = msg.document;
  const origName = doc?.file_name || `telegram_${doc?.file_id || Date.now()}`;
  const size = doc?.file_size || 0;

  if (size > MAX_BOT_UPLOAD_BYTES) {
    await sendMessage(chatId, `❌ File is too large (${(size / 1048576).toFixed(1)} MB).\n\nMax is <b>20 MB</b> — split the file or use smaller files. Your upload is still waiting — send the file again.`);
    return;
  }

  const dl = await downloadTelegramFile(doc.file_id);
  if (!dl) {
    await sendMessage(chatId, `❌ Could not download the file from Telegram. Please try again.`);
    return;
  }

  const ext = (origName.split('.').pop() || dl.ext || 'bin').toLowerCase();
  if (!SAFE_FILE_EXTS.has(ext)) {
    await sendMessage(chatId, `❌ File type ".${esc(ext)}" is not allowed.\n\nAllowed: PDF, Word, Excel, PowerPoint, images, CSV, text.`);
    return;
  }

  // PDF integrity gate (mirrors the web upload guard) — never let a truncated
  // PDF reach GitHub.
  if (ext === 'pdf') {
    if (dl.buffer.length < 16) {
      await sendMessage(chatId, `❌ The PDF is empty or invalid — upload the original file again.`);
      return;
    }
    const head = dl.buffer.subarray(0, 1024).toString('latin1');
    const tail = dl.buffer.subarray(Math.max(0, dl.buffer.length - 2048)).toString('latin1');
    if (!head.includes('%PDF-') || !tail.includes('%%EOF')) {
      await sendMessage(chatId, `❌ The PDF looks corrupted (truncated during transfer). Please re-send the original file.`);
      return;
    }
  }

  let universityId = state.connectedEmail ? (state.universityId || (await profileUniversityId(state.connectedEmail)) || '') : (state.universityId || '');
  if (!universityId) {
    state.stage = 'askid';
    await setUploadState(chatId, state);
    await sendMessage(chatId, `🪪 Please send your <b>University ID</b> so we can track who uploaded this file.`);
    return;
  }
  universityId = String(universityId).replace(/\s+/g, '').slice(0, 30);

  const base = sanitizeFileName(origName.replace(/\.[^.]+$/, ''));
  const nameParts = [base];
  if (state.session) nameParts.push(state.session);
  nameParts.push(`ID-${universityId}`);
  const fileName = `${nameParts.join(' - ')}.${ext}`;

  const fullPath = `${buildUploadFolderPath(state)}/${fileName}`;
  const relPath = fullPath.slice(config.uploadPath.length + 1);
  try { validateRepoPath(relPath, false); } catch {
    await sendMessage(chatId, `❌ The file name contains unsupported characters. Please rename it and send again.`);
    return;
  }

  await sendChatAction(chatId, 'upload_document');

  const senderName = msg.from?.first_name
    ? `${msg.from.first_name}${msg.from.last_name ? ' ' + msg.from.last_name : ''}`
    : msg.from?.username ? `@${msg.from.username}` : `Chat ${chatId}`;

  let commitSha: string;
  let commitVia: 'user' | 'bot' = 'bot';
  let commitGithubUser: string | null = null;
  try {
    const res = await commitUpload(
      state.connectedEmail || null,
      fullPath,
      dl.buffer.toString('base64'),
      `Add ${relPath} (via Telegram, ID-${universityId})`,
      senderName
    );
    commitSha = res.commitSha;
    commitVia = res.via;
    commitGithubUser = res.githubUser || null;
  } catch (e: any) {
    console.error('[TG] Upload commit failed:', e?.message);
    await sendMessage(chatId, `❌ <b>Upload failed</b>\n\n${esc(e?.message || 'Unknown error')}\n\nPlease try again later.`);
    return;
  }

  await setUploadState(chatId, null);

  const courseLink = state.courseCode
    ? buildCourseLink(state.courseCode, state.dept, state.sem)
    : buildBrowseLink({ dept: state.dept, sem: state.sem });

  const viaLine = commitVia === 'user'
    ? `⭐ Committed with <b>your GitHub account</b>${commitGithubUser ? ` (<code>@${esc(commitGithubUser)}</code>)` : ''} — appears on your contribution graph!`
    : `🤖 Committed via the IIUC-ARMS bot account.`;

  await sendMessage(chatId,
    `✅ <b>File uploaded to GitHub!</b>\n\n` +
    `📄 <code>${esc(relPath)}</code>\n` +
    `🏷️ Uploaded by: <code>ID-${esc(universityId)}</code>\n` +
    `${viaLine}\n\n` +
    `📚 <a href="${courseLink}">Open course on IIUC-ARMS →</a>\n\n` +
    `Thank you for contributing! 🎉`
  );

  // Best-effort activity log so every bot upload is trackable.
  try {
    const { prisma } = await import('@/lib/prisma');
    await prisma.activityLog.create({
      data: {
        action: 'file_upload',
        userId: state.connectedEmail || `telegram-${chatId}`,
        userName: senderName,
        details: JSON.stringify({ files: [relPath], count: 1, source: 'telegram', universityId, commitSha, via: commitVia, githubUser: commitGithubUser, session: state.session, term: state.term }),
      },
    });
  } catch {}

  // The GitHub tree cache refreshes itself after ~2 minutes, so the new file
  // appears on the site automatically shortly after the upload.
}

async function handleNewCourseText(chatId: number, state: UploadFlowState, text: string) {
  const parsed = parseNewCourseInput(text);
  if (!parsed) {
    await sendMessage(chatId,
      `⚠️ Hmm, that didn't parse as a course.\n\nSend it as:\n<code>QSM-3602 - Islamic Studies</code>\n\nor just a code:\n<code>QUR101</code>\n\nKeep the title under 60 characters.`,
      { parse_mode: 'HTML' }
    );
    return;
  }
  const courses = state.courses || [];
  if (!courses.some(c => c.code === parsed.code)) {
    courses.push(parsed);
    courses.sort((a, b) => a.code.localeCompare(b.code));
  }
  state.courses = courses;
  state.stage = 'course';
  await setUploadState(chatId, state);
  await sendMessage(chatId,
    `✅ Course added: <code>${esc(parsed.code)}</code> — ${esc(parsed.title)}\n\nNow pick it below:`,
    { reply_markup: { inline_keyboard: uploadCourseButtons(state) } }
  );
}

async function handleUniversityIdText(chatId: number, state: UploadFlowState, text: string) {
  const id = text.replace(/\s+/g, ' ').trim().replace(/^#/, '').slice(0, 30);
  if (id.length < 3 || !/^[A-Za-z0-9][A-Za-z0-9\-/_]*$/.test(id)) {
    await sendMessage(chatId,
      `⚠️ That doesn't look like a valid ID.\n\nExamples: <code>22-43211-3</code>, <code>C232101</code>`,
      { parse_mode: 'HTML' }
    );
    return;
  }
  state.universityId = id;
  state.stage = 'file';
  await setUploadState(chatId, state);
  await sendMessage(chatId,
    `✅ Got it — <code>ID-${esc(id)}</code> will be marked with the file.\n\nNow send the <b>file</b> to upload.`,
    { parse_mode: 'HTML' }
  );
}

async function handleUploadCallback(cq: any, chatId: number, messageId: number, args: string[]) {
  const action = args[0];

  if (action === 'cancel') {
    await setUploadState(chatId, null);
    await editMessageText(chatId, messageId, `❌ <b>Upload cancelled.</b>\n\nUse <code>/upload</code> to start a new upload.`, { reply_markup: { inline_keyboard: [] } });
    return;
  }

  const state = (await getUploadState(chatId)) || { stage: 'dept', ts: Date.now() };

  if (action === 'dept') {
    const deptId = args[1];
    if (!deptId || !findDepartment(deptId)) { await answerCallbackQuery(cq.id, 'Pick a department'); return; }
    state.dept = deptId;
    state.stage = 'sem';
    state.courses = undefined; state.courseFolder = undefined; state.courseCode = undefined;
    state.category = undefined; state.term = undefined; state.session = undefined;
    await setUploadState(chatId, state);
    await editMessageText(chatId, messageId,
      `<b>📤 Upload a File</b>\n\n🏢 Department: <b>${esc(getDeptName(deptId))}</b>\n\nNow pick the <b>semester</b>:`,
      { reply_markup: { inline_keyboard: uploadSemButtons() } }
    );
    return;
  }

  if (action === 'sem') {
    const semId = args[1];
    if (!semId || !config.semesters.some(s => s.id === semId)) { await answerCallbackQuery(cq.id, 'Pick a semester'); return; }
    state.sem = semId;
    state.stage = 'course';
    state.courseFolder = undefined; state.courseCode = undefined;
    state.category = undefined; state.term = undefined; state.session = undefined;
    const tree = await getGithubTree();
    if (!tree.length) {
      await editMessageText(chatId, messageId, `⚠️ Could not load course data. Please try again in a minute.`);
      return;
    }
    state.courses = listCoursesForDeptSem(tree, getDepartmentFolder(state.dept || ''), semId);
    await setUploadState(chatId, state);
    const emptyHint = state.courses.length === 0 ? `\n\n<i>(No courses here yet — create the first one!)</i>` : '';
    await editMessageText(chatId, messageId,
      `<b>📤 Upload</b>\n\n🏢 ${esc(getDeptName(state.dept || ''))} · 📅 ${esc(semLabel(semId))}\n\nPick a <b>course</b> or create a new one:${emptyHint}`,
      { reply_markup: { inline_keyboard: uploadCourseButtons(state) } }
    );
    return;
  }

  if (action === 'newcourse') {
    state.stage = 'newcourse';
    await setUploadState(chatId, state);
    await editMessageText(chatId, messageId,
      `➕ <b>Create Course</b>\n\nSend the course code and title like:\n\n<code>QSM-3602 - Islamic Studies</code>\n\nor just a code:\n<code>QUR101</code>`,
      { reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'up:cancel' }]] } }
    );
    return;
  }

  if (action === 'pick') {
    const code = (args[1] || '').toUpperCase();
    const norm = (c: string) => c.replace(/[^A-Z0-9]/g, '');
    const course = (state.courses || []).find(c => norm(c.code) === norm(code));
    if (!course) { await answerCallbackQuery(cq.id, 'Course not found — pick again'); return; }
    state.courseCode = course.code;
    state.courseFolder = course.folder;
    state.category = undefined; state.term = undefined; state.session = undefined;
    state.stage = 'category';
    await setUploadState(chatId, state);
    await editMessageText(chatId, messageId,
      `<b>📤 Upload</b>\n\n🏢 ${esc(getDeptName(state.dept || ''))} · 📅 ${esc(semLabel(state.sem || ''))}\n📚 <code>${esc(course.code)}</code> — ${esc(course.title)}\n\nWhat is the <b>category</b>?`,
      { reply_markup: { inline_keyboard: uploadCategoryButtons() } }
    );
    return;
  }

  if (action === 'cat') {
    const cat = args[1];
    if (!UPLOAD_CATEGORIES.some(c => c.key === cat)) { await answerCallbackQuery(cq.id, 'Pick a category'); return; }
    state.category = cat;
    state.term = undefined; state.session = undefined;
    if (TERM_CATEGORIES.has(cat)) {
      state.stage = 'term';
      await setUploadState(chatId, state);
      await editMessageText(chatId, messageId,
        `<b>📤 Upload</b>\n\n📚 <code>${esc(state.courseCode || '')}</code> · ${esc(CATEGORY_META[cat]?.label || cat)}\n\n<b>Mid</b> or <b>Final</b>?`,
        { reply_markup: { inline_keyboard: uploadTermButtons() } }
      );
    } else {
      await askUploadMessage(chatId, messageId, state);
    }
    return;
  }

  if (action === 'term') {
    const term = args[1];
    if (term !== 'Mid' && term !== 'Final') { await answerCallbackQuery(cq.id, 'Pick Mid or Final'); return; }
    state.term = term;
    state.stage = 'season';
    await setUploadState(chatId, state);
    await editMessageText(chatId, messageId,
      `<b>📤 Upload</b>\n\n📚 <code>${esc(state.courseCode || '')}</code> · ${term} · ${esc(CATEGORY_META[state.category || '']?.label || '')}\n\nWhich <b>season</b>?`,
      { reply_markup: { inline_keyboard: uploadSeasonButtons() } }
    );
    return;
  }

  if (action === 'season') {
    const season = args[1];
    if (season !== 'Spring' && season !== 'Autumn') { await answerCallbackQuery(cq.id, 'Pick a season'); return; }
    state.season = season;
    state.stage = 'year';
    await setUploadState(chatId, state);
    await editMessageText(chatId, messageId,
      `<b>📤 Upload</b>\n\n📚 <code>${esc(state.courseCode || '')}</code> · ${state.term} · ${season}\n\nWhich <b>year</b>?\n\n<i>📎 After you pick the year, send me the file to upload.</i>`,
      { reply_markup: { inline_keyboard: uploadYearButtons(season) } }
    );
    return;
  }

  if (action === 'session') {
    const season = args[1];
    const year = args[2];
    if ((season !== 'Spring' && season !== 'Autumn') || !/^\d{4}$/.test(year || '')) { await answerCallbackQuery(cq.id, 'Pick a year'); return; }
    state.season = season;
    state.session = `${season} ${year}`;
    await askUploadMessage(chatId, messageId, state);
    return;
  }

  await answerCallbackQuery(cq.id, 'Action expired — start again with /upload');
}

// Telegram chat ids allowed to approve/reject destructive actions (deletes, broadcast).
// Owners are resolved from TELEGRAM_OWNER_CHAT_ID (if set) plus the connected
// Telegram chats of all owner accounts.
async function resolveOwnerChatIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  const envOwnerChatId = process.env.TELEGRAM_OWNER_CHAT_ID;
  if (envOwnerChatId) ids.add(String(envOwnerChatId));
  try {
    const { prisma } = await import('@/lib/prisma');
    const profiles = await prisma.profile.findMany({
      where: { email: { in: config.ownerEmails }, telegramChatId: { not: null } },
      select: { telegramChatId: true },
    });
    for (const p of profiles) if (p.telegramChatId) ids.add(String(p.telegramChatId));
  } catch {}
  return ids;
}

async function getAppBotToken(): Promise<string | null> {
  try {
    const installations = await getAppInstallations();
    if (!Array.isArray(installations) || installations.length === 0) return null;
    return await getInstallationAccessToken(installations[0].id);
  } catch { return null; }
}

function ghHeaders(token: string) {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

async function getAllFilesInFolder(token: string, folderPath: string): Promise<{ path: string; sha: string }[]> {
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
    body: JSON.stringify({ message: `Delete course: ${files.length} files`, tree: treeData.sha, parents: [baseCommitSha] }),
  });
  if (!newCommitRes.ok) return 0;
  const newCommitData = await newCommitRes.json();

  await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`, {
    method: 'PATCH', headers: ghHeaders(token),
    body: JSON.stringify({ sha: newCommitData.sha, force: true }),
  });

  return files.length;
}

// ─── Helper: process email input from user ────────────────────────
async function processConnectEmail(chatId: number, email: string, telegramUsername: string | null) {
  const { prisma } = await import('@/lib/prisma');

  const profile = await prisma.profile.findUnique({
    where: { userId: email },
    select: { userId: true, telegramChatId: true, telegramVerified: true, accountStatus: true },
  });

  if (!profile) {
    await sendMessage(chatId,
      `❌ <b>User doesn't exist</b>\n\n` +
      `No account found for <code>${esc(email)}</code> in IIUC-ARMS.\n\n` +
      `Make sure you registered on IIUC-ARMS with this exact email, or contact the manager/admin.`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  // Only active accounts can connect
  const isOwner = config.ownerEmails.includes(email);
  if (!isOwner && profile.accountStatus !== 'active') {
    const statusLabel = profile.accountStatus === 'pending' ? '⏳ Pending approval' :
      profile.accountStatus === 'rejected' ? '❌ Rejected' :
      profile.accountStatus === 'banned' ? '🚫 Banned' : '⚠️ Unknown status';
    await sendMessage(chatId,
      `❌ <b>Account not approved</b>\n\n` +
      `📧 <code>${esc(email)}</code>\n` +
      `Status: ${statusLabel}\n\n` +
      `Please wait for admin approval or contact support.`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  if (profile.telegramChatId && profile.telegramVerified && profile.telegramChatId !== String(chatId)) {
    await sendMessage(chatId,
      `ℹ️ The email <code>${esc(email)}</code> is already connected to another Telegram account.\n\n` +
      `Use <code>/disconnect</code> on that account first, or contact admin.`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  if (profile.telegramChatId === String(chatId) && profile.telegramVerified) {
    await sendMessage(chatId,
      `✅ <b>Already connected!</b>\n\n` +
      `📧 Account: <code>${esc(email)}</code>\n\n` +
      `You're all set. Use <code>/disconnect</code> if you want to unlink.`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  // One Telegram account can be linked to up to MAX_ACCOUNTS_PER_CHAT profiles
  const linkedCount = await prisma.profile.count({
    where: {
      telegramChatId: String(chatId),
      telegramVerified: true,
      userId: { not: email },
    },
  });
  if (linkedCount >= 3) {
    await sendMessage(chatId,
      `❌ <b>Limit reached</b>\n\n` +
      `This Telegram is already connected to <b>${linkedCount}</b> accounts (max 3).\n\n` +
      `Please contact the manager/admin to increase your limit.`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  await prisma.profile.update({
    where: { userId: email },
    data: {
      telegramChatId: String(chatId),
      telegramVerified: false,
      telegramConnectState: null,
      ...(telegramUsername ? { telegramId: telegramUsername } : {}),
    },
  });

  const connectionsUrl = `${SITE_URL}/dashboard?tab=github`;
  await sendMessage(chatId,
    `✅ <b>Request sent successfully!</b>\n\n` +
    `📧 Account: <code>${esc(email)}</code>\n\n` +
    `Now open <a href="${connectionsUrl}">IIUC-ARMS → Dashboard → Connections → Telegram</a>,\n` +
    `click <b>Send OTP</b>, then enter the 6-digit OTP from this chat to verify.\n\n` +
    `<i>Or open the link above in your browser to go straight to the Connections page.</i>`,
    { parse_mode: 'HTML' }
  );
  console.log(`[TG] /connect: ${email} -> chat_id ${chatId} (pending verification)`);
}

// Telegram includes this header on every webhook update when a secret_token
// was registered via setWebhook. We require it so forged HTTP requests (e.g.
// someone POSTing a fake update to spam arbitrary chats or approve deletes)
// are rejected before any handler runs.
const WEBHOOK_SECRET = configuredSecret();

// Keep the bot's command menu in sync automatically (once per 12h per server
// instance) so /upload and the trimmed commands always show in Telegram.
let botCommandsSyncedAt = 0;
async function maybeSyncBotCommands() {
  const now = Date.now();
  if (now - botCommandsSyncedAt < 12 * 60 * 60 * 1000) return;
  botCommandsSyncedAt = now;
  try {
    const res = await Promise.race([
      registerBotCommands(),
      new Promise<{ ok: boolean; description?: string }>((resolve) =>
        setTimeout(() => resolve({ ok: false, description: 'setMyCommands timed out' }), 8000)
      ),
    ]);
    if (!res.ok) console.warn('[TG] setMyCommands failed:', res.description);
  } catch {}
}

export async function POST(req: NextRequest) {
  const headerToken = req.headers.get('x-telegram-bot-api-secret-token');
  if (!WEBHOOK_SECRET || headerToken !== WEBHOOK_SECRET) {
    console.warn(
      `[TG] Webhook REJECTED: header=${headerToken ? 'present(mismatch)' : 'MISSING'}, ` +
      `configured=${WEBHOOK_SECRET ? 'yes' : 'NO_SECRET'}. ` +
      `Fix: set TELEGRAM_BOT_TOKEN (and optionally TELEGRAM_BOT_WEBHOOK_SECRET) in Vercel, ` +
      `then visit /api/telegram/setup?key=<secret> to re-register the webhook.`
    );
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await maybeSyncBotCommands();

  try {
    const body = await req.json();
    console.log('[TG] Webhook received:', JSON.stringify(body).substring(0, 200));

    if (body.callback_query) {
      await handleCallbackQuery(body.callback_query);
      return NextResponse.json({ ok: true });
    }

    if (body.message) {
      await handleMessage(body.message);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[TG] Webhook error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── Anti-spam: flood guard + stranger silence ────────────────────
const FLOOD_WINDOW_MS = 60 * 1000;
const FLOOD_MAX = 15;
const FLOOD_BLOCK_MS = 5 * 60 * 1000;
const floodCounts = new Map<number, { count: number; resetAt: number; blockedUntil: number }>();

function isFlooding(chatId: number): boolean {
  const now = Date.now();
  const entry = floodCounts.get(chatId);
  if (!entry || now > entry.resetAt) {
    floodCounts.set(chatId, { count: 1, resetAt: now + FLOOD_WINDOW_MS, blockedUntil: 0 });
    return false;
  }
  entry.count++;
  if (entry.blockedUntil && now < entry.blockedUntil) return true;
  if (entry.count > FLOOD_MAX) {
    entry.blockedUntil = now + FLOOD_BLOCK_MS;
    console.log(`[TG] Flood blocked chat_id ${chatId}`);
    return true;
  }
  return false;
}

// True when this chat is linked to a verified IIUC-ARMS account.
async function isVerifiedChat(chatId: number): Promise<boolean> {
  try {
    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findFirst({
      where: { telegramChatId: String(chatId), telegramVerified: true },
      select: { userId: true },
    });
    return !!profile;
  } catch { return false; }
}

// Owner-only spam blocklist management: /block @user|chatid, /unblock …, /blocklist.
async function handleBlockCommand(chatId: number, cmd: string) {
  const ownerChats = await resolveOwnerChatIds();
  if (!ownerChats.has(String(chatId))) {
    await sendMessage(chatId, '⛔ Only the owner can manage the blocklist.');
    return;
  }

  const [name, ...rest] = cmd.split(/\s+/);
  const arg = rest.join(' ').trim();

  if (name === '/blocklist') {
    const { prisma } = await import('@/lib/prisma');
    const settings = await prisma.siteSettings.findUnique({ where: { id: 'site-settings' } });
    const chats = (settings as any)?.blockedTelegramChats || [];
    const users = (settings as any)?.blockedTelegramUsernames || [];
    await sendMessage(chatId,
      `🚫 <b>Blocklist</b>\n\n` +
      `Chats: ${chats.length ? chats.map((c: any) => `<code>${c}</code>`).join(', ') : 'none'}\n` +
      `Users: ${users.length ? users.map((u: any) => `<code>@${u}</code>`).join(', ') : 'none'}\n\n` +
      `• <code>/block @username</code> or <code>/block 123456789</code>\n` +
      `• <code>/unblock @username</code> or <code>/unblock 123456789</code>`
    );
    return;
  }

  if (!arg) {
    await sendMessage(chatId, `Usage: <code>/${name} @username</code> or <code>/${name} 123456789</code>`);
    return;
  }

  const isUsername = arg.startsWith('@');
  if (name === '/block') {
    if (isUsername) await updateBlocklist({ addUsername: arg.slice(1) });
    else await updateBlocklist({ addChat: arg });
    await sendMessage(chatId, `🚫 <b>Blocked</b> ${isUsername ? `@${arg.slice(1)}` : `<code>${arg}</code>`} — they will be ignored.`);
  } else {
    if (isUsername) await updateBlocklist({ removeUsername: arg.slice(1) });
    else await updateBlocklist({ removeChat: arg });
    await sendMessage(chatId, `✅ <b>Unblocked</b> ${isUsername ? `@${arg.slice(1)}` : `<code>${arg}</code>`}.`);
  }
}

async function handleMessage(msg: any) {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  const chatType = msg.chat.type;
  const isGroup = chatType === 'group' || chatType === 'supergroup';

  // Log this chat for admin panel discovery
  logChatFromMessage(msg);

  // Flood protection — silently drop messages when a chat hammers the bot.
  if (isFlooding(chatId)) return;

  // Blocked chats/usernames (owner-managed /block list) are dropped silently.
  if (await isBlockedChat(chatId, msg.from?.username)) {
    console.log(`[TG] Blocked sender ignored: chat_id ${chatId} user ${msg.from?.username || ''}`);
    return;
  }

  // Anti-spam: unverified chats that send links are ignored (spam bots almost
  // always link somewhere). /start and /connect stay open so real users can
  // still link their account.
  if (!isGroup && /(https?:\/\/|www\.|t\.me\/|telegram\.me\/)/i.test(text) && !/^\/(start|connect)\b/.test(text)) {
    if (!(await isVerifiedChat(chatId))) {
      console.log(`[TG] Unverified link message ignored from chat_id ${chatId}`);
      return;
    }
  }

  console.log(`[TG] msg from ${chatId}: "${text}" | TOKEN=${process.env.TELEGRAM_BOT_TOKEN ? 'SET(' + process.env.TELEGRAM_BOT_TOKEN.substring(0, 5) + '...)' : 'MISSING'}`);

  await sendChatAction(chatId);

  if (isGroup) {
    const isCommand = msg.entities?.some((e: any) => e.type === 'bot_command' && e.offset === 0);
    const isMention = msg.entities?.some((e: any) => e.type === 'mention' && e.offset === 0);
    if (!isCommand && !isMention && !COURSE_REGEX.test(text)) return;
  }

  const cleanText = text
    .replace(/(\/\w+)@[A-Za-z]\w*/g, '$1')
    .replace(/^@[A-Za-z]\w*\s+/, '')
    .trim();
  const telegramUsername = msg.from?.username ? `@${msg.from.username}` : null;

  // ─── Upload wizard: file uploads ───
  if (msg.document) {
    if (isGroup) return; // file uploads are private-chat only
    const flow = await getUploadState(chatId);
    if (flow && flow.stage === 'file') {
      await handleUploadDocument(chatId, msg, flow);
    } else {
      await sendMessage(chatId,
        `📤 <b>To upload a file</b>, start with <code>/upload</code> and follow the steps (department → semester → course → category).`,
        { parse_mode: 'HTML' }
      );
    }
    return;
  }

  // ─── Upload wizard: text steps (course code+title / university ID) ───
  if (!isGroup && text && !text.startsWith('/')) {
    const flow = await getUploadState(chatId);
    if (flow?.stage === 'newcourse') { await handleNewCourseText(chatId, flow, cleanText); return; }
    if (flow?.stage === 'askid') { await handleUniversityIdText(chatId, flow, cleanText); return; }
  }

  // ─── Owner block management ───
  if (/^\/(block|unblock|blocklist)\b/.test(cleanText)) {
    await handleBlockCommand(chatId, cleanText);
    return;
  }

  try {
    // ─── /start ───
    if (cleanText === '/start') {
      try {
        const username = msg.from?.username;
        const { prisma } = await import('@/lib/prisma');

        if (username) {
          const profile = await prisma.profile.findFirst({
            where: { telegramId: { in: [`@${username}`, username] } },
          });
          if (profile && !profile.telegramChatId) {
            await prisma.profile.update({
              where: { userId: profile.userId },
              data: { telegramChatId: String(chatId) },
            });
            console.log(`[TG] Linked @${username} -> chat_id ${chatId} (user: ${profile.userId})`);
          } else if (profile) {
            if (profile.telegramChatId !== String(chatId)) {
              await prisma.profile.update({
                where: { userId: profile.userId },
                data: { telegramChatId: String(chatId) },
              });
            }
          }
        }
      } catch (err: any) {
        console.error('[TG] Failed to link chat_id:', err?.message);
      }

      await sendMessage(chatId, buildWelcomeMessage(), {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚀 Open IIUC-ARMS', url: SITE_URL }],
            [
              { text: '🏫 Faculties', callback_data: 'start_faculties' },
              { text: '👥 Contributors', callback_data: 'start_contributors' },
            ],
            [
              { text: '💻 Developed By', callback_data: 'start_devby' },
              { text: '📖 Help', callback_data: 'start_help' },
            ],
          ],
        },
      });
      return;
    }

    // ─── /start <email> (deep link from web app) ───
    if (cleanText.startsWith('/start ')) {
      const payload = cleanText.replace('/start', '').trim();
      if (payload && payload.includes('@')) {
        try {
          const { prisma } = await import('@/lib/prisma');
          const profile = await prisma.profile.findUnique({ where: { userId: payload }, select: { userId: true, telegramChatId: true, telegramVerified: true } });
          if (profile && !(profile.telegramChatId && profile.telegramVerified)) {
            const otp = String(Math.floor(100000 + Math.random() * 900000));
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
            await prisma.profile.update({
              where: { userId: payload },
              data: {
                telegramChatId: String(chatId),
                telegramVerified: false,
                telegramOtp: otp,
                telegramOtpExpiresAt: expiresAt,
                telegramConnectState: null,
                ...(telegramUsername ? { telegramId: telegramUsername } : {}),
              },
            });
            await sendMessage(chatId, `🔗 <b>Telegram connection requested!</b>\n\nNow open IIUC-ARMS web app and confirm your Telegram account.`, { parse_mode: 'HTML' });
            console.log(`[TG] Deep link: ${payload} -> chat_id ${chatId} (pending verification)`);
            return;
          }
          if (profile?.telegramChatId && profile.telegramVerified) {
            await sendMessage(chatId, `ℹ️ This account is already connected to Telegram.`, { parse_mode: 'HTML' });
            return;
          }
        } catch (err: any) {
          console.error('[TG] Deep link error:', err?.message);
        }
        await sendMessage(chatId, `⚠️ Could not link account <code>${payload}</code>. Please try again or contact admin.`, { parse_mode: 'HTML' });
        return;
      }
    }

    // ─── /connect — link Telegram account ───
    if (cleanText === '/connect' || cleanText.startsWith('/connect ')) {
      const email = cleanText.replace('/connect', '').trim().toLowerCase();
      if (!email || !email.includes('@')) {
        await sendMessage(chatId,
          `🔗 <b>Connect your Telegram</b>\n\n` +
          `Send <code>/connect yourmail@ugrad.iiuc.ac.bd</code>\n\n` +
          `Then open the web app → Dashboard → Connections → Telegram → Send OTP.`,
          { parse_mode: 'HTML' }
        );
        return;
      }
      await sendMessage(chatId,
        `⏳ <b>Processing...</b>\n\n` +
        `Checking account <code>${esc(email)}</code> and linking this Telegram chat...`,
        { parse_mode: 'HTML' }
      );
      await processConnectEmail(chatId, email, telegramUsername);
      return;
    }

    // ─── /disconnect — unlink Telegram ───
    if (cleanText === '/disconnect') {
      try {
        const { prisma } = await import('@/lib/prisma');
        const profile = await prisma.profile.findFirst({ where: { telegramChatId: String(chatId) } });
        if (!profile) {
          await sendMessage(chatId, 'ℹ️ No connected account found.', { parse_mode: 'HTML' });
          return;
        }
        await prisma.profile.update({
          where: { userId: profile.userId },
          data: { telegramChatId: null, telegramVerified: false, telegramOtp: null, telegramOtpExpiresAt: null, telegramConnectState: null },
        });
        await sendMessage(chatId, `✅ <b>Telegram disconnected</b>\n\nYour account (<code>${profile.userId}</code>) has been unlinked from this Telegram chat.`, { parse_mode: 'HTML' });
        console.log(`[TG] /disconnect: ${profile.userId} <- chat_id ${chatId}`);
      } catch (err: any) {
        console.error('[TG] /disconnect error:', err?.message);
        await sendMessage(chatId, '❌ Something went wrong. Please try again later.', { parse_mode: 'HTML' });
      }
      return;
    }

    // ─── /status — show connection status ───
    if (cleanText === '/status') {
      try {
        const { prisma } = await import('@/lib/prisma');
        const profile = await prisma.profile.findFirst({ where: { telegramChatId: String(chatId) }, select: { userId: true, name: true, telegramVerified: true, telegramConnectState: true } });
        if (!profile) {
          await sendMessage(chatId, 'ℹ️ You are not connected to any IIUC-ARMS account.\n\nSend <code>/connect</code> to link.', { parse_mode: 'HTML' });
          return;
        }
        if (profile.telegramVerified) {
          await sendMessage(chatId, `✅ <b>Connected</b>\n\n📧 Account: <code>${profile.userId}</code>\n👤 Name: ${profile.name || 'Not set'}\n\nYou will receive notifications for this account.`, { parse_mode: 'HTML' });
        } else if (profile.telegramConnectState === 'awaiting_email') {
          await sendMessage(chatId, `📧 <b>Awaiting your email</b>\n\n📧 Account: <code>${profile.userId}</code>\n\nSend your IIUC-ARMS login email to continue, or <code>/cancel</code> to abort.`, { parse_mode: 'HTML' });
        } else {
          await sendMessage(chatId, `⏳ <b>Pending verification</b>\n\n📧 Account: <code>${profile.userId}</code>\n\nOpen the IIUC-ARMS web app to complete verification.`, { parse_mode: 'HTML' });
        }
      } catch (err: any) {
        console.error('[TG] /status error:', err?.message);
        await sendMessage(chatId, '❌ Something went wrong.', { parse_mode: 'HTML' });
      }
      return;
    }

    // ─── /help ───
    if (cleanText === '/help') {
      await sendMessage(chatId, buildHelpMessage());
      return;
    }

    // ─── /departments ───
    if (cleanText === '/departments') {
      await sendMessage(chatId, buildDeptList(), {
        reply_markup: { inline_keyboard: [[{ text: '🌐 Open IIUC-ARMS', url: openLink(SITE_URL) }] ]},
      });
      return;
    }

    // ─── /semester N ───
    if (cleanText.startsWith('/semester')) {
      const semNum = cleanText.replace('/semester', '').trim();
      if (!semNum || !/^[1-8]$/.test(semNum)) {
        await sendMessage(chatId, `Usage: <code>/semester 3</code>\nSemester number must be 1-8.`);
        return;
      }
      const num = parseInt(semNum);
      const semId = `${num}${num === 1 ? 'st' : num === 2 ? 'nd' : num === 3 ? 'rd' : 'th'}-semister`;
      const tree = await getGithubTree();
      if (!tree.length) {
        await sendMessage(chatId, `⚠️ Could not load course data. Try again later.`);
        return;
      }
      await sendMessage(chatId, buildCoursesList(tree, undefined, semId), {
        reply_markup: { inline_keyboard: [[{ text: '🌐 Open IIUC-ARMS', url: openLink(SITE_URL) }] ]},
      });
      return;
    }

    // ─── /course-code CODE or /code CODE ───
    if (cleanText.startsWith('/course-code') || cleanText.startsWith('/code')) {
      const code = cleanText.replace(/^(\/course-code|\/code)\s*/i, '').trim().toUpperCase();
      if (!code || !/^[A-Z]{2,5}-?\d{3,5}[A-Z]?$/i.test(code)) {
        await sendMessage(chatId,
          `Usage: <code>/course-code QSM-3602</code>\n\n` +
          `Course code format: 2-5 letters + 3-5 digits\n` +
          `Examples: QUR101, QSM-3602, CSE101`
        );
        return;
      }
      const tree = await getGithubTree();
      if (!tree.length) {
        await sendMessage(chatId, `⚠️ Could not load course data. Try again later.`);
        return;
      }
      const files = findCourseFiles(tree, code);
      const info = getCourseInfo(files);

      if (!info) {
        const locations = findCourseLocations(tree, code);
        if (locations.length === 0) {
          await sendMessage(chatId,
            `❌ No course found for <b>${esc(code)}</b>.\n\n` +
            `💡 Try:\n` +
            `• Check the course code spelling\n` +
            `• <code>/departments</code> to browse\n` +
            `• <code>/search ${code}</code> to search`
          );
          return;
        }
        const courseTitle = locations[0].title || code;
        let msg = `<b>📚 ${esc(code)}</b> — ${esc(courseTitle)}\n`;
        msg += `📂 Course exists but no files uploaded yet.\n\n`;
        const buttons: any[][] = [];
        for (const loc of locations) {
          const semLabel = config.semesters.find(s => s.id === loc.sem)?.label || loc.sem;
          msg += `📍 <b>${esc(semLabel)}</b> — ${esc(getDeptName(loc.dept))}\n`;
          const directUrl = `${SITE_URL}/?dept=${loc.dept}&sem=${loc.sem}&course=${code}`;
          buttons.push([{ text: `📂 Open ${code} — ${getDeptName(loc.dept)} ${semLabel}`, url: directUrl }]);
        }
        await sendMessage(chatId, msg, { reply_markup: { inline_keyboard: buttons } });
        return;
      }

      const depts = Array.from(new Set(files.map(f => f.department)));

      let msg = `<b>📚 ${esc(code)}</b>\n\n`;

      const buttons: any[][] = [];

      for (const dept of depts) {
        const deptSems = Array.from(new Set(files.filter(f => f.department === dept).map(f => f.semester)));
        for (const sem of deptSems) {
          const semFiles = files.filter(f => f.department === dept && f.semester === sem);
          const semLabel = config.semesters.find(s => s.id === sem)?.label || sem;
          const catCounts: Record<string, number> = {};
          for (const f of semFiles) {
            catCounts[f.category] = (catCounts[f.category] || 0) + 1;
          }
          const catParts = Object.entries(catCounts).map(([k, v]) => {
            const meta = CATEGORY_META[k];
            return `${meta?.icon || '📁'} ${meta?.label || k}: ${v}`;
          }).join(' · ');
          msg += `📍 <b>${esc(semLabel)}</b> — ${esc(getDeptName(dept))}\n`;
          msg += `  ${catParts}\n`;
          const directUrl = `${SITE_URL}/?dept=${dept}&sem=${sem}&course=${code}`;
          buttons.push([{ text: `📂 Open ${code} — ${getDeptName(dept)} ${semLabel}`, url: directUrl }]);
        }
      }

      await sendMessage(chatId, msg, {
        reply_markup: { inline_keyboard: buttons },
      });
      return;
    }

    // ─── /courses [dept] [sem] ───
    if (cleanText.startsWith('/courses')) {
      const args = cleanText.replace('/courses', '').trim().split(/\s+/);
      const deptId = args[0] || '';
      const semNum = args[1] || '';

      let semId = '';
      if (semNum && /^[1-8]$/.test(semNum)) {
        const num = parseInt(semNum);
        semId = `${num}${num === 1 ? 'st' : num === 2 ? 'nd' : num === 3 ? 'rd' : 'th'}-semister`;
      }

      const tree = await getGithubTree();
      if (!tree.length) {
        await sendMessage(chatId, `⚠️ Could not load course data. Try again later.`);
        return;
      }
      await sendMessage(chatId, buildCoursesList(tree, deptId || undefined, semId || undefined));
      return;
    }

    // ─── /search query ───
    if (cleanText.startsWith('/search')) {
      const query = cleanText.replace('/search', '').trim();
      if (!query) {
        await sendMessage(chatId,
          `Usage: <code>/search notes</code>\n\n` +
          `Search for files, courses, or folders by name.`
        );
        return;
      }
      const tree = await getGithubTree();
      if (!tree.length) {
        await sendMessage(chatId, `⚠️ Could not load course data. Try again later.`);
        return;
      }
      await sendMessage(chatId, buildSearchResults(query, tree));
      return;
    }

    // ─── /stats ───
    if (cleanText === '/stats') {
      const tree = await getGithubTree();
      if (!tree.length) {
        await sendMessage(chatId, `⚠️ Could not load course data. Try again later.`);
        return;
      }
      await sendMessage(chatId, buildStatsMessage(tree));
      return;
    }

    // ─── /upload — start the file-upload wizard ───
    if (cleanText === '/upload') {
      if (isGroup) {
        await sendMessage(chatId, `ℹ️ Please use <code>/upload</code> in a <b>private chat</b> with the bot to upload files.`);
        return;
      }
      await setUploadState(chatId, { stage: 'dept', ts: Date.now() });
      await sendMessage(chatId,
        `<b>📤 Upload a File</b>\n\nFirst pick the <b>department</b>:`,
        { reply_markup: { inline_keyboard: uploadDeptButtons() } }
      );
      return;
    }

    // ─── /broadcast (owner only) ───
    if (cleanText.startsWith('/broadcast')) {
      const broadcastMsg = cleanText.replace('/broadcast', '').trim();
      if (!broadcastMsg) {
        await sendMessage(chatId, `Usage: <code>/broadcast Your announcement message</code>\n\nOnly the owner can use this command.`);
        return;
      }
      await sendMessage(chatId,
        `📢 <b>Broadcast Preview</b>\n\n` +
        `${broadcastMsg}\n\n` +
        `Use the admin panel to send this to all users.`,
      );
      return;
    }

    // ─── Plain course code (e.g. QSM-3602, QUR101) ───
    if (COURSE_REGEX.test(cleanText)) {
      const courseCode = cleanText.toUpperCase();

      const tree = await getGithubTree();
      if (!tree.length) {
        await sendMessage(chatId, `⚠️ Could not load course data. Try again later.`);
        return;
      }
      const files = findCourseFiles(tree, courseCode);
      const info = getCourseInfo(files);

      if (!info) {
        const locations = findCourseLocations(tree, courseCode);
        if (locations.length === 0) {
          await sendMessage(chatId,
            `❌ No course found for <b>${esc(courseCode)}</b>.\n\n` +
            `💡 Try:\n` +
            `• Check the course code spelling\n` +
            `• <code>/departments</code> to browse\n` +
            `• <code>/search ${courseCode}</code> to search`
          );
          return;
        }
        const courseTitle = locations[0].title || courseCode;
        let msg = `<b>📚 ${esc(courseCode)}</b> — ${esc(courseTitle)}\n`;
        msg += `📂 Course exists but no files uploaded yet.\n\n`;
        const buttons: any[][] = [];
        for (const loc of locations) {
          const semLabel = config.semesters.find(s => s.id === loc.sem)?.label || loc.sem;
          msg += `📍 <b>${esc(semLabel)}</b> — ${esc(getDeptName(loc.dept))}\n`;
          const directUrl = `${SITE_URL}/?dept=${loc.dept}&sem=${loc.sem}&course=${courseCode}`;
          buttons.push([{ text: `📂 Open ${courseCode} — ${getDeptName(loc.dept)} ${semLabel}`, url: directUrl }]);
        }
        await sendMessage(chatId, msg, { reply_markup: { inline_keyboard: buttons } });
        return;
      }

      const depts = Array.from(new Set(files.map(f => f.department)));

      let msg = `<b>📚 ${esc(courseCode)}</b>\n\n`;

      const buttons: any[][] = [];

      for (const dept of depts) {
        const deptSems = Array.from(new Set(files.filter(f => f.department === dept).map(f => f.semester)));
        for (const sem of deptSems) {
          const semFiles = files.filter(f => f.department === dept && f.semester === sem);
          const semLabel = config.semesters.find(s => s.id === sem)?.label || sem;
          const catCounts: Record<string, number> = {};
          for (const f of semFiles) {
            catCounts[f.category] = (catCounts[f.category] || 0) + 1;
          }
          const catParts = Object.entries(catCounts).map(([k, v]) => {
            const meta = CATEGORY_META[k];
            return `${meta?.icon || '📁'} ${meta?.label || k}: ${v}`;
          }).join(' · ');
          msg += `📍 <b>${esc(semLabel)}</b> — ${esc(getDeptName(dept))}\n`;
          if (catParts) msg += `  ${catParts}\n`;
          const directUrl = `${SITE_URL}/?dept=${dept}&sem=${sem}&course=${courseCode}`;
          buttons.push([{ text: `📂 Open ${courseCode} — ${getDeptName(dept)} ${semLabel}`, url: directUrl }]);
        }
      }

      await sendMessage(chatId, msg, {
        reply_markup: { inline_keyboard: buttons },
      });
      return;
    }

    // ─── Unknown command ───
    if (cleanText.startsWith('/')) {
      if (!(await isVerifiedChat(chatId))) return; // ignore strangers
      await sendMessage(chatId,
        `🤔 Unknown command.\n\n` +
        `Try:\n` +
        `• <code>/connect</code> — Link your Telegram\n` +
        `• <code>QUR101</code> — search a course\n` +
        `• <code>/search notes</code> — search files\n` +
        `• <code>/departments</code> — list departments\n` +
        `• <code>/help</code> — all commands`
      );
      return;
    }

    // ─── Plain text in private chat ───
    if (!isGroup) {
      // Only respond to unrecognized text from verified accounts.
      // Strangers (spammers) get silently ignored instead of a reply.
      if (!(await isVerifiedChat(chatId))) return;
      await sendMessage(chatId,
        `🤔 Send a course code like <code>QSM-3602</code> to search.\n\n` +
        `Or try:\n` +
        `• <code>/connect</code> — Link your Telegram\n` +
        `• <code>/search notes</code>\n` +
        `• <code>/departments</code>\n` +
        `• <code>/help</code>`
      );
    }
  } catch (err: any) {
    console.error(`Telegram command error [${cleanText}]:`, err);
    await sendMessage(chatId,
      `⚠️ Something went wrong processing your request.\n` +
      `Error: ${esc(err?.message || 'Unknown error')}\n\n` +
      `Try again or use <code>/help</code> for commands.`
    );
  }
}

async function handleCallbackQuery(cq: any) {
  const data: string = cq.data || '';
  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;

  // Log this chat for admin panel discovery
  if (cq.message?.chat) logChatFromMessage({ chat: cq.message.chat });

  await answerCallbackQuery(cq.id);

  if (!chatId || !messageId) return;

  const parsed = parseCallbackData(data);
  if (!parsed) return;

  // Destructive actions (approving/rejecting course & file deletes) may only be
  // performed from an owner's Telegram chat.
  const DESTRUCTIVE_TYPES = ['course_del_confirm', 'course_del_reject', 'del_confirm', 'del_reject', 'del_file_confirm', 'del_file_reject'];
  if (DESTRUCTIVE_TYPES.includes(parsed.type)) {
    const ownerChats = await resolveOwnerChatIds();
    if (!ownerChats.has(String(chatId))) {
      await answerCallbackQuery(cq.id, '⛔ Only the owner can approve or reject deletes.');
      return;
    }
  }

  try {
    // ─── File-upload wizard buttons ───
    if (parsed.type === 'up') {
      await handleUploadCallback(cq, chatId, messageId, parsed.args);
      return;
    }

    // ─── Start menu buttons ───
    if (parsed.type === 'start_faculties') {
      await editMessageText(chatId, messageId, buildDeptList(), {
        reply_markup: { inline_keyboard: [[{ text: '🌐 Open IIUC-ARMS', url: SITE_URL }]] },
      });
      return;
    }
    if (parsed.type === 'start_contributors') {
      await editMessageText(chatId, messageId,
        `👥 <b>Contributors</b>\n\n` +
        `All course files are uploaded and maintained by our contributors.\n` +
        `Visit the Contributors page to see who contributed.\n\n` +
        `<a href="${SITE_URL}/contributors">Open Contributors Page →</a>`,
        { reply_markup: { inline_keyboard: [[{ text: '👥 Open Contributors', url: SITE_URL + '/contributors' }]] } }
      );
      return;
    }
    if (parsed.type === 'start_devby') {
      await editMessageText(chatId, messageId,
        `💻 <b>Developed By</b>\n\n` +
        `<b>Sayed Atiqur Rahman</b>\n` +
        `🎓 IIUC • Programming Light\n\n` +
        `🌐 <a href="${SITE_URL}">Open IIUC-ARMS →</a>`,
        { reply_markup: { inline_keyboard: [[{ text: '🌐 Open IIUC-ARMS', url: SITE_URL }]] } }
      );
      return;
    }
    if (parsed.type === 'start_help') {
      await editMessageText(chatId, messageId, buildHelpMessage());
      return;
    }

    // ─── Category buttons ───
    if (parsed.type === 'cat') {
      const [courseCode, category] = parsed.args;
      if (!courseCode || !category) return;

      const tree = await getGithubTree();
      const files = findCourseFiles(tree, courseCode);
      const text = buildCategoryResult(courseCode, category, files);

      const info = getCourseInfo(files);
      const buttons = (info?.categories || []).map(cat => {
        const meta = CATEGORY_META[cat];
        return {
          text: `${cat === category ? '✅ ' : ''}${meta?.icon || '📁'} ${meta?.label || cat}`,
          callback_data: catCallbackData(courseCode, cat),
        };
      });

      const websiteLink = buildCourseLink(courseCode);

      await editMessageText(chatId, messageId, text, {
        reply_markup: {
          inline_keyboard: [
            buttons,
            [{ text: '🌐 Open on IIUC-ARMS', url: websiteLink }],
          ],
        },
      });
    }

    // ─── Course delete request confirm (pending owner deletes) ───
    if (parsed.type === 'course_del_confirm') {
      const activityId = parsed.args[0];
      if (!activityId) return;

      const { prisma } = await import('@/lib/prisma');
      let logEntry: any = null;
      try {
        logEntry = await prisma.activityLog.findUnique({ where: { id: activityId } });
      } catch {}

      if (!logEntry || logEntry.action !== 'course_delete_request') {
        await editMessageText(chatId, messageId, `❌ Delete request not found or already processed.`);
        return;
      }

      const details = JSON.parse(logEntry.details || '{}');
      if (details.status !== 'pending_approval') {
        await editMessageText(chatId, messageId, `❌ This delete request was already ${details.status || 'processed'}.`);
        return;
      }

      const folderPath: string = details.folderPath || '';
      if (!folderPath) {
        await editMessageText(chatId, messageId, `❌ Invalid delete request — no folder path found.`);
        return;
      }

      const githubDeleted = await deleteCourseFolder(folderPath).catch((e) => {
        console.error('Telegram course delete failed:', e);
        return 0;
      });

      let course: any = null;
      try {
        course = await prisma.course.findFirst({
          where: { code: String(details.code || '').toUpperCase(), semester: details.semester, department: details.department },
        });
      } catch {}
      if (course) {
        try { await prisma.course.delete({ where: { id: course.id } }); } catch {}
      }

      // Mark approved (also syncs the panel, which reads status from details)
      try {
        const parsedDetails = JSON.parse(logEntry.details || '{}');
        parsedDetails.status = 'approved';
        parsedDetails.approvedBy = `chat:${chatId}`;
        parsedDetails.resolvedAt = new Date().toISOString();
        await prisma.activityLog.update({
          where: { id: activityId },
          data: { action: 'course_delete_approved', details: JSON.stringify(parsedDetails) },
        });
        // Clean up duplicate pending requests for the same course
        try {
          const dupes = await prisma.activityLog.findMany({ where: { action: 'course_delete_request' }, take: 50 });
          const dupeIds = dupes
            .filter((d: any) => {
              if (d.id === activityId) return false;
              const dd = JSON.parse(d.details || '{}');
              return dd.status === 'pending_approval' && dd.code === details.code && dd.semester === details.semester && dd.department === details.department;
            })
            .map((d: any) => d.id);
          if (dupeIds.length > 0) {
            await prisma.activityLog.updateMany({
              where: { id: { in: dupeIds } },
              data: { action: 'course_delete_approved', details: JSON.stringify({ ...parsedDetails, duplicateOf: activityId }) },
            });
          }
        } catch {}
      } catch {}

      // Notify the requester if connected
      const requesterChatId = await resolveRequesterChat(logEntry.userId);
      if (requesterChatId) {
        try {
          await sendMessage(requesterChatId,
            `✅ <b>Delete approved</b>\n\n` +
            `<b>Course:</b> <code>${details.code || ''}</code> — ${details.title || ''}\n` +
            `<b>Path:</b> <code>${folderPath}</code>\n\n` +
            `Your delete request has been <b>approved</b> by an admin.`
          );
        } catch {}
      }

      const semLabel = details.semester ? (config.semesters.find(s => s.id === details.semester)?.label || details.semester) : '';
      const pageLink = buildCourseLink(details.code || '', details.department, details.semester);
      await editMessageText(chatId, messageId, [
        `✅ <b>Course Deleted</b>`, ``,
        `<b>Code:</b> <code>${details.code || ''}</code>`,
        `<b>Title:</b> ${details.title || ''}`,
        `<b>Semester:</b> ${semLabel}`,
        `<b>Path:</b> <code>${folderPath}</code>`,
        `<b>GitHub files removed:</b> ${githubDeleted}`, ``,
        `<i>Approved by admin</i>`,
      ].join('\n'), {
        reply_markup: { inline_keyboard: pageLink ? [[{ text: `📂 Open course in web app`, url: pageLink }]] : [] },
      });
    }

    // ─── Course delete request reject ───
    if (parsed.type === 'course_del_reject') {
      const activityId = parsed.args[0];
      if (!activityId) return;

      const { prisma } = await import('@/lib/prisma');
      let logEntry: any = null;
      try {
        logEntry = await prisma.activityLog.findUnique({ where: { id: activityId } });
      } catch {}

      if (!logEntry || logEntry.action !== 'course_delete_request') {
        await editMessageText(chatId, messageId, `❌ Delete request not found or already processed.`);
        return;
      }

      const details = JSON.parse(logEntry.details || '{}');
      if (details.status !== 'pending_approval') {
        await editMessageText(chatId, messageId, `❌ This delete request was already ${details.status || 'processed'}.`);
        return;
      }

      try {
        const parsedDetails = JSON.parse(logEntry.details || '{}');
        parsedDetails.status = 'rejected';
        parsedDetails.approvedBy = `chat:${chatId}`;
        parsedDetails.resolvedAt = new Date().toISOString();
        await prisma.activityLog.update({
          where: { id: activityId },
          data: { action: 'course_delete_rejected', details: JSON.stringify(parsedDetails) },
        });
        // Clean up duplicate pending requests for the same course
        try {
          const dupes = await prisma.activityLog.findMany({ where: { action: 'course_delete_request' }, take: 50 });
          const dupeIds = dupes
            .filter((d: any) => {
              if (d.id === activityId) return false;
              const dd = JSON.parse(d.details || '{}');
              return dd.status === 'pending_approval' && dd.code === details.code && dd.semester === details.semester && dd.department === details.department;
            })
            .map((d: any) => d.id);
          if (dupeIds.length > 0) {
            await prisma.activityLog.updateMany({
              where: { id: { in: dupeIds } },
              data: { action: 'course_delete_rejected', details: JSON.stringify({ ...parsedDetails, duplicateOf: activityId }) },
            });
          }
        } catch {}
      } catch {}

      const requesterChatId = await resolveRequesterChat(logEntry.userId);
      if (requesterChatId) {
        try {
          await sendMessage(requesterChatId,
            `❌ <b>Delete rejected</b>\n\n` +
            `<b>Course:</b> <code>${details.code || ''}</code> — ${details.title || ''}\n` +
            `Your delete request was <b>rejected</b> by an admin.`
          );
        } catch {}
      }

      await editMessageText(chatId, messageId, [
        `❌ <b>Delete Rejected</b>`, ``,
        `<b>Code:</b> <code>${details.code || ''}</code>`,
        `<b>Title:</b> ${details.title || ''}`, ``,
        `<i>Rejected by admin</i>`,
      ].join('\n'));
    }

    // ─── Delete confirm ───
    if (parsed.type === 'del_confirm') {
      const courseKey = parsed.args[0];
      if (!courseKey) return;

      const [dept, sem, code] = courseKey.split('/');
      if (!dept || !sem || !code) return;

      const { prisma } = await import('@/lib/prisma');

      let course: any = null;
      try {
        course = await prisma.course.findFirst({ where: { code: code.toUpperCase(), semester: sem, department: dept } });
      } catch {}

      const courseTitle = course?.title || code.toUpperCase();
      const courseDept = course?.department || dept;
      const courseSem = course?.semester || sem;
      const courseCode = course?.code || code.toUpperCase();

      const cleanTitle = courseTitle.replace(/[\\/:*?"<>|\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim();
      const baseDir = `${config.uploadPath}/${getDepartmentFolder(courseDept)}/${courseSem}`;
      let folderPath = `${baseDir}/${courseCode} - ${cleanTitle}`;

      let githubDeleted = 0;
      try {
        const botToken = await getAppBotToken();
        if (botToken) {
          const found = await findCourseFolderPathInRepo(botToken, baseDir, courseCode);
          if (found) folderPath = found;
          const allFiles = await getAllFilesInFolder(botToken, folderPath);
          githubDeleted = await batchDeleteFiles(botToken, allFiles);
        }
      } catch (e: any) {
        console.error('Telegram del_confirm course delete failed:', e);
      }

      if (course) {
        try { await prisma.course.delete({ where: { id: course.id } }); } catch {}
      }

      const semLabel = config.semesters.find(s => s.id === courseSem)?.label || courseSem;
      const pageLink = buildBrowseLink({ dept: courseDept, sem: courseSem });
      await editMessageText(chatId, messageId, [
        `✅ <b>Course Deleted</b>`, ``,
        `<b>Code:</b> <code>${courseCode}</code>`,
        `<b>Title:</b> ${courseTitle}`,
        `<b>Folder:</b> <code>${folderPath}</code>`,
        `<b>GitHub files removed:</b> ${githubDeleted}`, ``,
        `<i>Approved by admin</i>`,
      ].join('\n'), {
        reply_markup: { inline_keyboard: [[{ text: `📂 View in ${semLabel}`, url: pageLink }]] },
      });
    }

    // ─── Delete reject ───
    if (parsed.type === 'del_reject') {
      const courseKey = parsed.args[0];
      if (!courseKey) return;

      const [dept, sem, code] = courseKey.split('/');
      const semLabel = sem ? (config.semesters.find(s => s.id === sem)?.label || sem) : '';
      const pageLink = dept && sem ? buildBrowseLink({ dept, sem }) : '';

      await editMessageText(chatId, messageId, [
        `❌ <b>Delete Rejected</b>`, ``,
        code ? `<b>Code:</b> <code>${code}</code>` : '',
        semLabel ? `<b>Semester:</b> ${semLabel}` : '', ``,
        `<i>Rejected by admin</i>`,
      ].join('\n'), {
        reply_markup: { inline_keyboard: pageLink ? [[{ text: `📂 View in ${semLabel}`, url: pageLink }]] : [] },
      });
    }

    // ─── File Delete confirm ───
    if (parsed.type === 'del_file_confirm') {
      const activityId = parsed.args[0];
      if (!activityId) return;

      const { prisma } = await import('@/lib/prisma');
      let logEntry: any = null;
      try {
        logEntry = await prisma.activityLog.findUnique({ where: { id: activityId } });
      } catch {}

      if (!logEntry || logEntry.action !== 'file_delete_request') {
        await editMessageText(chatId, messageId, `❌ Delete request not found or already processed.`);
        return;
      }

      const details = JSON.parse(logEntry.details || '{}');
      const filePath: string = details.path || '';
      if (!filePath) {
        await editMessageText(chatId, messageId, `❌ Invalid delete request — no file path found.`);
        return;
      }

      const fromFull = `${config.uploadPath}/${filePath}`;
      let githubDeleted = 0;

      try {
        const { deleteRepoEntries } = await import('@/lib/file-delete');
        githubDeleted = await deleteRepoEntries([fromFull]);
      } catch (e: any) {
        console.error('Telegram file delete failed:', e);
        const parts = filePath.split('/');
        const link = parts.length >= 2 ? buildBrowseLink({ dept: parts[0], sem: parts[1] }) : '';
        await editMessageText(chatId, messageId, `❌ <b>Delete Failed</b>\n\n<b>Path:</b> <code>${filePath}</code>\n<b>Error:</b> ${e?.message || 'Unknown error'}\n\nThe file was NOT removed from GitHub. Try from the admin panel.`, {
          reply_markup: { inline_keyboard: link ? [[{ text: '📂 Visit Directory', url: link }]] : [] },
        });
        return;
      }

      // Update activity log
      try {
        const parsedDetails = JSON.parse(logEntry.details || '{}');
        parsedDetails.status = 'approved';
        parsedDetails.approvedBy = `chat:${chatId}`;
        await prisma.activityLog.update({
          where: { id: activityId },
          data: { details: JSON.stringify(parsedDetails), action: 'file_delete_approved' },
        });
        // Clean up duplicate pending requests for the same path
        try {
          const dupes = await prisma.activityLog.findMany({ where: { action: 'file_delete_request' }, take: 50 });
          const dupeIds = dupes
            .filter((d: any) => {
              if (d.id === activityId) return false;
              const dd = JSON.parse(d.details || '{}');
              return dd.status === 'pending_approval' && dd.path === filePath;
            })
            .map((d: any) => d.id);
          if (dupeIds.length > 0) {
            await prisma.activityLog.updateMany({
              where: { id: { in: dupeIds } },
              data: { action: 'file_delete_approved', details: JSON.stringify({ ...parsedDetails, duplicateOf: activityId }) },
            });
          }
        } catch {}
      } catch {}

      const parentParts = filePath.split('/');
      const browseLink = parentParts.length >= 2 ? buildBrowseLink({ dept: parentParts[0], sem: parentParts[1] }) : '';

      await editMessageText(chatId, messageId, [
        `✅ <b>File Deleted</b>`, ``,
        `<b>Path:</b> <code>${filePath}</code>`,
        `<b>Files removed:</b> ${githubDeleted}`, ``,
        `<i>Approved by admin</i>`,
      ].join('\n'), {
        reply_markup: { inline_keyboard: [[{ text: '📂 Visit Directory', url: browseLink }]] },
      });
    }

    // ─── File Delete reject ───
    if (parsed.type === 'del_file_reject') {
      const activityId = parsed.args[0];
      if (!activityId) return;

      const { prisma } = await import('@/lib/prisma');
      let logEntry: any = null;
      try {
        logEntry = await prisma.activityLog.findUnique({ where: { id: activityId } });
      } catch {}

      const filePath = logEntry ? JSON.parse(logEntry.details || '{}').path : '';

      // Update activity log
      if (logEntry) {
        try {
          const parsedDetails = JSON.parse(logEntry.details || '{}');
          parsedDetails.status = 'rejected';
          parsedDetails.rejectedBy = `chat:${chatId}`;
          await prisma.activityLog.update({
            where: { id: activityId },
            data: { details: JSON.stringify(parsedDetails), action: 'file_delete_rejected' },
          });
          // Clean up duplicate pending requests for the same path
          try {
            const dupes = await prisma.activityLog.findMany({ where: { action: 'file_delete_request' }, take: 50 });
            const dupeIds = dupes
              .filter((d: any) => {
                if (d.id === activityId) return false;
                const dd = JSON.parse(d.details || '{}');
                return dd.status === 'pending_approval' && dd.path === filePath;
              })
              .map((d: any) => d.id);
            if (dupeIds.length > 0) {
              await prisma.activityLog.updateMany({
                where: { id: { in: dupeIds } },
                data: { action: 'file_delete_rejected', details: JSON.stringify({ ...parsedDetails, duplicateOf: activityId }) },
              });
            }
          } catch {}
        } catch {}
      }

      const parentParts = (filePath || '').split('/');
      const browseLink = parentParts.length >= 2 ? buildBrowseLink({ dept: parentParts[0], sem: parentParts[1] }) : '';

      await editMessageText(chatId, messageId, [
        `❌ <b>Delete Rejected</b>`, ``,
        filePath ? `<b>Path:</b> <code>${filePath}</code>` : '', ``,
        `<i>Rejected by admin</i>`,
      ].join('\n'), {
        reply_markup: { inline_keyboard: browseLink ? [[{ text: '📂 Visit Directory', url: browseLink }]] : [] },
      });
    }

    // ─── Broadcast confirm/cancel ───
    if (parsed.type === 'broadcast') {
      const action = parsed.args[0];
      if (action === 'cancel') {
        await editMessageText(chatId, messageId, `❌ Broadcast cancelled.`);
        return;
      }
      if (action === 'confirm') {
        const ownerChats = await resolveOwnerChatIds();
        if (!ownerChats.has(String(chatId))) {
          await editMessageText(chatId, messageId, `❌ Only the owner can broadcast.`);
          return;
        }
        const rawCallback = data.replace('broadcast:confirm:', '');
        let broadcastMsg = '';
        try {
          broadcastMsg = Buffer.from(rawCallback, 'base64').toString('utf-8');
        } catch {
          await editMessageText(chatId, messageId, `❌ Could not decode broadcast message.`);
          return;
        }
        if (!broadcastMsg) {
          await editMessageText(chatId, messageId, `❌ Empty broadcast message.`);
          return;
        }
        await editMessageText(chatId, messageId, `⏳ Broadcasting...`);
        await sendMessage(chatId, `📢 Broadcast ready. Use the admin panel to send.`);
      }
    }

    // ─── Support request callbacks ───
    if (parsed.type === 'support_accept' || parsed.type === 'support_reject' || parsed.type === 'support_reply') {
      // Get the person who clicked
      const from = cq.from;
      const clickerName = from ? (from.first_name + (from.last_name ? ' ' + from.last_name : '')) : 'Unknown';
      const clickerUsername = from?.username ? `@${from.username}` : null;
      const clickerMention = clickerUsername
        ? `<a href="https://t.me/${from.username}">${clickerName}</a>`
        : clickerName;
      const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit' });

      // Get original message text (to preserve the support request info)
      const originalText = cq.message?.text || '';

      if (parsed.type === 'support_accept') {
        await editMessageText(chatId, messageId, [
          originalText,
          ``,
          `━━━━━━━━━━━━━━━━━━━━`,
          `✅ <b>Accepted by</b> ${clickerMention}`,
          `⏰ ${now}`,
        ].join('\n'), {
          reply_markup: { inline_keyboard: [] },
        });
        // Notify the group with a clear mention so the clicker gets pinged
        const contactLine = clickerUsername
          ? `💬 Contact: <a href="https://t.me/${from.username}">Message directly</a>`
          : '';
        await sendMessage(chatId, [
          `✅ <b>${clickerMention}</b> is now handling this support request.`,
          contactLine,
          `🙏 Thank you for stepping up!`,
        ].filter(Boolean).join('\n'), {
          parse_mode: 'HTML',
          reply_to_message_id: messageId,
        });
        await answerCallbackQuery(cq.id, `✅ You accepted this request`);
        return;
      }

      if (parsed.type === 'support_reject') {
        await editMessageText(chatId, messageId, [
          originalText,
          ``,
          `━━━━━━━━━━━━━━━━━━━━`,
          `❌ <b>Rejected by</b> ${clickerMention}`,
          `⏰ ${now}`,
        ].join('\n'), {
          reply_markup: { inline_keyboard: [] },
        });
        await sendMessage(chatId, `❌ ${clickerMention} declined this request. Other members can still accept.`, {
          parse_mode: 'HTML',
          reply_to_message_id: messageId,
        });
        await answerCallbackQuery(cq.id, `❌ You rejected this request`);
        return;
      }

      if (parsed.type === 'support_reply') {
        const contactLine = clickerUsername
          ? `💬 Contact: <a href="https://t.me/${from.username}">Message directly</a>`
          : '';
        await sendMessage(chatId, [
          `💬 <b>${clickerMention}</b> is handling this request.`,
          contactLine,
          `Please reply to the original message above or contact them directly.`,
        ].filter(Boolean).join('\n'), {
          reply_to_message_id: messageId,
          parse_mode: 'HTML',
        });
        await answerCallbackQuery(cq.id, `💬 Reply to the message above`);
        return;
      }
    }
  } catch (err: any) {
    console.error('Callback query error:', err);
    await sendMessage(chatId, `⚠️ Error processing action: ${err?.message || 'Unknown'}`);
  }
}
