import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { config } from '@/lib/config';
import { prisma } from '@/lib/prisma';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { hasPermission } from '@/lib/permissions';
import {
  readBlogsIndex,
  writeBlogsIndex,
  writeBlogContent,
  deleteBlogFile,
  deleteBlogPostFolder,
  uploadBlogThumbnail,
  uploadBlogAsset,
  writeBlogPostMeta,
  slugify,
  type BlogPostListItem,
  type BlogCategory,
} from '@/lib/blog';

export async function GET(req: NextRequest) {
  let posts = await readBlogsIndex();

  const category = req.nextUrl.searchParams.get('category');
  if (category && (category === 'tutorial' || category === 'post')) {
    posts = posts.filter(p => p.category === category);
  }

  let isAdmin = false;
  try {
    const session = await getServerSession(authOptions);
    const effectiveRole = (session?.user as any)?.role || 'user';
    isAdmin = effectiveRole === 'admin';
  } catch {}

  if (!isAdmin) {
    posts = posts.filter(p => p.status === 'published');
  }

  return NextResponse.json({ success: true, posts });
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const effectiveRole = (session.user as any)?.role || 'user';
  const isCR = !!(session.user as any)?.isCR;
  const userEmail = session.user?.email || '';

  try {
    const contentType = req.headers.get('content-type') || '';

    // Handle FormData uploads (thumbnail or content asset)
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      const slug = formData.get('slug') as string | null;
      const action = formData.get('action') as string | null;
      const isContent = formData.get('content') === '1';

      if (!file || !slug) {
        return NextResponse.json({ error: 'File and slug required' }, { status: 400 });
      }

      const posts = await readBlogsIndex();
      const post = posts.find(p => p.slug === slug);
      if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

      const permAction = post.category === 'tutorial' ? 'publishTutorial' : 'publishBlog';
      if (!(await hasPermission(permAction, effectiveRole, isCR, userEmail))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const token = await getToken(userEmail);

      // Content images go to assets/, thumbnails go to thumbnail.{ext}
      if (isContent || action === 'upload-asset') {
        const url = await uploadBlogAsset(slug, file, token);
        return NextResponse.json({ success: true, url });
      }

      const url = await uploadBlogThumbnail(slug, file, token);
      return NextResponse.json({ success: true, url });
    }

    // Handle JSON actions
    const body = await req.json();
    const { action } = body;

    if (action === 'create') {
      const { title, category, excerpt, content, tags, thumbnailUrl, status } = body as {
        title: string;
        category?: BlogCategory;
        excerpt?: string;
        content?: string;
        tags?: string[];
        thumbnailUrl?: string;
        status?: 'published' | 'draft';
      };
      if (!title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 });

      const permAction = category === 'tutorial' ? 'publishTutorial' : 'publishBlog';
      if (!(await hasPermission(permAction, effectiveRole, isCR, userEmail))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const token = await getToken(userEmail);
      const posts = await readBlogsIndex();
      const slug = slugify(title);
      const now = new Date().toISOString();

      const newPost: BlogPostListItem = {
        id: `blog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        slug,
        title: title.trim(),
        category: (category as BlogCategory) || 'post',
        excerpt: (excerpt || '').trim(),
        thumbnailUrl,
        authorLogin: (session.user as any).login || '',
        authorName: (session.user as any).name || userEmail.split('@')[0],
        authorAvatar: (session.user as any).image || '',
        publishedAt: now,
        tags: tags || [],
        status: status || 'published',
      };

      await writeBlogContent(slug, content || '', token);
      await writeBlogPostMeta(slug, {
        slug,
        title: newPost.title,
        category: newPost.category,
        excerpt: newPost.excerpt,
        tags: newPost.tags,
        status: newPost.status,
        thumbnailUrl: newPost.thumbnailUrl,
        authorLogin: newPost.authorLogin,
        authorName: newPost.authorName,
        authorAvatar: newPost.authorAvatar,
        authorEmail: userEmail,
        publishedAt: now,
      }, token);
      posts.unshift(newPost);
      await writeBlogsIndex(posts, token, `blog: publish "${newPost.title}"`);

      return NextResponse.json({ success: true, post: newPost });
    }

    if (action === 'update') {
      const { slug, title, excerpt, content, tags, thumbnailUrl, status } = body as {
        slug: string;
        title?: string;
        excerpt?: string;
        content?: string;
        tags?: string[];
        thumbnailUrl?: string;
        status?: 'published' | 'draft';
      };
      if (!slug) return NextResponse.json({ error: 'Slug required' }, { status: 400 });

      const posts = await readBlogsIndex();
      const idx = posts.findIndex(p => p.slug === slug);
      if (idx === -1) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

      const permAction = posts[idx].category === 'tutorial' ? 'publishTutorial' : 'publishBlog';
      if (!(await hasPermission(permAction, effectiveRole, isCR, userEmail))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const token = await getToken(userEmail);
      const updatedAt = new Date().toISOString();

      posts[idx] = {
        ...posts[idx],
        title: title?.trim() || posts[idx].title,
        excerpt: excerpt?.trim() ?? posts[idx].excerpt,
        thumbnailUrl: thumbnailUrl ?? posts[idx].thumbnailUrl,
        tags: tags ?? posts[idx].tags,
        status: status || posts[idx].status,
        updatedAt,
      };

      if (content !== undefined) {
        await writeBlogContent(slug, content, token);
      }

      await writeBlogPostMeta(slug, {
        slug,
        title: posts[idx].title,
        category: posts[idx].category,
        excerpt: posts[idx].excerpt,
        tags: posts[idx].tags,
        status: posts[idx].status,
        thumbnailUrl: posts[idx].thumbnailUrl,
        authorLogin: posts[idx].authorLogin,
        authorName: posts[idx].authorName,
        authorAvatar: posts[idx].authorAvatar,
        authorEmail: userEmail,
        publishedAt: posts[idx].publishedAt,
        updatedAt,
      }, token);

      await writeBlogsIndex(posts, token, `blog: update "${posts[idx].title}"`);
      return NextResponse.json({ success: true, post: posts[idx] });
    }

    if (action === 'delete') {
      const { slug } = body as { slug: string };
      if (!slug) return NextResponse.json({ error: 'Slug required' }, { status: 400 });

      const posts = await readBlogsIndex();
      const post = posts.find(p => p.slug === slug);
      if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

      const permAction = post.category === 'tutorial' ? 'publishTutorial' : 'publishBlog';
      if (!(await hasPermission(permAction, effectiveRole, isCR, userEmail))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const token = await getToken(userEmail);

      // Delete entire post folder (index.md + thumbnail + meta.json + assets/)
      await deleteBlogPostFolder(slug, token);

      const filtered = posts.filter(p => p.slug !== slug);
      await writeBlogsIndex(filtered, token, `blog: delete "${post.title}"`);

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}

async function getToken(email: string): Promise<string> {
  try {
    const { getRepoBotToken } = await import('@/lib/github-app');
    const bot = await getRepoBotToken(config.owner, config.repo);
    if (bot) return bot;
  } catch {}
  const profile = await prisma.profile.findUnique({ where: { userId: email } });
  if (profile?.githubToken) return profile.githubToken;
  return process.env.GITHUB_TOKEN || '';
}
