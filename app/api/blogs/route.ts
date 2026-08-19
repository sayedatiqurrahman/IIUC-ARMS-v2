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
  deleteBlogPostFolder,
  uploadBlogThumbnail,
  uploadBlogAsset,
  writeBlogPostMeta,
  generatePostFolderName,
  type BlogPostListItem,
  type BlogCategory,
} from '@/lib/blog';

export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action');

  // ─── Fetch post content for editor ───
  if (action === 'content') {
    const slug = req.nextUrl.searchParams.get('slug');
    if (!slug) return NextResponse.json({ error: 'Slug required' }, { status: 400 });

    const posts = await readBlogsIndex();
    const post = posts.find(p => p.slug === slug);
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

    const { readBlogContent } = await import('@/lib/blog');
    const content = await readBlogContent(post.category, post.folderName);
    return NextResponse.json({ success: true, content });
  }

  // ─── List posts ───
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
  const userName = (session.user as any)?.name || userEmail.split('@')[0];

  try {
    const contentType = req.headers.get('content-type') || '';

    // ─── FormData uploads (thumbnail or content asset) ───
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      const category = (formData.get('category') as string || 'post') as BlogCategory;
      const folderName = formData.get('folderName') as string | null;
      const isContent = formData.get('content') === '1';

      if (!file) {
        return NextResponse.json({ error: 'File required' }, { status: 400 });
      }

      const token = await getToken(userEmail);

      // Check permission for this category
      const permAction = category === 'tutorial' ? 'publishTutorial' : 'publishBlog';
      if (!(await hasPermission(permAction, effectiveRole, isCR, userEmail))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      // If folderName provided — upload directly (post already created or in progress)
      if (folderName) {
        if (isContent) {
          const url = await uploadBlogAsset(category, folderName, file, token);
          return NextResponse.json({ success: true, url });
        }
        const url = await uploadBlogThumbnail(category, folderName, file, token);
        return NextResponse.json({ success: true, url });
      }

      // No folderName — check if post exists in index (editing existing)
      const slug = formData.get('slug') as string | null;
      if (slug) {
        const posts = await readBlogsIndex();
        const post = posts.find(p => p.slug === slug);
        if (post) {
          if (isContent) {
            const url = await uploadBlogAsset(post.category, post.folderName, file, token);
            return NextResponse.json({ success: true, url });
          }
          const url = await uploadBlogThumbnail(post.category, post.folderName, file, token);
          return NextResponse.json({ success: true, url });
        }
      }

      return NextResponse.json({ error: 'Provide folderName or slug of existing post' }, { status: 400 });
    }

    // ─── JSON actions ───
    const body = await req.json();
    const { action } = body;

    // ─── CREATE ───
    if (action === 'create') {
      const { slug: clientSlug, title, category, excerpt, content, tags, thumbnailUrl, status } = body as {
        slug?: string;
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

      // Use client-provided slug so folder matches where assets were uploaded
      const slug = clientSlug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
      const now = new Date().toISOString();
      const cat = (category as BlogCategory) || 'post';

      const newPost: BlogPostListItem = {
        id: generateId(),
        slug,
        folderName: slug,
        title: title.trim(),
        category: cat,
        excerpt: (excerpt || '').trim(),
        thumbnailUrl,
        authorLogin: (session.user as any).login || '',
        authorName: userName,
        authorAvatar: (session.user as any).image || '',
        authorEmail: userEmail,
        publishedAt: now,
        tags: tags || [],
        status: status || 'published',
      };

      await writeBlogContent(cat, slug, content || '', token);
      await writeBlogPostMeta(cat, slug, {
        slug,
        folderName: slug,
        title: newPost.title,
        category: cat,
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

    // ─── UPDATE ───
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
      const cat = posts[idx].category;
      const folderName = posts[idx].folderName;

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
        await writeBlogContent(cat, folderName, content, token);
      }

      await writeBlogPostMeta(cat, folderName, {
        slug,
        folderName,
        title: posts[idx].title,
        category: cat,
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

    // ─── DELETE ───
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
      await deleteBlogPostFolder(post.category, post.folderName, token);

      const filtered = posts.filter(p => p.slug !== slug);
      await writeBlogsIndex(filtered, token, `blog: delete "${post.title}"`);

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}

function generateId(): string {
  return `blog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
