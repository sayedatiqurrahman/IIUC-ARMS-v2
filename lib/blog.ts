import { config } from '@/lib/config';
import { getRepoBotToken } from '@/lib/github-app';
import { commitFilesToBranch } from '@/lib/github-commit';

const BLOGS_PATH = 'blogs';
const BLOGS_INDEX = `${BLOGS_PATH}/index.json`;
const BLOGS_CONTENT_DIR = `${BLOGS_PATH}/posts`;
const BLOGS_THUMBNAILS_DIR = `${BLOGS_PATH}/thumbnails`;

export type BlogCategory = 'tutorial' | 'post';

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  category: BlogCategory;
  excerpt: string;
  content: string;
  thumbnailUrl?: string;
  authorLogin: string;
  authorName: string;
  authorAvatar: string;
  publishedAt: string;
  updatedAt?: string;
  tags: string[];
  status: 'published' | 'draft';
}

export interface BlogPostListItem {
  id: string;
  slug: string;
  title: string;
  category: BlogCategory;
  excerpt: string;
  thumbnailUrl?: string;
  authorLogin: string;
  authorName: string;
  authorAvatar: string;
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

function generateId(): string {
  return `blog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function readBlogsIndex(): Promise<BlogPostListItem[]> {
  try {
    const rawUrl = `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.branch}/${BLOGS_INDEX}`;
    const res = await fetch(rawUrl, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) return data;
    }
  } catch {}

  try {
    const token = await getRepoBotToken(config.owner, config.repo) || process.env.GITHUB_TOKEN || '';
    const apiUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${BLOGS_INDEX}`;
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

export async function readBlogContent(slug: string): Promise<string> {
  const contentPath = `${BLOGS_CONTENT_DIR}/${slug}.md`;
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

export async function writeBlogsIndex(
  posts: BlogPostListItem[],
  token: string,
  message: string,
): Promise<boolean> {
  try {
    const apiUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`;
    const refRes = await fetch(apiUrl, { headers: { Authorization: `token ${token}` } });
    if (!refRes.ok) return false;
    const { object } = await refRes.json();

    const indexContent = JSON.stringify(posts, null, 2);
    const files = [
      { path: BLOGS_INDEX, content: Buffer.from(indexContent).toString('base64'), encoding: 'base64' as const },
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
    console.error('[Blog] writeBlogsIndex error:', e?.message);
    return false;
  }
}

export async function writeBlogContent(
  slug: string,
  markdown: string,
  token: string,
): Promise<void> {
  const contentPath = `${BLOGS_CONTENT_DIR}/${slug}.md`;
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
    message: `Blog: ${slug}`,
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

export async function uploadBlogThumbnail(
  slug: string,
  file: File,
  token: string,
): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  const filePath = `${BLOGS_THUMBNAILS_DIR}/${slug}.${ext}`;
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
    message: `Blog thumbnail: ${slug}`,
    content: base64,
    branch: config.branch,
  };
  if (existingSha) body.sha = existingSha;

  const res = await fetch(apiUrl, {
    method: 'PUT',
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Failed to upload thumbnail');

  return `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.branch}/${filePath}`;
}
