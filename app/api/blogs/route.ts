import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { config } from '@/lib/config';
import { prisma } from '@/lib/prisma';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { hasPermission } from '@/lib/permissions';
import {
  readCategoryIndex,
  readBlogsIndex,
  writeCategoryIndex,
  writeBlogContent,
  deleteBlogPostFolder,
  uploadBlogThumbnail,
  uploadBlogAsset,
  writeBlogPostMeta,
  generatePostFolderName,
  saveBlogDraft,
  getBlogDrafts,
  getBlogDraftBySlug,
  deleteBlogDraft,
  deleteBlogDraftBySlug,
  readDraftContent,
  type BlogPostListItem,
  type BlogCategory,
} from '@/lib/blog';

export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action');

  // ─── Fetch content for editor (draft from DB or published from GitHub) ───
  if (action === 'content') {
    const slug = req.nextUrl.searchParams.get('slug');
    if (!slug) return NextResponse.json({ error: 'Slug required' }, { status: 400 });

    const session = await getServerSession(authOptions);
    const userEmail = session?.user?.email || '';

    // Check published posts first
    const publishedPosts = await readBlogsIndex();
    const publishedPost = publishedPosts.find(p => p.slug === slug);
    if (publishedPost) {
      const { readBlogContent } = await import('@/lib/blog');
      const content = await readBlogContent(publishedPost.category, publishedPost.folderName);
      return NextResponse.json({ success: true, content, status: 'published' });
    }

    // Check drafts (only own drafts)
    if (userEmail) {
      const draft = await getBlogDraftBySlug(slug, userEmail);
      if (draft) {
        return NextResponse.json({ success: true, content: draft.content, status: 'draft' });
      }
    }

    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  // ─── List posts ───
  const category = req.nextUrl.searchParams.get('category');
  const session = await getServerSession(authOptions);
  const userEmail = session?.user?.email || '';
  const effectiveRole = (session?.user as any)?.role || 'user';
  const isCR = !!(session?.user as any)?.isCR;

  // Published posts from GitHub (per-category indexes)
  let publishedPosts: BlogPostListItem[] = [];
  if (category && (category === 'tutorial' || category === 'post')) {
    publishedPosts = await readCategoryIndex(category as BlogCategory);
  } else {
    publishedPosts = await readBlogsIndex();
  }
  publishedPosts = publishedPosts.filter(p => p.status === 'published');

  // Drafts from DB
  const isAdmin = effectiveRole === 'admin' || effectiveRole === 'manager';
  let drafts: BlogPostListItem[] = [];
  if (userEmail) {
    const rawDrafts = await getBlogDrafts(isAdmin ? undefined : userEmail);
    drafts = rawDrafts.map(d => ({
      id: d.id || `draft-${d.slug}`,
      slug: d.slug,
      folderName: d.slug,
      title: d.title,
      category: d.category,
      excerpt: d.excerpt || '',
      thumbnailUrl: d.thumbnailUrl,
      authorLogin: '',
      authorName: d.authorEmail.split('@')[0],
      authorAvatar: '',
      authorEmail: d.authorEmail,
      publishedAt: d.publishedAt || d.createdAt || new Date().toISOString(),
      tags: d.tags || [],
      status: 'draft' as const,
    }));

    if (category && (category === 'tutorial' || category === 'post')) {
      drafts = drafts.filter(d => d.category === category);
    }
  }

  // Non-admins only see their own drafts
  if (!isAdmin) {
    drafts = drafts.filter(d => d.authorEmail === userEmail);
  }

  // Merge: drafts first, then published
  const allPosts = [...drafts, ...publishedPosts];

  return NextResponse.json({ success: true, posts: allPosts });
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

    // ─── FormData uploads (thumbnail or content asset) — only for published posts ───
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

      const permAction = category === 'tutorial' ? 'publishTutorial' : 'publishBlog';
      if (!(await hasPermission(permAction, effectiveRole, isCR, userEmail))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      if (folderName) {
        if (isContent) {
          const url = await uploadBlogAsset(category, folderName, file, token);
          return NextResponse.json({ success: true, url });
        }
        const url = await uploadBlogThumbnail(category, folderName, file, token);
        return NextResponse.json({ success: true, url });
      }

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

    // ─── SAVE DRAFT (any logged-in user) ───
    if (action === 'saveDraft') {
      const { slug: clientSlug, title, category, excerpt, content, tags, thumbnailUrl } = body as {
        slug?: string;
        title: string;
        category?: BlogCategory;
        excerpt?: string;
        content?: string;
        tags?: string[];
        thumbnailUrl?: string;
      };
      if (!title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 });

      const slug = clientSlug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
      const cat = (category as BlogCategory) || 'post';

      const result = await saveBlogDraft({
        authorEmail: userEmail,
        category: cat,
        slug,
        title: title.trim(),
        excerpt: (excerpt || '').trim(),
        content: content || '',
        tags: tags || [],
        thumbnailUrl,
      });

      return NextResponse.json({ success: true, draft: result, slug });
    }

    // ─── CREATE (published — requires permission) ───
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

      const cat = (category as BlogCategory) || 'post';
      const finalStatus = status || 'published';

      // If saving as draft, use saveDraft instead (no permission needed)
      if (finalStatus === 'draft') {
        const slug = clientSlug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
        const result = await saveBlogDraft({
          authorEmail: userEmail,
          category: cat,
          slug,
          title: title.trim(),
          excerpt: (excerpt || '').trim(),
          content: content || '',
          tags: tags || [],
          thumbnailUrl,
        });
        return NextResponse.json({ success: true, draft: result, slug });
      }

      // Publishing requires permission
      const permAction = cat === 'tutorial' ? 'publishTutorial' : 'publishBlog';
      if (!(await hasPermission(permAction, effectiveRole, isCR, userEmail))) {
        return NextResponse.json({ error: 'You do not have permission to publish. Save as draft instead.' }, { status: 403 });
      }

      const token = await getToken(userEmail);
      const slug = clientSlug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
      const now = new Date().toISOString();

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
        status: 'published',
      };

      await writeBlogContent(cat, slug, content || '', token);
      await writeBlogPostMeta(cat, slug, {
        slug,
        folderName: slug,
        title: newPost.title,
        category: cat,
        excerpt: newPost.excerpt,
        tags: newPost.tags,
        status: 'published',
        thumbnailUrl: newPost.thumbnailUrl,
        authorLogin: newPost.authorLogin,
        authorName: newPost.authorName,
        authorAvatar: newPost.authorAvatar,
        authorEmail: userEmail,
        publishedAt: now,
      }, token);

      const existingIndex = await readCategoryIndex(cat);
      existingIndex.unshift(newPost);
      await writeCategoryIndex(cat, existingIndex, token, `blog: publish "${newPost.title}"`);

      // Delete draft if it existed
      await deleteBlogDraftBySlug(slug);

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

      // Check if this is a draft in DB
      const draft = await getBlogDraftBySlug(slug, userEmail);

      if (draft) {
        // Updating a draft — just save to DB (any owner)
        const result = await saveBlogDraft({
          authorEmail: draft.authorEmail,
          category: (draft.category as BlogCategory) || 'post',
          slug: draft.slug,
          title: title?.trim() || draft.title,
          excerpt: (excerpt?.trim() ?? draft.excerpt) || '',
          content: content !== undefined ? content : draft.content,
          tags: tags ?? JSON.parse(draft.tags || '[]'),
          thumbnailUrl: thumbnailUrl ?? draft.thumbnailUrl ?? undefined,
        });
        return NextResponse.json({ success: true, draft: result });
      }

      // Updating a published post on GitHub — requires permission
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

      await writeCategoryIndex(cat, posts, token, `blog: update "${posts[idx].title}"`);
      return NextResponse.json({ success: true, post: posts[idx] });
    }

    // ─── PUBLISH DRAFT (draft → GitHub) ───
    if (action === 'publishDraft') {
      const { slug } = body as { slug: string };
      if (!slug) return NextResponse.json({ error: 'Slug required' }, { status: 400 });

      const permAction = body.category === 'tutorial' ? 'publishTutorial' : 'publishBlog';
      if (!(await hasPermission(permAction, effectiveRole, isCR, userEmail))) {
        return NextResponse.json({ error: 'You do not have permission to publish.' }, { status: 403 });
      }

      const draft = await getBlogDraftBySlug(slug);
      if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });

      const token = await getToken(userEmail);
      const cat = (draft.category as BlogCategory) || 'post';
      const now = new Date().toISOString();

      const newPost: BlogPostListItem = {
        id: generateId(),
        slug: draft.slug,
        folderName: draft.slug,
        title: draft.title,
        category: cat,
        excerpt: draft.excerpt || '',
        thumbnailUrl: draft.thumbnailUrl || undefined,
        authorLogin: (session.user as any).login || '',
        authorName: userName,
        authorAvatar: (session.user as any).image || '',
        authorEmail: draft.authorEmail,
        publishedAt: now,
        tags: JSON.parse(draft.tags || '[]'),
        status: 'published',
      };

      // Commit content, meta, and index to GitHub
      await writeBlogContent(cat, draft.slug, draft.content || '', token);
      await writeBlogPostMeta(cat, draft.slug, {
        slug: draft.slug,
        folderName: draft.slug,
        title: newPost.title,
        category: cat,
        excerpt: newPost.excerpt,
        tags: newPost.tags,
        status: 'published',
        thumbnailUrl: newPost.thumbnailUrl,
        authorLogin: newPost.authorLogin,
        authorName: newPost.authorName,
        authorAvatar: newPost.authorAvatar,
        authorEmail: draft.authorEmail,
        publishedAt: now,
      }, token);

      const existingIndex = await readCategoryIndex(cat);
      existingIndex.unshift(newPost);
      await writeCategoryIndex(cat, existingIndex, token, `blog: publish "${newPost.title}"`);

      // Delete draft from DB
      await deleteBlogDraftBySlug(slug);

      return NextResponse.json({ success: true, post: newPost });
    }

    // ─── DELETE ───
    if (action === 'delete') {
      const { slug } = body as { slug: string };
      if (!slug) return NextResponse.json({ error: 'Slug required' }, { status: 400 });

      // Try deleting draft first
      const draft = await getBlogDraftBySlug(slug);
      if (draft) {
        // Owner can delete their own draft, or admin
        if (draft.authorEmail === userEmail || effectiveRole === 'admin' || effectiveRole === 'manager') {
          await deleteBlogDraftBySlug(slug);
          return NextResponse.json({ success: true, type: 'draft' });
        }
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      // Delete published post from GitHub
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
      await writeCategoryIndex(post.category, filtered, token, `blog: delete "${post.title}"`);

      return NextResponse.json({ success: true, type: 'published' });
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
