import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { slug } = await params;
    const { prisma } = await import('@/lib/prisma');

    const org = await prisma.studioOrganization.findUnique({ where: { slug } });
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    if (org.createdBy !== email) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const formData = await req.formData();
    const file = formData.get('logo') as File;
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'Max 5MB' }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const ext = file.name.split('.').pop() || 'png';
    const fileName = `studio-orgs/${org.slug}/logo.${ext}`;
    const mediaType = file.type || `image/${ext}`;

    const token = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || process.env.APP_GITHUB_TOKEN;
    const owner = process.env.GITHUB_REPO_OWNER || 'sayedatiqurrahman';
    const repo = process.env.GITHUB_REPO_NAME || 'IIUC-ACADEMIC-FILES-MANAFGER';
    const branch = 'main';

    let sha: string | undefined;
    try {
      const existing = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${fileName}?ref=${branch}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
      });
      if (existing.ok) {
        const meta = await existing.json();
        sha = meta.sha;
      }
    } catch {}

    const body: any = {
      message: `Update studio org logo: ${org.slug}`,
      content: base64,
      branch,
    };
    if (sha) body.sha = sha;

    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${fileName}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) return NextResponse.json({ error: 'Upload failed' }, { status: 500 });

    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${fileName}`;
    await prisma.studioOrganization.update({ where: { id: org.id }, data: { logoUrl: rawUrl } });

    return NextResponse.json({ success: true, logoUrl: rawUrl });
  } catch {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
