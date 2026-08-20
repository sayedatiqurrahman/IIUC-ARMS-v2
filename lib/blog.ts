import { config } from '@/lib/config';
import { getRepoBotToken } from '@/lib/github-app';
import { commitFilesToBranch } from '@/lib/github-commit';
import { prisma } from '@/lib/prisma';

const BLOGS_PATH = 'blogs';
const BLOGS_TUTORIALS_DIR = `${BLOGS_PATH}/tutorials`;
const BLOGS_POSTS_DIR = `${BLOGS_PATH}/posts`;

export type BlogCategory = 'tutorial' | 'post';

export interface BlogPost {
  id: string;
  slug: string;
  folderName: string;
  title: string;
  category: BlogCategory;
  excerpt: string;
  content: string;
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

const CATEGORY_META: Record<BlogCategory, { label: string; icon: string; color: string }> = {
  tutorial: { label: 'Tutorial', icon: 'fa-graduation-cap', color: 'text-blue-400' },
  post: { label: 'Blog Post', icon: 'fa-pen-nib', color: 'text-green-400' },
};

export { CATEGORY_META };

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function generatePostFolderName(email: string, name: string, existingCount: number): string {
  const safeEmail = email.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
  const safeName = name.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
  const now = new Date();
  const dt = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${safeEmail}_${safeName}_${dt}_${existingCount + 1}`;
}

export function getCategoryDir(category: BlogCategory): string {
  return category === 'tutorial' ? BLOGS_TUTORIALS_DIR : BLOGS_POSTS_DIR;
}

function getCategoryIndexPath(category: BlogCategory): string {
  return `${getCategoryDir(category)}/index.json`;
}

function generateId(): string {
  return `blog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Category-specific index (GitHub) ───

export async function readCategoryIndex(category: BlogCategory): Promise<BlogPostListItem[]> {
  const indexPath = getCategoryIndexPath(category);
  try {
    const rawUrl = `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.branch}/${indexPath}`;
    const res = await fetch(rawUrl, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) return data;
    }
  } catch {}

  try {
    const token = await getRepoBotToken(config.owner, config.repo) || process.env.GITHUB_TOKEN || '';
    const apiUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${indexPath}`;
    const res = await fetch(apiUrl, {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writeCategoryIndex(
  category: BlogCategory,
  posts: BlogPostListItem[],
  token: string,
  message: string,
): Promise<boolean> {
  try {
    const indexPath = getCategoryIndexPath(category);
    const apiUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`;
    const refRes = await fetch(apiUrl, { headers: { Authorization: `token ${token}` } });
    if (!refRes.ok) return false;
    const { object } = await refRes.json();

    const indexContent = JSON.stringify(posts, null, 2);
    const files = [
      { path: indexPath, content: Buffer.from(indexContent).toString('base64'), encoding: 'base64' as const },
    ];

    await commitFilesToBranch({
      token,
      owner: config.owner,
      repo: config.repo,
      branch: config.branch,
      baseSha: object.sha,
      files,
      message,
    });
    return true;
  } catch (e: any) {
    console.error('[Blog] writeCategoryIndex error:', e?.message);
    return false;
  }
}

// ─── Combined index (published from both categories) ───

export async function readBlogsIndex(): Promise<BlogPostListItem[]> {
  const tutorials = await readCategoryIndex('tutorial');
  const posts = await readCategoryIndex('post');
  return [...tutorials, ...posts];
}

// ─── Draft CRUD (DB) ───

export interface BlogDraftInput {
  id?: string;
  authorEmail: string;
  category: BlogCategory;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  tags: string[];
  thumbnailUrl?: string;
  publishedAt?: string;
  updatedAt?: string;
  createdAt?: string;
}

export async function saveBlogDraft(input: BlogDraftInput): Promise<{ id: string; isUpdate: boolean }> {
  const existing = await prisma.blogDraft.findFirst({
    where: { slug: input.slug, authorEmail: input.authorEmail },
  });

  const data = {
    authorEmail: input.authorEmail,
    category: input.category,
    slug: input.slug,
    title: input.title,
    excerpt: input.excerpt,
    content: input.content,
    tags: JSON.stringify(input.tags),
    thumbnailUrl: input.thumbnailUrl || null,
    updatedAt: new Date(),
  };

  if (existing) {
    await prisma.blogDraft.update({ where: { id: existing.id }, data });
    return { id: existing.id, isUpdate: true };
  }

  const result = await prisma.blogDraft.create({ data });
  return { id: result.id, isUpdate: false };
}

export async function getBlogDrafts(authorEmail?: string): Promise<BlogDraftInput[]> {
  const where = authorEmail ? { authorEmail } : {};
  const records = await prisma.blogDraft.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
  });

  return records.map(r => ({
    id: r.id,
    authorEmail: r.authorEmail,
    category: r.category as BlogCategory,
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    content: r.content,
    tags: JSON.parse(r.tags || '[]'),
    thumbnailUrl: r.thumbnailUrl || undefined,
    publishedAt: r.publishedAt?.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  })) as any;
}

export async function getBlogDraftBySlug(slug: string, authorEmail?: string): Promise<any> {
  const where: any = { slug };
  if (authorEmail) where.authorEmail = authorEmail;
  const record = await prisma.blogDraft.findFirst({ where });
  if (!record) return null;
  return {
    ...record,
    tags: JSON.parse(record.tags || '[]'),
  };
}

