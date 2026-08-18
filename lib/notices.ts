import { config } from './config';
import { commitFilesToBranch } from './github-commit';

const GITHUB_API = 'https://api.github.com';
const NOTICES_PATH = 'notices';
const NOTICES_INDEX = `${NOTICES_PATH}/notices.json`;

export type NoticeCategory = 'notice' | 'academic-calendar' | 'bus-schedule';

export interface Notice {
  id: string;
  title: string;
  description: string;
  category: NoticeCategory;
  date: string;           // ISO date string
  pinned: boolean;
  attachmentUrl?: string;  // GitHub raw URL to PDF/image/doc
  attachmentName?: string; // original filename
  link?: string;           // external URL link
  publishedBy: string;
  publishedByName?: string;
  publishedAt: string;     // ISO datetime
  expiresAt?: string;      // ISO datetime — auto-delete after this date
  scheduledAt?: string;    // ISO datetime — auto-publish at this time
  status?: 'published' | 'scheduled'; // publish status
  telegramTargets?: ('channel' | 'group' | 'personal')[]; // where to forward
}

export const CATEGORY_META: Record<NoticeCategory, { label: string; icon: string; color: string; bg: string }> = {
  'notice':            { label: 'Notice',            icon: 'fas fa-bullhorn',          color: 'text-amber-400',  bg: 'bg-amber-500/15' },
  'academic-calendar': { label: 'Academic Calendar', icon: 'fas fa-calendar-days',     color: 'text-blue-400',   bg: 'bg-blue-500/15' },
  'bus-schedule':      { label: 'Bus Schedule',      icon: 'fas fa-bus',               color: 'text-green-400',  bg: 'bg-green-500/15' },
};

function ghHeaders(token: string) {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

/** Read notices.json from GitHub (raw first, then contents API fallback). */
export async function readNoticesIndex(): Promise<Notice[]> {
  const owner = config.owner;
  const repo = config.repo;
  const branch = config.branch;

  // Try raw first
  try {
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${NOTICES_INDEX}`;
    const res = await fetch(rawUrl, { cache: 'no-store' });
    if (res.ok) {
      const text = await res.text();
      const data = JSON.parse(text);
      return Array.isArray(data) ? data : [];
    }
  } catch {}

  // Fallback: Contents API
  try {
    const token = await getNoticesToken();
    if (!token) return [];
    const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${NOTICES_INDEX}?ref=${branch}`;
    const res = await fetch(url, { headers: ghHeaders(token) });
    if (!res.ok) return [];
    const meta = await res.json();
    const content = Buffer.from(meta.content, 'base64').toString('utf8');
    const data = JSON.parse(content);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Write notices.json to GitHub via atomic commit. */
export async function writeNoticesIndex(
  notices: Notice[],
  token: string,
  message: string,
  author?: { name: string; email: string },
): Promise<string> {
  const owner = config.owner;
  const repo = config.repo;
  const branch = config.branch;

  // Get current ref
  const refRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
    headers: ghHeaders(token),
  });
  if (!refRes.ok) throw new Error('Failed to read ref');
  const refData = await refRes.json();
  const baseSha = refData.object.sha;

  const jsonContent = Buffer.from(JSON.stringify(notices, null, 2)).toString('base64');
  const files = [{ path: NOTICES_INDEX, content: jsonContent }];

  return commitFilesToBranch({
    token, owner, repo, branch, baseSha, files, message, author,
  });
}

/** Upload an attachment file to GitHub and return the raw URL. */
export async function uploadNoticeAttachment(
  fileBase64: string,
  fileName: string,
  token: string,
  author?: { name: string; email: string },
): Promise<string> {
  const owner = config.owner;
  const repo = config.repo;
  const branch = config.branch;

  // Rename to: notice-{name}-{year}.{ext}
  const ext = fileName.includes('.') ? fileName.split('.').pop() || 'pdf' : 'pdf';
  const baseName = fileName.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  const year = new Date().getFullYear();
  const renamed = `notice-${baseName}-${year}.${ext}`;
  const filePath = `${NOTICES_PATH}/attachments/${renamed}`;

  // Get current ref
  const refRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
    headers: ghHeaders(token),
  });
  if (!refRes.ok) throw new Error('Failed to read ref');
  const refData = await refRes.json();
  const baseSha = refData.object.sha;

  const files = [{ path: filePath, content: fileBase64 }];
  await commitFilesToBranch({
    token, owner, repo, branch, baseSha, files,
    message: `notice: add attachment ${renamed}`,
    author,
  });

  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
}

async function getNoticesToken(): Promise<string | null> {
  try {
    const { getRepoBotToken } = await import('./github-app');
    const token = await getRepoBotToken(config.owner, config.repo);
    if (token) return token;
  } catch {}
  return process.env.GITHUB_TOKEN || null;
}

/** Check if a notice has expired based on its expiresAt field. */
export function isNoticeExpired(notice: Notice): boolean {
  if (!notice.expiresAt) return false;
  return new Date(notice.expiresAt) < new Date();
}

/** Remove expired notices from the index. Returns the number removed. */
export async function removeExpiredNotices(
  token: string,
  author?: { name: string; email: string },
): Promise<number> {
  const notices = await readNoticesIndex();
  const before = notices.length;
  const alive = notices.filter(n => !isNoticeExpired(n));
  const removed = before - alive.length;
  if (removed > 0) {
    await writeNoticesIndex(alive, token, `notice: auto-delete ${removed} expired notice(s)`, author);
  }
  return removed;
}
