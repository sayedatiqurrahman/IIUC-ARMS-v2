import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { prisma } from '@/lib/prisma';

interface Contributor {
  id: string;
  login: string;
  name: string;
  email: string;
  avatar_url: string;
  html_url: string;
  contributions: number;
  role: string;
  universityId: string;
  whatsapp: string;
  semester: string;
  profileComplete: boolean;
  source: 'github' | 'db' | 'both';
}

function getRole(p: any, ghContrib: any): string {
  if (ghContrib && ghContrib.login === config.owner) return 'Founder & Lead';
  if (p.universityId && p.whatsapp) return 'Active Contributor';
  if (p.universityId) return 'File Provider';
  return 'Contributor';
}

export async function GET() {
  const githubContributors: any[] = [];
  const dbProfiles: any[] = [];

  // Fetch GitHub contributors (direct commits)
  try {
    const res = await fetch(
      `https://api.github.com/repos/${config.owner}/${config.repo}/contributors?per_page=100`,
      { next: { revalidate: 300 } }
    );
    if (res.ok) {
      const data = await res.json();
      githubContributors.push(...data);
    }
  } catch {}

  // Fetch all DB profiles (PR-based contributors)
  try {
    const profiles = await prisma.profile.findMany();
    dbProfiles.push(...profiles);
  } catch {}

  // Build merged contributor list
  const contributorMap = new Map<string, Contributor>();

  // Add GitHub contributors first
  for (const gh of githubContributors) {
    contributorMap.set(gh.login, {
      id: String(gh.id),
      login: gh.login,
      name: gh.login,
      email: '',
      avatar_url: gh.avatar_url,
      html_url: gh.html_url,
      contributions: gh.contributions || 0,
      role: gh.login === config.owner ? 'Founder & Lead' : 'Source Contributor',
      universityId: '',
      whatsapp: '',
      semester: '',
      profileComplete: false,
      source: 'github',
    });
  }

  // Merge DB profiles — enrich existing or add new
  for (const p of dbProfiles) {
    const login = p.name?.toLowerCase().replace(/\s+/g, '') || '';
    const existing = contributorMap.get(login);

    const profileComplete = !!(p.universityId && p.whatsapp && p.semester);

    if (existing) {
      existing.email = p.email || existing.email;
      existing.name = p.name || existing.name;
      existing.universityId = p.universityId || existing.universityId;
      existing.whatsapp = p.whatsapp || existing.whatsapp;
      existing.semester = p.semester || existing.semester;
      existing.profileComplete = profileComplete;
      existing.role = getRole(p, { login: existing.login });
      existing.source = 'both';
    } else {
      // DB-only contributor (PR from fork, no direct GitHub commit)
      const newLogin = p.email?.split('@')[0] || p.userId?.split('@')[0] || 'unknown';
      contributorMap.set(p.userId, {
        id: p.userId,
        login: newLogin,
        name: p.name || newLogin,
        email: p.email || '',
        avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name || newLogin)}&background=22c55e&color=fff&bold=true&size=200`,
        html_url: `https://github.com/${newLogin}`,
        contributions: 0,
        role: getRole(p, null),
        universityId: p.universityId || '',
        whatsapp: p.whatsapp || '',
        semester: p.semester || '',
        profileComplete,
        source: 'db',
      });
    }
  }

  const contributors = Array.from(contributorMap.values()).sort((a, b) => {
    if (a.source === 'both' && b.source !== 'both') return -1;
    if (a.source !== 'both' && b.source === 'both') return 1;
    return b.contributions - a.contributions;
  });

  return NextResponse.json(contributors);
}
