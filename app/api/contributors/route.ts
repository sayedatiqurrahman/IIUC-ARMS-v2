import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { FACULTIES } from '@/lib/departments';
import { getAppInstallations, getInstallationAccessToken } from '@/lib/github-app';

interface Contributor {
  id: string;
  login: string;
  name: string;
  title: string;
  email: string;
  avatar_url: string;
  html_url: string;
  contributions: number;
  v2Contributions: number;
  dataContributions: number;
  prCount: number;
  role: string;
  roleType: 'developer' | 'resource_provider' | 'both';
  department: string;
  section: string;
  universityId: string;
  whatsapp: string;
  semester: string;
  facebook: string;
  twitter: string;
  linkedin: string;
  website: string;
  company: string;
  companyUrl: string;
  publicEmail: string;
  hideWhatsapp: boolean;
  hideUniversityId: boolean;
  hideSemester: boolean;
  hideEmail: boolean;
  profileComplete: boolean;
  source: 'github' | 'db' | 'both';
}

function getDeptLabel(deptId: string): string {
  for (const f of FACULTIES) {
    for (const d of f.departments) {
      if (d.id === deptId) return d.name;
    }
  }
  return deptId;
}

function getDeptShortName(deptId: string): string {
  for (const f of FACULTIES) {
    for (const d of f.departments) {
      if (d.id === deptId) return d.shortName;
    }
  }
  return deptId;
}

function getFacultyName(deptId: string): string {
  for (const f of FACULTIES) {
    for (const d of f.departments) {
      if (d.id === deptId) return f.shortName;
    }
  }
  return '';
}

async function getDbProfiles(): Promise<any[]> {
  try {
    const { prisma } = await import('@/lib/prisma');
    const profiles = await prisma.profile.findMany();
    return profiles || [];
  } catch {
    return [];
  }
}

async function getGithubToken(): Promise<string> {
  // Try GitHub App installation token first
  try {
    const installations = await getAppInstallations();
    if (Array.isArray(installations) && installations.length > 0) {
      const token = await getInstallationAccessToken(installations[0].id);
      if (token) return token;
    }
  } catch {}

  // Fall back to env token
  return process.env.GITHUB_TOKEN || '';
}

