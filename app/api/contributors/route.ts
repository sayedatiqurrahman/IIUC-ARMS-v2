import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { FACULTIES } from '@/lib/departments';
import { getAppInstallations, getInstallationAccessToken } from '@/lib/github-app';
import { getCustomRoles } from '@/lib/permissions';

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
  designContributions: number;
  issueContributions: number;
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
  hideCompany: boolean;
  hideFacebook: boolean;
  hideTwitter: boolean;
  hideLinkedin: boolean;
  hideWebsite: boolean;
  profileComplete: boolean;
  source: 'github' | 'db' | 'both';
  systemRoleKey?: string;
  systemRole?: string;
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
    const profiles = await prisma.profile.findMany({
      select: {
        userId: true, email: true, name: true, universityId: true, whatsapp: true,
        semester: true, department: true, section: true, githubLogin: true,
        facebook: true, twitter: true, linkedin: true, website: true,
        company: true, companyUrl: true, publicEmail: true, title: true,
        phone: true, isCR: true, isACR: true, shortForm: true, batchId: true,
        hideWhatsapp: true, hideUniversityId: true, hideSemester: true, hideEmail: true,
        hideCompany: true, hideFacebook: true, hideTwitter: true, hideLinkedin: true, hideWebsite: true,
        role: true, showInContributors: true,
      }
    });
    return profiles || [];
  } catch (e: any) {
    console.error('[contributors] getDbProfiles failed:', e?.message || e);
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

    const [v2Contributors, dataContributors, v2Issues, designAuthors] = await Promise.all([
      fetchAllPages(`${GITHUB_API}/repos/${config.owner}/${config.sourceRepo}/contributors`, token),
      fetchAllPages(`${GITHUB_API}/repos/${config.owner}/${config.repo}/contributors`, token),
      fetchAllPages(`${GITHUB_API}/repos/${config.owner}/${config.sourceRepo}/issues?state=all`, token),
      // Creative Hub design authors (public raw file in the themes repo).
      fetch(`https://raw.githubusercontent.com/${config.creativeHub.owner}/${config.creativeHub.repo}/main/authors.json`, { cache: 'no-store' })
        .then((res) => res.json().catch(() => null)),
    ]);

    const designAuthorList = (designAuthors && Array.isArray(designAuthors.authors) ? designAuthors.authors : []) as any[];

    const map = new Map<string, Contributor>();

    const ensure = (login: string, avatar: string, htmlUrl: string, id: string): Contributor => {
      if (map.has(login)) return map.get(login)!;
      const c: Contributor = {
        id, login, name: login, title: '', email: '', avatar_url: avatar, html_url: htmlUrl,
        contributions: 0, v2Contributions: 0, dataContributions: 0, designContributions: 0, issueContributions: 0,
        role: 'Contributor', roleType: 'developer',
        department: '', section: '',
        universityId: '', whatsapp: '', semester: '',
        facebook: '', twitter: '', linkedin: '', website: '',
        company: '', companyUrl: '', publicEmail: '',
        hideWhatsapp: false, hideUniversityId: false, hideSemester: false, hideEmail: false, hideCompany: false,
        hideFacebook: false, hideTwitter: false, hideLinkedin: false, hideWebsite: false,
        profileComplete: false, source: 'github',
        systemRoleKey: '', systemRole: '',
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
          c.roleType = 'developer';
        } else {
          c.role = 'Resource Provider';
          c.roleType = 'resource_provider';
        }
      }
    }

    // Process issues (bug reports / feature requests) — each issue opened by a
    // user counts as 1 contribution (pull requests are filtered out here).
    for (const issue of v2Issues) {
      if (issue.pull_request) continue;
      const u = issue.user;
      if (!u?.login || isBot(u.login, u.type)) continue;
      const c = ensure(u.login, u.avatar_url, u.html_url, String(u.id));
      c.issueContributions += 1;
      c.contributions += 1;
    }

    const customRoles = await getCustomRoles();
    const customRoleByKey = new Map(customRoles.map(r => [r.key.toLowerCase(), r.label]));

    // Merge DB profiles
    for (const p of dbProfiles) {
      let matchedContributor: Contributor | undefined;
      if (p.githubLogin) matchedContributor = map.get(p.githubLogin);
      if (!matchedContributor && p.email) {
        matchedContributor = map.get(p.email.split('@')[0]);
      }
      if (matchedContributor) {
        // Skip contributors who opted out
        if (p.showInContributors === false) {
          map.delete(matchedContributor.login);
          continue;
        }
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
        matchedContributor.hideCompany = !!(p as any).hideCompany;
        matchedContributor.hideFacebook = !!(p as any).hideFacebook;
        matchedContributor.hideTwitter = !!(p as any).hideTwitter;
        matchedContributor.hideLinkedin = !!(p as any).hideLinkedin;
        matchedContributor.hideWebsite = !!(p as any).hideWebsite;
        matchedContributor.profileComplete = profileComplete;
        matchedContributor.source = 'both';

        // Surface the system role (admin / manager / teacher / custom role) so
        // special-role users are recognizable on the contributor list.
        const SPECIAL_ROLE_LABELS: Record<string, string> = { admin: 'Admin', manager: 'Manager', teacher: 'Teacher' };
        const roleKey = String(p.role || 'user').toLowerCase();
        if (SPECIAL_ROLE_LABELS[roleKey]) {
          matchedContributor.systemRoleKey = roleKey;
          matchedContributor.systemRole = SPECIAL_ROLE_LABELS[roleKey];
        } else if (roleKey !== 'user' && roleKey !== 'student' && roleKey !== 'external' && roleKey !== 'cr' && roleKey !== 'acr') {
          matchedContributor.systemRoleKey = roleKey;
          matchedContributor.systemRole = customRoleByKey.get(roleKey) || roleKey;
        }
      }
    }

    // Merge Creative Hub design authors (from the themes repo authors.json).
    for (const a of designAuthorList) {
      const login = a.githubLogin || (a.email ? a.email.split('@')[0] : '') || '';
      const email = (a.email || '').toLowerCase();
      let matched: Contributor | undefined;
      if (login && map.has(login)) matched = map.get(login)!;
      if (!matched && email) {
        matched = Array.from(map.values()).find((c) => c.email && c.email.toLowerCase() === email);
      }
      const designCount = Number(a.designCount) || 1;
      if (matched) {
        matched.designContributions += designCount;
        matched.contributions += designCount;
      } else if (login) {
        const c = ensure(login, '', '', `design-${login}`);
        c.designContributions = designCount;
        c.contributions += designCount;
        c.role = 'Designer';
        c.roleType = 'resource_provider';
        c.name = a.name || login;
        c.email = a.email || '';
        c.universityId = a.universityId || '';
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
        // 2. Rank by combined total: commits + designs + issues (PRs excluded — already counted inside code/data)
        const aTotal = a.v2Contributions + a.dataContributions + a.designContributions + a.issueContributions;
        const bTotal = b.v2Contributions + b.dataContributions + b.designContributions + b.issueContributions;
        if (settings.sortBy === 'name') return a.name.localeCompare(b.name);
        if (settings.sortBy === 'commits') return (b.v2Contributions + b.dataContributions) - (a.v2Contributions + a.dataContributions);
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
