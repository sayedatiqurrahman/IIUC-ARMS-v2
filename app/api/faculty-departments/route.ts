import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { FACULTIES } from '@/lib/departments';

// Custom faculties/departments stored in DB
interface CustomFaculty {
  id: string;
  name: string;
  shortName: string;
  icon: string;
  departments: { id: string; name: string; shortName: string; icon: string }[];
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;
  try {
    const { prisma } = await import('@/lib/prisma');
    const settings = await prisma.siteSettings.findUnique({ where: { id: 'site-settings' } });
    const custom = (settings as any)?.customFaculties || [];
    return NextResponse.json({ success: true, customFaculties: custom, builtInFaculties: FACULTIES });
  } catch {
    return NextResponse.json({ success: true, customFaculties: [], builtInFaculties: FACULTIES });
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.admin);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { prisma } = await import('@/lib/prisma');
    const callerProfile = await prisma.profile.findUnique({ where: { userId: email } });
    const effective = config.getEffectiveRole(email, callerProfile?.role);
    const customPerms = (callerProfile?.customPermissions || {}) as Record<string, boolean>;
    if (customPerms.manageFaculty !== true && effective !== 'admin' && effective !== 'manager' && effective !== 'teacher') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { action } = body;

    // ─── CREATE FACULTY ───
    if (action === 'createFaculty') {
      const { id, name, shortName, icon } = body;
      if (!id || !name || !shortName) return NextResponse.json({ error: 'id, name, shortName required' }, { status: 400 });
      const cleanId = id.toLowerCase().replace(/[^a-z0-9]/g, '');

      const settings = await prisma.siteSettings.findUnique({ where: { id: 'site-settings' } });
      const custom = ((settings as any)?.customFaculties || []) as CustomFaculty[];
      if (custom.some(f => f.id === cleanId) || FACULTIES.some(f => f.id === cleanId)) {
        return NextResponse.json({ error: 'Faculty ID already exists' }, { status: 409 });
      }

      // Create GitHub folder
      try {
        const { resolveGithubToken } = await import('@/lib/telegram');
        const token = await resolveGithubToken();
        if (token) {
          await createGitHubFolder(token, `${config.uploadPath}/${cleanId}`);
        }
      } catch {}

      const newFaculty: CustomFaculty = { id: cleanId, name, shortName: shortName.toUpperCase(), icon: icon || 'fa-university', departments: [] };
      custom.push(newFaculty);
      await prisma.siteSettings.update({ where: { id: 'site-settings' }, data: { customFaculties: custom as any } });

      return NextResponse.json({ success: true, faculty: newFaculty });
    }

    // ─── CREATE DEPARTMENT ───
    if (action === 'createDepartment') {
      const { facultyId, id, name, shortName, icon } = body;
      if (!facultyId || !id || !name || !shortName) return NextResponse.json({ error: 'facultyId, id, name, shortName required' }, { status: 400 });
      const cleanId = id.toLowerCase().replace(/[^a-z0-9]/g, '');

      const settings = await prisma.siteSettings.findUnique({ where: { id: 'site-settings' } });
      const custom = ((settings as any)?.customFaculties || []) as CustomFaculty[];

      // Check built-in faculties too
      const allDepts = [...FACULTIES.flatMap(f => f.departments.map(d => d.id)), ...custom.flatMap(f => f.departments.map(d => d.id))];
      if (allDepts.includes(cleanId)) {
        return NextResponse.json({ error: 'Department ID already exists' }, { status: 409 });
      }

      const faculty = custom.find(f => f.id === facultyId);
      if (!faculty) return NextResponse.json({ error: 'Faculty not found' }, { status: 404 });

      // Create GitHub semester folders
      try {
        const { resolveGithubToken } = await import('@/lib/telegram');
        const token = await resolveGithubToken();
        if (token) {
          const semesters = ['1st-semister', '2nd-semister', '3rd-semister', '4th-semister', '5th-semister', '6th-semister', '7th-semister', '8th-semister'];
          for (const sem of semesters) {
            await createGitHubFolder(token, `${config.uploadPath}/${cleanId}/${sem}`);
          }
        }
      } catch {}

      faculty.departments.push({ id: cleanId, name, shortName: shortName.toUpperCase(), icon: icon || 'fa-building' });
      await prisma.siteSettings.update({ where: { id: 'site-settings' }, data: { customFaculties: custom as any } });

      return NextResponse.json({ success: true, department: { id: cleanId, name, shortName: shortName.toUpperCase() } });
    }

    // ─── DELETE FACULTY ───
    if (action === 'deleteFaculty') {
      const { facultyId } = body;
      if (!facultyId) return NextResponse.json({ error: 'facultyId required' }, { status: 400 });
      if (FACULTIES.some(f => f.id === facultyId)) {
        return NextResponse.json({ error: 'Cannot delete built-in faculty' }, { status: 400 });
      }
      const settings = await prisma.siteSettings.findUnique({ where: { id: 'site-settings' } });
      let custom = ((settings as any)?.customFaculties || []) as CustomFaculty[];
      custom = custom.filter(f => f.id !== facultyId);
      await prisma.siteSettings.update({ where: { id: 'site-settings' }, data: { customFaculties: custom as any } });
      return NextResponse.json({ success: true });
    }

    // ─── DELETE DEPARTMENT ───
    if (action === 'deleteDepartment') {
      const { facultyId, departmentId } = body;
      if (!facultyId || !departmentId) return NextResponse.json({ error: 'facultyId and departmentId required' }, { status: 400 });
      const settings = await prisma.siteSettings.findUnique({ where: { id: 'site-settings' } });
      const custom = ((settings as any)?.customFaculties || []) as CustomFaculty[];
      const faculty = custom.find(f => f.id === facultyId);
      if (!faculty) return NextResponse.json({ error: 'Faculty not found' }, { status: 404 });
      faculty.departments = faculty.departments.filter(d => d.id !== departmentId);
      await prisma.siteSettings.update({ where: { id: 'site-settings' }, data: { customFaculties: custom as any } });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 });
  }
}

// ─── GitHub folder creator ───
async function createGitHubFolder(token: string, folderPath: string) {
  const GITHUB_API = 'https://api.github.com';
  const owner = config.owner;
  const repo = config.repo;
  const branch = config.branch;

  // Get base branch SHA
  const baseRefRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (!baseRefRes.ok) return;
  const baseRef = await baseRefRes.json();
  const baseSha = baseRef.object.sha;

  // Get tree
  const treeRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/trees/${baseSha}`, {
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (!treeRes.ok) return;
  const treeData = await treeRes.json();

  // Create blob for .gitkeep
  const blobRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/blobs`, {
    method: 'POST',
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '', encoding: 'utf-8' }),
  });
  if (!blobRes.ok) return;
  const blob = await blobRes.json();

  // Create new tree with .gitkeep
  const newTreeRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base_tree: baseSha,
      tree: [{ path: `${folderPath}/.gitkeep`, mode: '100644', type: 'blob', sha: blob.sha }],
    }),
  });
  if (!newTreeRes.ok) return;
  const newTree = await newTreeRes.json();

  // Create commit
  const commitRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `Create folder: ${folderPath}`,
      tree: newTree.sha,
      parents: [baseSha],
    }),
  });
  if (!commitRes.ok) return;
  const commit = await commitRes.json();

  // Update ref
  await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
    method: 'PATCH',
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ sha: commit.sha, force: true }),
  });
}