function ghHeaders(token: string) {
  return {
    Authorization: token ? `token ${token}` : '',
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

// Fetch ALL pages of a GitHub API endpoint
async function fetchAllPages(url: string, token: string): Promise<any[]> {
  const results: any[] = [];
  let page = 1;
  const maxPages = 10; // safety limit: 10 * 100 = 1000 items max

  while (page <= maxPages) {
    const separator = url.includes('?') ? '&' : '?';
    const pageUrl = `${url}${separator}per_page=100&page=${page}`;
    try {
      const res = await fetch(pageUrl, { headers: ghHeaders(token) });
      if (!res.ok) break;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) break;
      results.push(...data);
      if (data.length < 100) break; // last page
      page++;
    } catch {
      break;
    }
  }

  return results;
}

export async function GET() {
  try {
    const dbProfiles = await getDbProfiles();
    const token = await getGithubToken();
    const GITHUB_API = 'https://api.github.com';

    // Fetch all contributors and PRs from both repos (with auth + pagination)
    const [v2Contributors, dataContributors, v2Prs, dataPrs] = await Promise.all([
      fetchAllPages(`${GITHUB_API}/repos/${config.owner}/QSIS-ARMS-v2/contributors`, token),
      fetchAllPages(`${GITHUB_API}/repos/${config.owner}/${config.repo}/contributors`, token),
      fetchAllPages(`${GITHUB_API}/repos/${config.owner}/QSIS-ARMS-v2/pulls?state=all`, token),
      fetchAllPages(`${GITHUB_API}/repos/${config.owner}/${config.repo}/pulls?state=all`, token),
    ]);

    const map = new Map<string, Contributor>();

    const ensure = (login: string, avatar: string, htmlUrl: string, id: string): Contributor => {
      if (map.has(login)) return map.get(login)!;
      const c: Contributor = {
        id, login, name: login, title: '', email: '', avatar_url: avatar, html_url: htmlUrl,
        contributions: 0, v2Contributions: 0, dataContributions: 0, prCount: 0,
        role: 'Contributor', roleType: 'developer',
        department: '', section: '',
        universityId: '', whatsapp: '', semester: '',
        facebook: '', twitter: '', linkedin: '', website: '',
        company: '', companyUrl: '', publicEmail: '',
        hideWhatsapp: false, hideUniversityId: false, hideSemester: false, hideEmail: false,
        profileComplete: false, source: 'github',
      };
      map.set(login, c);
      return c;
    };

    // Process contributors from v2 repo
    for (const gh of v2Contributors) {
      if (gh.type === 'Bot' || gh.login === 'github-actions[bot]') continue;
      const c = ensure(gh.login, gh.avatar_url, gh.html_url, String(gh.id));
      c.v2Contributions = gh.contributions || 0;
      c.contributions += gh.contributions || 0;
      c.role = gh.login === config.owner ? 'Founder & Lead' : 'Developer';
    }

    // Process contributors from data repo
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

    // Process PRs from both repos
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
      let matchedContributor: Contributor | undefined;

      if (p.githubLogin) {
        matchedContributor = map.get(p.githubLogin);
      }
      if (!matchedContributor && p.email) {
        const loginFromEmail = p.email.split('@')[0];
        matchedContributor = map.get(loginFromEmail);
      }

      const profileComplete = !!(p.universityId && p.whatsapp && p.semester);

      if (matchedContributor) {
        matchedContributor.email = p.publicEmail || '';
        matchedContributor.name = p.name || matchedContributor.name;
        matchedContributor.title = p.title || matchedContributor.title;
        matchedContributor.department = p.department || '';
        matchedContributor.section = p.section || '';
        matchedContributor.universityId = p.universityId || matchedContributor.universityId;
        matchedContributor.whatsapp = p.whatsapp || matchedContributor.whatsapp;
        matchedContributor.semester = p.semester || matchedContributor.semester;
        matchedContributor.facebook = p.facebook || '';
        matchedContributor.twitter = p.twitter || '';
        matchedContributor.linkedin = p.linkedin || '';
        matchedContributor.website = p.website || '';
        matchedContributor.company = p.company || '';
        matchedContributor.companyUrl = p.companyUrl || '';
        matchedContributor.publicEmail = p.publicEmail || '';
        matchedContributor.hideWhatsapp = !!p.hideWhatsapp;
        matchedContributor.hideUniversityId = !!p.hideUniversityId;
        matchedContributor.hideSemester = !!p.hideSemester;
        matchedContributor.hideEmail = !!p.hideEmail;
        matchedContributor.profileComplete = profileComplete;
        matchedContributor.source = 'both';
      } else {
        // DB-only contributor (no GitHub activity but has a profile)
        const c = ensure(
          p.githubLogin || p.email?.split('@')[0] || p.userId,
          '',
          '',
          p.userId
        );
        c.name = p.name || c.name;
        c.email = p.publicEmail || p.email || '';
        c.title = p.title || '';
        c.department = p.department || '';
        c.section = p.section || '';
        c.universityId = p.universityId || '';
        c.whatsapp = p.whatsapp || '';
        c.semester = p.semester || '';
        c.source = 'db';
        c.profileComplete = profileComplete;
      }
    }

    const contributors = Array.from(map.values()).sort((a, b) => {
      if (a.role === 'Founder & Lead' && b.role !== 'Founder & Lead') return -1;
      if (a.role !== 'Founder & Lead' && b.role === 'Founder & Lead') return 1;
      if (a.roleType === 'both' && b.roleType !== 'both') return -1;
      if (a.roleType !== 'both' && b.roleType === 'both') return 1;
      return b.contributions - a.contributions;
    });

    // Enrich with department labels
    for (const c of contributors) {
      if (c.department) {
        (c as any).departmentLabel = getDeptLabel(c.department);
        (c as any).departmentShortName = getDeptShortName(c.department);
        (c as any).facultyName = getFacultyName(c.department);
      }
    }

    return NextResponse.json(contributors);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load contributors' }, { status: 500 });
  }
}
