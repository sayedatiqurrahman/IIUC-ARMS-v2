import { config } from '@/lib/config';

const BLOGS_PATH = 'blogs';
const BLOGS_TUTORIALS_DIR = `${BLOGS_PATH}/tutorials`;
const BLOGS_POSTS_DIR = `${BLOGS_PATH}/posts`;

export type BlogCategory = 'tutorial' | 'post';

export interface BlogPostListItem {
  id: string;
  slug: string;
  folderName: string;
  title: string;
  category: BlogCategory;
  excerpt: string;
  thumbnailUrl?: string;
  authorLogin: string;
  authorName: string;
  authorAvatar: string;
  authorEmail: string;
  publishedAt: string;
  updatedAt?: string;
  tags: string[];
  status: 'published' | 'draft';
}

export interface BlogPostMeta {
  slug: string;
  folderName: string;
  title: string;
  category: BlogCategory;
  excerpt: string;
  tags: string[];
  status: 'published' | 'draft';
  thumbnailUrl?: string;
  authorLogin: string;
  authorName: string;
  authorAvatar: string;
  authorEmail: string;
  publishedAt: string;
  updatedAt?: string;
}

const CATEGORY_META: Record<BlogCategory, { label: string; icon: string; color: string }> = {
  tutorial: { label: 'Tutorial', icon: 'fa-graduation-cap', color: 'text-blue-400' },
  post: { label: 'Blog Post', icon: 'fa-pen-nib', color: 'text-green-400' },
};

export { CATEGORY_META };

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

export function getCategoryDir(category: BlogCategory): string {
  return category === 'tutorial' ? BLOGS_TUTORIALS_DIR : BLOGS_POSTS_DIR;
}

function getCategoryIndexPath(category: BlogCategory): string {
  return `${getCategoryDir(category)}/index.json`;
}

export async function getToken(email: string): Promise<string> {
  // User's personal access token takes priority so commits are attributed
  // to the publisher and blog/tutorial work counts as their data contributions.
  const { prisma } = await import('@/lib/prisma');
  const profile = await prisma.profile.findUnique({ where: { userId: email } });
  if (profile?.githubToken) return profile.githubToken;
  // Fall back to bot token when the user has no personal token.
  try {
    const { getRepoBotToken } = await import('@/lib/github-app');
    const bot = await getRepoBotToken(config.owner, config.repo);
    if (bot) return bot;
  } catch {}
  return process.env.GITHUB_TOKEN || '';
}

// ─── GitHub fetch helpers ───

export async function fetchRawContent(path: string): Promise<string | null> {
  try {
    const rawUrl = `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.branch}/${path}`;
    const res = await fetch(rawUrl, { cache: 'no-store' });
    if (res.ok) return res.text();
  } catch {}
  return null;
}

export async function fetchJsonFromRepo(path: string): Promise<any> {
  const raw = await fetchRawContent(path);
  if (raw) { try { return JSON.parse(raw); } catch {} }
  return null;
}

export async function ghGetFileSha(filePath: string, token: string): Promise<string | null> {
  const apiUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${filePath}`;
  const res = await fetch(apiUrl, {
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.sha || null;
}

export async function ghPutFile(filePath: string, content: string, token: string, message: string): Promise<void> {
  const contentBase64 = Buffer.from(content).toString('base64');
  const apiUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${filePath}`;
  const body: any = { message, content: contentBase64, branch: config.branch };
  const existingSha = await ghGetFileSha(filePath, token);
  if (existingSha) body.sha = existingSha;
  const res = await fetch(apiUrl, {
    method: 'PUT',
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to write ${filePath}`);
}

export async function ghPutFileBinary(filePath: string, file: File, token: string, message: string): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  const apiUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${filePath}`;
  const body: any = { message, content: base64, branch: config.branch };
  const existingSha = await ghGetFileSha(filePath, token);
  if (existingSha) body.sha = existingSha;
  const res = await fetch(apiUrl, {
    method: 'PUT',
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to upload ${filePath}`);
  return `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.branch}/${filePath}`;
}

export async function ghDeleteFile(filePath: string, token: string, message: string): Promise<boolean> {
  try {
    const sha = await ghGetFileSha(filePath, token);
    if (!sha) return false;
    const apiUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${filePath}`;
    const res = await fetch(apiUrl, {
      method: 'DELETE',
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sha, branch: config.branch }),
    });
    return res.ok;
  } catch { return false; }
}

