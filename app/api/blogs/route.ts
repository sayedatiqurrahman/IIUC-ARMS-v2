import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { config } from '@/lib/config';
import { hasPermission } from '@/lib/permissions';
import {
  readCategoryIndex,
  readBlogsIndex,
  writeCategoryIndex,
  writeBlogContent,
  writeBlogPostMeta,
  deleteBlogPostFolder,
  uploadBlogThumbnail,
  uploadBlogAsset,
  readBlogContent,
  getToken,
  type BlogPostListItem,
  type BlogCategory,
} from '@/lib/blog';

function generateId(): string {
  return `blog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action');

  // ─── Fetch content for published post ───
  if (action === 'content') {
    const slug = req.nextUrl.searchParams.get('slug');
    if (!slug) return NextResponse.json({ error: 'Slug required' }, { status: 400 });

    const publishedPosts = await readBlogsIndex();
    const publishedPost = publishedPosts.find(p => p.slug === slug);
    if (publishedPost) {
      const content = await readBlogContent(publishedPost.category, publishedPost.folderName);
      return NextResponse.json({ success: true, content, status: 'published' });
    }
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  // ─── List published posts ───
  const category = req.nextUrl.searchParams.get('category');

  let posts: BlogPostListItem[] = [];
  if (category && (category === 'tutorial' || category === 'post')) {
    posts = await readCategoryIndex(category as BlogCategory);
  } else {
    posts = await readBlogsIndex();
  }
  posts = posts.filter(p => p.status === 'published');

  return NextResponse.json({ success: true, posts });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userEmail = session.user?.email || '';
  const userName = (session.user as any)?.name || userEmail.split('@')[0];
  const profile = await (await import('@/lib/prisma')).prisma.profile.findUnique({ where: { userId: userEmail } });
  const effectiveRole = config.getEffectiveRole(userEmail, profile?.role);
  const isCR = !!(profile?.isCR);

  try {
    const contentType = req.headers.get('content-type') || '';

    // ─── FormData uploads (thumbnail or asset for published posts) ───
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      const category = (formData.get('category') as string || 'post') as BlogCategory;
      const slug = formData.get('slug') as string | null;
      const isContent = formData.get('content') === '1';

      if (!file) return NextResponse.json({ error: 'File required' }, { status: 400 });
      if (!slug) return NextResponse.json({ error: 'Slug required' }, { status: 400 });

      const permAction = category === 'tutorial' ? 'publishTutorial' : 'publishBlog';
      if (!(await hasPermission(permAction, effectiveRole, isCR, userEmail))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const token = await getToken(userEmail);

      if (isContent) {
        const url = await uploadBlogAsset(category, slug, file, token);
        return NextResponse.json({ success: true, url });
      }
      const url = await uploadBlogThumbnail(category, slug, file, token);
      return NextResponse.json({ success: true, url });
    }

    // ─── JSON actions ───
    const body = await req.json();
    const { action } = body;
    const token = await getToken(userEmail);

    // ─── PUBLISH (create or update published post) ───
    if (action === 'publish' || action === 'create' || action === 'update') {
      const { slug: clientSlug, title, category, excerpt, content, tags, thumbnailUrl, videoUrl } = body as {
        slug?: string; title: string; category?: BlogCategory;
        excerpt?: string; content?: string; tags?: string[]; thumbnailUrl?: string; videoUrl?: string;
      };
      if (!title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 });

      const cat = (category as BlogCategory) || 'post';
      const permAction = cat === 'tutorial' ? 'publishTutorial' : 'publishBlog';
      if (!(await hasPermission(permAction, effectiveRole, isCR, userEmail))) {
        return NextResponse.json({ error: 'You do not have permission to publish.' }, { status: 403 });
      }

      const slug = clientSlug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
      const now = new Date().toISOString();

      // Check if updating existing published post
      const existingPosts = await readBlogsIndex();
      const existingIdx = existingPosts.findIndex(p => p.slug === slug);

      const postEntry: BlogPostListItem = {
        id: existingIdx >= 0 ? existingPosts[existingIdx].id : generateId(),
        slug, folderName: slug, title: title.trim(), category: cat,
        excerpt: (excerpt || '').trim(), thumbnailUrl, videoUrl: videoUrl || undefined,
        authorLogin: (session.user as any).login || '', authorName: userName,
        authorAvatar: (session.user as any).image || '', authorEmail: userEmail,
        publishedAt: existingIdx >= 0 ? existingPosts[existingIdx].publishedAt : now,
        updatedAt: now, tags: tags || [], status: 'published',
      };

      // Write content + meta to GitHub
      if (content !== undefined) await writeBlogContent(cat, slug, content, token);
      await writeBlogPostMeta(cat, slug, {
        slug, folderName: slug, title: postEntry.title, category: cat,
        excerpt: postEntry.excerpt, tags: postEntry.tags, status: 'published',
        thumbnailUrl, videoUrl: videoUrl || undefined, authorLogin: postEntry.authorLogin, authorName: userName,
        authorAvatar: postEntry.authorAvatar, authorEmail: userEmail,
        publishedAt: postEntry.publishedAt, updatedAt: now,
      }, token);

      // Update category index
      const indexPosts = await readCategoryIndex(cat);
      if (existingIdx >= 0) {
        const globalIdx = existingPosts.indexOf(existingPosts[existingIdx]);
        indexPosts.splice(indexPosts.findIndex(p => p.slug === slug), 1);
      }
      indexPosts.unshift(postEntry);
      await writeCategoryIndex(cat, indexPosts, token, `blog: ${existingIdx >= 0 ? 'update' : 'publish'} "${postEntry.title}"`);
      console.log(`[Blog] Published "${postEntry.title}" as ${slug} (${cat})`);

      return NextResponse.json({ success: true, post: postEntry });
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
