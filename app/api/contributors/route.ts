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

interface ContributorSettings {
  hiddenLogins: string[];
  sortBy: 'contributions' | 'name' | 'commits' | 'prs';
  viewMode: 'sectioned' | 'grid';
  sectionCount: 2 | 3;
  showRanks: boolean;
  showStats: boolean;
  showDeptFilter: boolean;
  showSearch: boolean;
  showOnlyCommitters: boolean;
  allowUserToggle: boolean;
}

const DEFAULT_CONTRIBUTOR_SETTINGS: ContributorSettings = {
  hiddenLogins: [],
  sortBy: 'contributions',
  viewMode: 'sectioned',
  sectionCount: 3,
  showRanks: true,
  showStats: true,
  showDeptFilter: true,
  showSearch: true,
  showOnlyCommitters: true,
  allowUserToggle: true,
};

// Bot accounts to always exclude
const BOT_LOGINS = new Set([
  'github-actions[bot]',
  'qsis-arms[bot]',
  'renovate[bot]',
  'dependabot[bot]',
  'codecov[bot]',
  'sonarcloud[bot]',
]);

function isBot(login: string, type?: string): boolean {
  if (BOT_LOGINS.has(login.toLowerCase())) return true;
  if (login.endsWith('[bot]')) return true;
  if (type === 'Bot' || type === 'App') return true;
  return false;
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

    // Process contributors from v2 (code) repo
    for (const gh of v2Contributors) {
      if (isBot(gh.login, gh.type)) continue;
      const c = ensure(gh.login, gh.avatar_url, gh.html_url, String(gh.id));
      c.v2Contributions = gh.contributions || 0;
      c.contributions += gh.contributions || 0;
      c.role = gh.login === config.owner ? 'Founder & Lead' : 'Developer';
      c.roleType = 'developer';
    }

    // Process contributors from data repo
    for (const gh of dataContributors) {
      if (isBot(gh.login, gh.type)) continue;
      const c = ensure(gh.login, gh.avatar_url, gh.html_url, String(gh.id));
      c.dataContributions = gh.contributions || 0;
      c.contributions += gh.contributions || 0;
      // Determine role based on what they contributed to
      if (c.role !== 'Founder & Lead') {
        if (c.v2Contributions > 0) {
          c.role = 'Developer & Resource Provider';
          c.roleType = 'both';
        } else {
          c.role = 'Resource Provider';
          c.roleType = 'resource_provider';
        }
      }
    }

    // Process PRs — track PR authors and count PRs as contributions
    for (const pr of [...v2Prs, ...dataPrs]) {
      const u = pr.user;
      if (!u?.login || isBot(u.login, u.type)) continue;
      const isV2 = v2Prs.includes(pr);
      const isData = dataPrs.includes(pr);
      const c = ensure(u.login, u.avatar_url, u.html_url, String(u.id));
      c.prCount += 1;
      // Count each merged PR as a contribution to that repo
      if (isV2) c.v2Contributions += 1;
      if (isData) c.dataContributions += 1;
      c.contributions += 1;
      // Update role based on PR repos
      if (c.role !== 'Founder & Lead') {
        if (isV2 && isData) {
          c.role = 'Developer & Resource Provider';
          c.roleType = 'both';
        } else if (isData && c.v2Contributions > 1) {
          c.role = 'Developer & Resource Provider';
          c.roleType = 'both';
        } else if (isData) {
          c.role = 'Resource Provider';
          c.roleType = 'resource_provider';
        } else if (isV2) {
          if (c.role === 'Contributor' || c.role === 'Resource Provider') {
            c.role = c.dataContributions > 0 ? 'Developer & Resource Provider' : 'Developer';
            c.roleType = c.dataContributions > 0 ? 'both' : 'developer';
          }
        }
      }
    }

    // Merge DB profiles
    for (const p of dbProfiles) {
      let matchedContributor: Contributor | undefined;
      if (p.githubLogin) matchedContributor = map.get(p.githubLogin);
      if (!matchedContributor && p.email) {
        matchedContributor = map.get(p.email.split('@')[0]);
      }
      if (matchedContributor) {
        const profileComplete = !!(p.universityId && p.whatsapp && p.semester);
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
      }
    }

    // Load contributor settings
    let settings: ContributorSettings = DEFAULT_CONTRIBUTOR_SETTINGS;
    try {
      const { prisma } = await import('@/lib/prisma');
      const siteSettings = await prisma.siteSettings.findUnique({ where: { id: 'site-settings' } });
      if (siteSettings?.contributorSettings) {
        settings = { ...DEFAULT_CONTRIBUTOR_SETTINGS, ...(siteSettings.contributorSettings as any) };
      }
    } catch {}

    const hiddenSet = new Set(settings.hiddenLogins.map(l => l.toLowerCase()));

    const contributors = Array.from(map.values())
      .filter(c => !hiddenSet.has(c.login.toLowerCase()))
      .sort((a, b) => {
        // 1. Founder always first
        if (a.role === 'Founder & Lead') return -1;
        if (b.role === 'Founder & Lead') return 1;
        // 2. Both repos contributors next
        if (a.roleType === 'both' && b.roleType !== 'both') return -1;
        if (a.roleType !== 'both' && b.roleType === 'both') return 1;
        // 3. Then by total contributions (commits + PRs)
        const aTotal = a.v2Contributions + a.dataContributions + a.prCount;
        const bTotal = b.v2Contributions + b.dataContributions + b.prCount;
        if (settings.sortBy === 'name') return a.name.localeCompare(b.name);
        if (settings.sortBy === 'commits') return (b.v2Contributions + b.dataContributions) - (a.v2Contributions + a.dataContributions);
        if (settings.sortBy === 'prs') return b.prCount - a.prCount;
        return bTotal - aTotal;
      });

    // Enrich with department labels
    for (const c of contributors) {
      if (c.department) {
        (c as any).departmentLabel = getDeptLabel(c.department);
        (c as any).departmentShortName = getDeptShortName(c.department);
        (c as any).facultyName = getFacultyName(c.department);
      }
    }

    return NextResponse.json({ contributors, settings });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load contributors' }, { status: 500 });
  }
}
