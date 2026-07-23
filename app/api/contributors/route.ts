import { NextResponse } from 'next/server';
import { config } from '@/lib/config';

interface Contributor {
  id: string;
  login: string;
  name: string;
  email: string;
  avatar_url: string;
  html_url: string;
  contributions: number;
  role: string;
  roleType: 'developer' | 'resource_provider' | 'both';
  universityId: string;
  whatsapp: string;
  semester: string;
  profileComplete: boolean;
  source: 'github' | 'db' | 'both';
}

const OWNER_EMAILS = [
  'quranicsciencesclub@gmail.com',
  's.atiqurrahman2003@gmail.com',
];

async function getDbProfiles(): Promise<any[]> {
  try {
    const { prisma } = await import('@/lib/prisma');
    const profiles = await prisma.profile.findMany();
    return profiles || [];
  } catch {
    return [];
  }
}

export async function GET() {
  const dbProfiles = await getDbProfiles();

  // Fetch contributors from BOTH repos in parallel
  const [v2Res, dataRes] = await Promise.all([
    fetch(`https://api.github.com/repos/${config.owner}/QSIS-ARMS-v2/contributors?per_page=100`, { next: { revalidate: 300 } }).catch(() => null),
    fetch(`https://api.github.com/repos/${config.owner}/${config.repo}/contributors?per_page=100`, { next: { revalidate: 300 } }).catch(() => null),
  ]);

  const v2Contributors = v2Res?.ok ? await v2Res.json() : [];
  const dataContributors = dataRes?.ok ? await dataRes.json() : [];

  // Build merged contributor list
  const contributorMap = new Map<string, Contributor>();

  // Add V2 (developer) contributors
  for (const gh of v2Contributors) {
    if (gh.login === 'github-actions[bot]') continue;
    const login = gh.login;
    contributorMap.set(login, {
      id: String(gh.id),
      login,
      name: login,
      email: '',
      avatar_url: gh.avatar_url,
      html_url: gh.html_url,
      contributions: gh.contributions || 0,
      role: gh.login === config.owner ? 'Founder & Lead' : 'Developer',
      roleType: 'developer',
      universityId: '',
      whatsapp: '',
      semester: '',
      profileComplete: false,
      source: 'github',
    });
  }

  // Add Data repo (resource provider) contributors
  for (const gh of dataContributors) {
    if (gh.login === 'github-actions[bot]') continue;
    const login = gh.login;
    const existing = contributorMap.get(login);

    if (existing) {
      existing.contributions += gh.contributions || 0;
      existing.roleType = 'both';
      if (existing.role !== 'Founder & Lead') {
        existing.role = 'Developer & Resource Provider';
      }
    } else {
      contributorMap.set(login, {
        id: String(gh.id),
        login,
        name: login,
        email: '',
        avatar_url: gh.avatar_url,
        html_url: gh.html_url,
        contributions: gh.contributions || 0,
        role: 'Resource Provider',
        roleType: 'resource_provider',
        universityId: '',
        whatsapp: '',
        semester: '',
        profileComplete: false,
        source: 'github',
      });
    }
  }

  // Merge DB profiles
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
      existing.source = 'both';
    } else {
      const newLogin = p.email?.split('@')[0] || p.userId?.split('@')[0] || 'unknown';
      contributorMap.set(p.userId, {
        id: p.userId,
        login: newLogin,
        name: p.name || newLogin,
        email: p.email || '',
        avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name || newLogin)}&background=22c55e&color=fff&bold=true&size=200`,
        html_url: `https://github.com/${newLogin}`,
        contributions: 0,
        role: OWNER_EMAILS.includes(p.email) ? 'Founder & Lead' : 'Resource Provider',
        roleType: OWNER_EMAILS.includes(p.email) ? 'developer' : 'resource_provider',
        universityId: p.universityId || '',
        whatsapp: p.whatsapp || '',
        semester: p.semester || '',
        profileComplete,
        source: 'db',
      });
    }
  }

  const contributors = Array.from(contributorMap.values()).sort((a, b) => {
    if (a.role === 'Founder & Lead' && b.role !== 'Founder & Lead') return -1;
    if (a.role !== 'Founder & Lead' && b.role === 'Founder & Lead') return 1;
    if (a.roleType === 'both' && b.roleType !== 'both') return -1;
    if (a.roleType !== 'both' && b.roleType === 'both') return 1;
    return b.contributions - a.contributions;
  });

  return NextResponse.json(contributors);
}