// ─── Category index (published posts) ───

export async function readCategoryIndex(category: BlogCategory): Promise<BlogPostListItem[]> {
  const data = await fetchJsonFromRepo(getCategoryIndexPath(category));
  return Array.isArray(data) ? data : [];
}

export async function writeCategoryIndex(category: BlogCategory, posts: BlogPostListItem[], token: string, message: string): Promise<void> {
  const { commitFilesToBranch } = await import('@/lib/github-commit');
  const refRes = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`, {
    headers: { Authorization: `token ${token}` },
  });
  if (!refRes.ok) throw new Error(`Failed to read branch ref: ${refRes.status}`);
  const { object } = await refRes.json();
  await commitFilesToBranch({
    token, owner: config.owner, repo: config.repo, branch: config.branch,
    baseSha: object.sha,
    files: [{ path: getCategoryIndexPath(category), content: Buffer.from(JSON.stringify(posts, null, 2)).toString('base64') }],
    message,
  });
}

export async function readBlogsIndex(): Promise<BlogPostListItem[]> {
  const tutorials = await readCategoryIndex('tutorial');
  const posts = await readCategoryIndex('post');
  return [...tutorials, ...posts];
}

// ─── Thumbnail / Asset uploads (published) ───

export async function uploadBlogThumbnail(category: BlogCategory, folderName: string, file: File, token: string): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  return ghPutFileBinary(`${getCategoryDir(category)}/${folderName}/thumbnail.${ext}`, file, token, `Blog thumbnail: ${folderName}`);
}

export async function uploadBlogAsset(category: BlogCategory, folderName: string, file: File, token: string): Promise<string> {
  const fileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const uniqueName = `${Date.now()}-${fileName}`;
  return ghPutFileBinary(`${getCategoryDir(category)}/${folderName}/assets/${uniqueName}`, file, token, `Blog asset: ${folderName}/${uniqueName}`);
}

// ─── Published post content/meta ───

export async function writeBlogContent(category: BlogCategory, folderName: string, markdown: string, token: string): Promise<void> {
  await ghPutFile(`${getCategoryDir(category)}/${folderName}/index.md`, markdown, token, `Blog content: ${folderName}`);
}

export async function writeBlogPostMeta(category: BlogCategory, folderName: string, meta: BlogPostMeta, token: string): Promise<void> {
  await ghPutFile(`${getCategoryDir(category)}/${folderName}/meta.json`, JSON.stringify(meta, null, 2), token, `Blog meta: ${folderName}`);
}

export async function readBlogContent(category: BlogCategory, folderName: string): Promise<string> {
  const content = await fetchRawContent(`${getCategoryDir(category)}/${folderName}/index.md`);
  return content || '';
}

// ─── Delete helpers ───

export async function ghDeleteDir(dirPath: string, token: string, prefix: string): Promise<void> {
  const apiUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${dirPath}`;
  const res = await fetch(apiUrl, { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' } });
  if (!res.ok) return;
  const items = await res.json();
  if (!Array.isArray(items)) return;
  for (const item of items) {
    if (item.type === 'dir') {
      const subRes = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}/contents/${item.path}`, {
        headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
      });
      if (subRes.ok) {
        const subItems = await subRes.json();
        if (Array.isArray(subItems)) {
          for (const sub of subItems) await ghDeleteFile(sub.path, token, `${prefix}: ${sub.path}`);
        }
      }
    }
    await ghDeleteFile(item.path, token, `${prefix}: ${item.path}`);
  }
}

export async function deleteBlogPostFolder(category: BlogCategory, folderName: string, token: string): Promise<void> {
  await ghDeleteDir(`${getCategoryDir(category)}/${folderName}`, token, 'Blog cleanup');
}