export async function deleteBlogDraft(slug: string, authorEmail: string): Promise<boolean> {
  const draft = await prisma.blogDraft.findFirst({ where: { slug, authorEmail } });
  if (!draft) return false;
  await prisma.blogDraft.delete({ where: { id: draft.id } });
  return true;
}

export async function deleteBlogDraftBySlug(slug: string): Promise<boolean> {
  const draft = await prisma.blogDraft.findFirst({ where: { slug } });
  if (!draft) return false;
  await prisma.blogDraft.delete({ where: { id: draft.id } });
  return true;
}

// ─── Content read (draft from DB, published from GitHub) ───

export async function readBlogContent(category: BlogCategory, folderName: string): Promise<string> {
  const dir = getCategoryDir(category);
  const contentPath = `${dir}/${folderName}/index.md`;
  try {
    const rawUrl = `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.branch}/${contentPath}`;
    const res = await fetch(rawUrl, { cache: 'no-store' });
    if (res.ok) return await res.text();
  } catch {}

  try {
    const token = await getRepoBotToken(config.owner, config.repo) || process.env.GITHUB_TOKEN || '';
    const apiUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${contentPath}`;
    const res = await fetch(apiUrl, {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) return '';
    const data = await res.json();
    return Buffer.from(data.content, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

export async function readDraftContent(slug: string, authorEmail: string): Promise<string> {
  const draft = await prisma.blogDraft.findFirst({ where: { slug, authorEmail } });
  return draft?.content || '';
}

// ─── GitHub file operations (published posts) ───

async function uploadToGitHub(filePath: string, file: File, token: string, message: string): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');

  const apiUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${filePath}`;
  let existingSha = '';
  try {
    const checkRes = await fetch(apiUrl, { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' } });
    if (checkRes.ok) {
      const existing = await checkRes.json();
      existingSha = existing.sha || '';
    }
  } catch {}

  const body: any = {
    message,
    content: base64,
    branch: config.branch,
  };
  if (existingSha) body.sha = existingSha;

  const res = await fetch(apiUrl, {
    method: 'PUT',
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to upload ${filePath}`);

  return `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.branch}/${filePath}`;
}

export async function uploadBlogThumbnail(
  category: BlogCategory,
  folderName: string,
  file: File,
  token: string,
): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  const dir = getCategoryDir(category);
  const filePath = `${dir}/${folderName}/thumbnail.${ext}`;
  return uploadToGitHub(filePath, file, token, `Blog thumbnail: ${folderName}`);
}

export async function uploadBlogAsset(
  category: BlogCategory,
  folderName: string,
  file: File,
  token: string,
): Promise<string> {
  const fileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const uniqueName = `${Date.now()}-${fileName}`;
  const dir = getCategoryDir(category);
  const filePath = `${dir}/${folderName}/assets/${uniqueName}`;
  return uploadToGitHub(filePath, file, token, `Blog asset: ${folderName}/${uniqueName}`);
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
  scheduledAt?: string;
}

export async function writeBlogPostMeta(
  category: BlogCategory,
  folderName: string,
  meta: BlogPostMeta,
  token: string,
): Promise<void> {
  const dir = getCategoryDir(category);
  const metaPath = `${dir}/${folderName}/meta.json`;
  const content = JSON.stringify(meta, null, 2);
  const contentBase64 = Buffer.from(content).toString('base64');

  const apiUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${metaPath}`;
  let existingSha = '';
  try {
    const checkRes = await fetch(apiUrl, { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' } });
    if (checkRes.ok) {
      const existing = await checkRes.json();
      existingSha = existing.sha || '';
    }
  } catch {}

  const body: any = {
    message: `Blog meta: ${folderName}`,
    content: contentBase64,
    branch: config.branch,
  };
  if (existingSha) body.sha = existingSha;

  await fetch(apiUrl, {
    method: 'PUT',
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function writeBlogContent(
  category: BlogCategory,
  folderName: string,
  markdown: string,
  token: string,
): Promise<void> {
  const dir = getCategoryDir(category);
  const contentPath = `${dir}/${folderName}/index.md`;
  const contentBase64 = Buffer.from(markdown).toString('base64');

  const apiUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${contentPath}`;
  let existingSha = '';
  try {
    const checkRes = await fetch(apiUrl, { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' } });
    if (checkRes.ok) {
      const existing = await checkRes.json();
      existingSha = existing.sha || '';
    }
  } catch {}

  const body: any = {
    message: `Blog content: ${folderName}`,
    content: contentBase64,
    branch: config.branch,
  };
  if (existingSha) body.sha = existingSha;

  const res = await fetch(apiUrl, {
    method: 'PUT',
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to write blog content: ${err.message || res.status}`);
  }
}

export async function deleteBlogFile(filePath: string, token: string, message: string): Promise<boolean> {
  try {
    const apiUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${filePath}`;
    const checkRes = await fetch(apiUrl, { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' } });
    if (!checkRes.ok) return false;
    const existing = await checkRes.json();

    const res = await fetch(apiUrl, {
      method: 'DELETE',
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sha: existing.sha, branch: config.branch }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteBlogPostFolder(category: BlogCategory, folderName: string, token: string): Promise<void> {
  try {
    const dir = getCategoryDir(category);
    const dirPath = `${dir}/${folderName}`;
    const apiUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${dirPath}`;
    const res = await fetch(apiUrl, {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
    });
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
            for (const sub of subItems) {
              await deleteBlogFile(sub.path, token, `Blog cleanup: ${sub.path}`);
            }
          }
        }
      }
      await deleteBlogFile(item.path, token, `Blog cleanup: ${item.path}`);
    }
  } catch {}
}
