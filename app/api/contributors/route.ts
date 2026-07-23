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
  v2Contributions: number;
  dataContributions: number;
  prCount: number;
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

  // Fetch commits + PRs from BOTH repos
  const [v2Res, dataRes, v2PrRes, dataPrRes] = await Promise.all([
    fetch(`https://api.github.com/repos/${config.owner}/QSIS-ARMS-v2/contributors?per_page=100`, { next: { revalidate: 300 } }).catch(() => null),
    fetch(`https://api.github.com/repos/${config.owner}/${config.repo}/contributors?per_page=100`, { next: { revalidate: 300 } }).catch(() => null),
    fetch(`https://api.github.com/repos/${config.owner}/QSIS-ARMS-v2/pulls?state=all&per_page=100`, { next: { revalidate: 300 } }).catch(() => null),
    fetch(`https://api.github.com/repos/${config.owner}/${config.repo}/pulls?state=all&per_page=100`, { next: { revalidate: 300 } }).catch(() => null),
  ]);

  const v2Contributors = v2Res?.ok ? await v2Res.json() : [];
  const dataContributors = dataRes?.ok ? await dataRes.json() : [];
  const v2Prs = v2PrRes?.ok ? await v2PrRes.json() : [];
  const dataPrs = dataPrRes?.ok ? await dataPrRes.json() : [];

  const map = new Map<string, Contributor>();

  function ensure(login: string, avatar: string, htmlUrl: string, id: string): Contributor {
    if (map.has(login)) return map.get(login)!;
    const c: Contributor = {
      id, login, name: login, email: '', avatar_url: avatar, html_url: htmlUrl,
      contributions: 0, v2Contributions: 0, dataContributions: 0, prCount: 0,
      role: 'Contributor', roleType: 'developer',
      universityId: '', whatsapp: '', semester: '',
      profileComplete: false, source: 'github',
    };
    map.set(login, c);
    return c;
  }

  // Direct commit contributors
  for (const gh of v2Contributors) {
    if (gh.type === 'Bot' || gh.login === 'github-actions[bot]') continue;
    const c = ensure(gh.login, gh.avatar_url, gh.html_url, String(gh.id));
    c.v2Contributions = gh.contributions || 0;
    c.contributions += gh.contributions || 0;
    c.role = gh.login === config.owner ? 'Founder & Lead' : 'Developer';
  }

  for (const gh of dataContributors) {
    if (gh.type === 'Bot' || gh.login === 'github-actions[bot]') continue;
    const c = ensure(gh.login, gh.avatar_url, gh.html_url, String(gh.id));
    c.dataContributions = gh.contributions || 0;
    c.contributions += gh.contributions || 0;
    if (c.role !== 'Founder & Lead') {
      c.role = c.v2Contributions > 0 ? 'Developer & Resource Provider' : 'Resource Provider';
    }
    c.roleType = c.v2Contributions > 0 ? 'both' : 'resource_provider';
  }

  // PR authors — show anyone who opened a PR
  for (const pr of [...v2Prs, ...dataPrs]) {
    if (pr.user?.type === 'Bot') continue;
    const u = pr.user;
    if (!u?.login) continue;
    const c = ensure(u.login, u.avatar_url, u.html_url, String(u.id));
    c.prCount += 1;
    const isV2 = v2Prs.includes(pr);
    const isData = dataPrs.includes(pr);
    if (isV2 && !isData) {
      if (c.role !== 'Founder & Lead') c.role = c.v2Contributions > 0 ? 'Developer' : 'Contributor';
    } else if (isData && !isV2) {
      if (c.role !== 'Founder & Lead') c.role = c.v2Contributions > 0 ? 'Developer & Resource Provider' : 'Resource Provider';
    } else if (isV2 && isData) {
      if (c.role !== 'Founder & Lead') c.role = 'Developer & Resource Provider';
    }
    if (isV2 && isData) c.roleType = 'both';
    else if (isData) c.roleType = 'resource_provider';
  }

  // Merge DB profiles
  for (const p of dbProfiles) {
    const login = p.email?.split('@')[0] || p.userId?.split('@')[0] || '';
    if (!login) continue;
    const existing = map.get(login);
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
      map.set(login, {
        id: p.userId, login, name: p.name || login, email: p.email || '',
        avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name || login)}&background=22c55e&color=fff&bold=true&size=200`,
        html_url: `https://github.com/${login}`,
        contributions: 0, v2Contributions: 0, dataContributions: 0, prCount: 0,
        role: OWNER_EMAILS.includes(p.email) ? 'Founder & Lead' : 'Resource Provider',
        roleType: OWNER_EMAILS.includes(p.email) ? 'developer' : 'resource_provider',
        universityId: p.universityId || '', whatsapp: p.whatsapp || '', semester: p.semester || '',
        profileComplete, source: 'db',
      });
    }
  }

  const contributors = Array.from(map.values()).sort((a, b) => {
    if (a.role === 'Founder & Lead' && b.role !== 'Founder & Lead') return -1;
    if (a.role !== 'Founder & Lead' && b.role === 'Founder & Lead') return 1;
    if (a.roleType === 'both' && b.roleType !== 'both') return -1;
    if (a.roleType !== 'both' && b.roleType === 'both') return 1;
    return b.contributions - a.contributions;
  });

  return NextResponse.json(contributors);
}
