import 'server-only';
import { config } from '@/lib/config';
import { FACULTIES } from '@/lib/departments';
import { getAppInstallations, getInstallationAccessToken } from '@/lib/github-app';
import { getCustomRoles } from '@/lib/permissions';

const GITHUB_API = 'https://api.github.com';
const CACHE_TTL = 15 * 60 * 1000;

export const CONTRIBUTOR_REPOS = [
  { repo: config.sourceRepo, key: 'code' as const, label: 'Source Code' },
  { repo: config.repo, key: 'data' as const, label: 'Academic Files' },
];

export interface ContributorCommit {
  sha: string;
  login: string;
  displayLogin: string;
  name: string;
  email: string;
  message: string;
  title: string;
  date: string;
  url: string;
  repo: 'code' | 'data';
  repoLabel: string;
}

export interface ContributorPR {
  login: string;
  repo: 'code' | 'data';
  repoLabel: string;
  number: number;
  title: string;
  state: string;
  date: string;
  url: string;
}

export interface HistoryEvent {
  type: 'commit' | 'pr';
  repo: 'code' | 'data';
  repoLabel: string;
  sha?: string;
  shortSha?: string;
  number?: number;
  title: string;
  message?: string;
  state?: string;
  date: string;
  url: string;
}

export interface Contributor {
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
  departmentLabel?: string;
  departmentShortName?: string;
  facultyName?: string;
}

export interface ContributorSettings {
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

export const DEFAULT_CONTRIBUTOR_SETTINGS: ContributorSettings = {
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

const BOT_LOGINS = new Set([
  'github-actions[bot]',
  'qsis-arms[bot]',
  'iiuc-arms[bot]',
  'renovate[bot]',
  'dependabot[bot]',
  'codecov[bot]',
  'sonarcloud[bot]',
]);

export function isBot(login: string, type?: string): boolean {
  if (!login) return false;
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

export async function getGithubToken(): Promise<string> {
  try {
    const installations = await getAppInstallations();
    if (Array.isArray(installations) && installations.length > 0) {
      const token = await getInstallationAccessToken(installations[0].id);
      if (token) return token;
    }
  } catch {}
  return process.env.GITHUB_TOKEN || '';
}

function ghHeaders(token: string) {
  return {
    Authorization: token ? `token ${token}` : '',
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

function withPage(url: string, page: number): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}per_page=100&page=${page}`;
}

async function fetchPage(url: string, token: string): Promise<{ data: any[]; link: string }> {
  try {
    const res = await fetch(url, { headers: ghHeaders(token) });
    if (!res.ok) return { data: [], link: '' };
    const data = await res.json();
    return { data: Array.isArray(data) ? data : [], link: res.headers.get('link') || '' };
  } catch {
    return { data: [], link: '' };
  }
}

async function fetchAllPages(url: string, token: string, maxPages = 10): Promise<any[]> {
  const first = await fetchPage(withPage(url, 1), token);
  const match = first.link.match(/[?&]page=(\d+)>;\s*rel="last"/);
  const lastPage = Math.min(match ? parseInt(match[1], 10) : 1, maxPages);
  const results = [...first.data];
  const pages: number[] = [];
  for (let p = 2; p <= lastPage; p++) pages.push(p);

  for (let i = 0; i < pages.length; i += 6) {
    const batch = pages.slice(i, i + 6);
    const batchResults = await Promise.all(batch.map((p) => fetchPage(withPage(url, p), token)));
    for (const r of batchResults) results.push(...r.data);
  }
  return results;
}

function noreplyLogin(email: string): string {
  const e = (email || '').toLowerCase();
  if (!e.endsWith('@users.noreply.github.com')) return '';
  const local = e.split('@')[0];
  const plus = local.lastIndexOf('+');
  return plus >= 0 ? local.slice(plus + 1) : local;
}

async function loadEmailMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const { prisma } = await import('@/lib/prisma');
    const profiles = await prisma.profile.findMany({
      select: { userId: true, email: true, publicEmail: true, githubLogin: true, linkedEmails: true },
    });
    for (const p of profiles) {
      const login = (p.githubLogin || '').trim();
      if (!login) continue;
      const key = login.toLowerCase();
      for (const email of [p.userId, p.email, p.publicEmail]) {
        if (email) map.set(email.toLowerCase(), key);
      }
      try {
        const linked = JSON.parse(p.linkedEmails || '[]');
        if (Array.isArray(linked)) {
          for (const email of linked) {
            if (typeof email === 'string' && email) map.set(email.toLowerCase(), key);
          }
        }
      } catch {}
    }
  } catch {}
  return map;
}

let commitCache: { at: number; value: ContributorCommit[] } | null = null;
let prCache: { at: number; value: ContributorPR[] } | null = null;
let commitInflight: Promise<ContributorCommit[]> | null = null;
let prInflight: Promise<ContributorPR[]> | null = null;

export async function loadAllCommits(): Promise<ContributorCommit[]> {
  if (commitCache && Date.now() - commitCache.at < CACHE_TTL) return commitCache.value;
  if (commitInflight) return commitInflight;

  commitInflight = (async () => {
    const token = await getGithubToken();
    const emailMap = await loadEmailMap();
    const commits: ContributorCommit[] = [];

    for (const r of CONTRIBUTOR_REPOS) {
      const raw = await fetchAllPages(`${GITHUB_API}/repos/${config.owner}/${r.repo}/commits`, token, 40);
      for (const c of raw) {
        const authorLogin = (c.author?.login || '').trim();
        const committerLogin = (c.committer?.login || '').trim();
        const authorEmail = (c.commit?.author?.email || '').toLowerCase();
        const committerEmail = (c.commit?.committer?.email || '').toLowerCase();

        // Learn email → login mappings from commits that GitHub has already linked.
        if (authorLogin) {
          if (authorEmail) emailMap.set(authorEmail, authorLogin.toLowerCase());
          if (committerEmail) emailMap.set(committerEmail, authorLogin.toLowerCase());
        }

        const displayLogin = authorLogin || committerLogin || '';
        let login = displayLogin.toLowerCase();
        if (!login) login = emailMap.get(authorEmail) || emailMap.get(committerEmail) || '';
        if (!login) login = noreplyLogin(authorEmail) || noreplyLogin(committerEmail) || '';
        if (!login || isBot(login)) continue;

        commits.push({
          sha: c.sha,
          login,
          displayLogin: displayLogin || login,
          name: c.commit?.author?.name || displayLogin || login,
          email: authorEmail || committerEmail,
          message: c.commit?.message || '',
          title: (c.commit?.message || '').split('\n')[0].trim() || '(no message)',
          date: c.commit?.author?.date || c.commit?.committer?.date || '',
          url: c.html_url,
          repo: r.key,
          repoLabel: r.label,
        });
      }
    }

    const seen = new Set<string>();
    const unique = commits.filter((c) => {
      if (seen.has(c.sha)) return false;
      seen.add(c.sha);
      return true;
    });

    // If GitHub was unavailable/rate-limited, retry sooner rather than serving
    // empty contribution data for the full cache window.
    commitCache = {
      at: unique.length > 0 ? Date.now() : Date.now() - (CACHE_TTL - 2 * 60 * 1000),
      value: unique,
    };
    return unique;
  })().finally(() => {
    commitInflight = null;
  });

  return commitInflight;
}

export async function loadAllPRs(): Promise<ContributorPR[]> {
  if (prCache && Date.now() - prCache.at < CACHE_TTL) return prCache.value;
  if (prInflight) return prInflight;

  prInflight = (async () => {
    const token = await getGithubToken();
    const prs: ContributorPR[] = [];

    for (const r of CONTRIBUTOR_REPOS) {
      const raw = await fetchAllPages(
        `${GITHUB_API}/repos/${config.owner}/${r.repo}/pulls?state=all`,
        token,
        10,
      );
      for (const pr of raw) {
        const login = (pr.user?.login || '').trim();
        if (!login || isBot(login)) continue;
        prs.push({
          login: login.toLowerCase(),
          repo: r.key,
          repoLabel: r.label,
          number: pr.number,
          title: pr.title || `Pull request #${pr.number}`,
          state: pr.merged_at ? 'merged' : pr.state,
          date: pr.merged_at || pr.created_at || '',
          url: pr.html_url,
        });
      }
    }

    prCache = {
      at: prs.length > 0 ? Date.now() : Date.now() - (CACHE_TTL - 2 * 60 * 1000),
      value: prs,
    };
    return prs;
  })().finally(() => {
    prInflight = null;
  });

  return prInflight;
}

export function countCommitsByLogin(commits: ContributorCommit[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const c of commits) map.set(c.login, (map.get(c.login) || 0) + 1);
  return map;
}

export function countPRsByLogin(prs: ContributorPR[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const pr of prs) map.set(pr.login, (map.get(pr.login) || 0) + 1);
  return map;
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
        isCR: true, isACR: true, shortForm: true, batchId: true,
        hideWhatsapp: true, hideUniversityId: true, hideSemester: true, hideEmail: true,
        hideCompany: true, hideFacebook: true, hideTwitter: true, hideLinkedin: true, hideWebsite: true,
        role: true, showInContributors: true,
      },
    });
    return profiles || [];
  } catch (e: any) {
    console.error('[contributors] getDbProfiles failed:', e?.message || e);
    return [];
  }
}

export async function loadContributors(): Promise<{ contributors: Contributor[]; settings: ContributorSettings }> {
  const [dbProfiles, token, commits] = await Promise.all([
    getDbProfiles(),
    getGithubToken(),
    loadAllCommits(),
  ]);
  const commitCounts = countCommitsByLogin(commits);

  const [v2Contributors, dataContributors, v2Issues, designAuthors] = await Promise.all([
    fetchAllPages(`${GITHUB_API}/repos/${config.owner}/${config.sourceRepo}/contributors`, token),
    fetchAllPages(`${GITHUB_API}/repos/${config.owner}/${config.repo}/contributors`, token),
    fetchAllPages(`${GITHUB_API}/repos/${config.owner}/${config.sourceRepo}/issues?state=all`, token),
    fetch(`https://raw.githubusercontent.com/${config.creativeHub.owner}/${config.creativeHub.repo}/main/authors.json`, { cache: 'no-store' })
      .then((res) => res.json().catch(() => null)),
  ]);

  const designAuthorList = (designAuthors && Array.isArray(designAuthors.authors) ? designAuthors.authors : []) as any[];

  const map = new Map<string, Contributor>();

  const ensure = (login: string, avatar: string, htmlUrl: string, id: string): Contributor => {
    const key = login.toLowerCase();
    if (map.has(key)) return map.get(key)!;
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
    map.set(key, c);
    return c;
  };

  const commitCountFor = (login: string) => commitCounts.get(login.toLowerCase()) || 0;

  // Process contributors from v2 (code) repo
  for (const gh of v2Contributors) {
    if (isBot(gh.login, gh.type)) continue;
    const c = ensure(gh.login, gh.avatar_url, gh.html_url, String(gh.id));
    c.v2Contributions = commitCountFor(gh.login);
    c.contributions += c.v2Contributions;
    c.role = gh.login.toLowerCase() === config.owner.toLowerCase() ? 'Founder & Lead' : 'Developer';
    c.roleType = 'developer';
  }

  // Process contributors from data repo
  for (const gh of dataContributors) {
    if (isBot(gh.login, gh.type)) continue;
    const c = ensure(gh.login, gh.avatar_url, gh.html_url, String(gh.id));
    c.dataContributions = commitCountFor(gh.login);
    c.contributions += c.dataContributions;
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

  // Include contributors that only appear in the resolved commit list (e.g. a
  // commit authored with an email linked to a profile that GitHub's contributors
  // endpoint does not list separately).
  for (const login of Array.from(commitCounts.keys())) {
    if (map.has(login) || isBot(login)) continue;
    const commit = commits.find((c) => c.login === login);
    const c = ensure(commit?.displayLogin || login, '', '', `commit-${login}`);
    c.v2Contributions = commits.filter((x) => x.login === login && x.repo === 'code').length;
    c.dataContributions = commits.filter((x) => x.login === login && x.repo === 'data').length;
    c.contributions += c.v2Contributions + c.dataContributions;
    c.role = c.v2Contributions > 0 ? 'Developer' : 'Resource Provider';
    c.roleType = c.v2Contributions > 0 ? 'developer' : 'resource_provider';
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
  const customRoleByKey = new Map(customRoles.map((r) => [r.key.toLowerCase(), r.label]));

  // Merge DB profiles
  for (const p of dbProfiles) {
    let matchedContributor: Contributor | undefined;
    if (p.githubLogin) matchedContributor = map.get(p.githubLogin.toLowerCase());
    if (!matchedContributor && p.email) {
      matchedContributor = map.get(p.email.split('@')[0].toLowerCase());
    }
    if (matchedContributor) {
      if (p.showInContributors === false) {
        map.delete(matchedContributor.login.toLowerCase());
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
    if (login) matched = map.get(login.toLowerCase());
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

  const hiddenSet = new Set((settings.hiddenLogins || []).map((l) => l.toLowerCase()));

  const contributors = Array.from(map.values())
    .filter((c) => !hiddenSet.has(c.login.toLowerCase()))
    .sort((a, b) => {
      if (a.role === 'Founder & Lead') return -1;
      if (b.role === 'Founder & Lead') return 1;
      const aTotal = a.v2Contributions + a.dataContributions + a.designContributions + a.issueContributions;
      const bTotal = b.v2Contributions + b.dataContributions + b.designContributions + b.issueContributions;
      if (settings.sortBy === 'name') return a.name.localeCompare(b.name);
      if (settings.sortBy === 'commits') return (b.v2Contributions + b.dataContributions) - (a.v2Contributions + a.dataContributions);
      return bTotal - aTotal;
    });

  for (const c of contributors) {
    if (c.department) {
      c.departmentLabel = getDeptLabel(c.department);
      c.departmentShortName = getDeptShortName(c.department);
      c.facultyName = getFacultyName(c.department);
    }
  }

  return { contributors, settings };
}

export async function loadContributorHistory(login: string): Promise<{
  login: string;
  events: HistoryEvent[];
  commitCount: number;
  prCount: number;
  v2Commits: number;
  dataCommits: number;
}> {
  const normalized = login.toLowerCase();
  const [commits, prs] = await Promise.all([loadAllCommits(), loadAllPRs()]);

  const myCommits = commits.filter((c) => c.login === normalized);
  const myPRs = prs.filter((p) => p.login === normalized);

  const events: HistoryEvent[] = [
    ...myCommits.map((c) => ({
      type: 'commit' as const,
      repo: c.repo,
      repoLabel: c.repoLabel,
      sha: c.sha,
      shortSha: c.sha?.slice(0, 7),
      title: c.title,
      message: c.message,
      date: c.date,
      url: c.url,
    })),
    ...myPRs.map((p) => ({
      type: 'pr' as const,
      repo: p.repo,
      repoLabel: p.repoLabel,
      number: p.number,
      title: p.title,
      state: p.state,
      date: p.date,
      url: p.url,
    })),
  ]
    .filter((e) => e.date && !isNaN(new Date(e.date).getTime()))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    login: myCommits[0]?.displayLogin || login,
    events,
    commitCount: myCommits.length,
    prCount: myPRs.length,
    v2Commits: myCommits.filter((c) => c.repo === 'code').length,
    dataCommits: myCommits.filter((c) => c.repo === 'data').length,
  };
}

export interface ContributionSnapshot {
  login: string;
  name: string;
  avatarUrl: string;
  githubUrl: string;
  role: string;
  department: string;
  departmentLabel: string;
  universityId: string;
  email: string;
  totals: {
    code: number;
    data: number;
    issues: number;
    designs: number;
    prs: number;
    total: number;
  };
  repos: { key: string; label: string; commits: number }[];
  firstContribution: string | null;
  lastContribution: string | null;
  recent: HistoryEvent[];
  generatedAt: string;
}

export async function buildContributionSnapshot(login: string): Promise<ContributionSnapshot | null> {
  const normalized = login.trim().toLowerCase();
  if (!normalized) return null;

  const [{ contributors }, history] = await Promise.all([
    loadContributors(),
    loadContributorHistory(normalized),
  ]);

  const c = contributors.find((x) => x.login.toLowerCase() === normalized);
  if (!c) return null;

  const dates = history.events
    .map((e) => new Date(e.date).getTime())
    .filter((t) => !isNaN(t));
  const first = dates.length ? new Date(Math.min(...dates)).toISOString() : null;
  const last = dates.length ? new Date(Math.max(...dates)).toISOString() : null;

  const totals = {
    code: c.v2Contributions,
    data: c.dataContributions,
    issues: c.issueContributions,
    designs: c.designContributions,
    prs: history.prCount,
    total: c.contributions,
  };

  return {
    login: c.login,
    name: c.name || c.login,
    avatarUrl: c.avatar_url || '',
    githubUrl: c.html_url || `https://github.com/${c.login}`,
    role: c.role || 'Contributor',
    department: c.department || '',
    departmentLabel: c.departmentLabel || c.department || '',
    universityId: c.hideUniversityId ? '' : (c.universityId || ''),
    email: c.hideEmail ? '' : (c.publicEmail || c.email || ''),
    totals,
    repos: [
      { key: 'code', label: 'Source Code', commits: c.v2Contributions },
      { key: 'data', label: 'Academic Files', commits: c.dataContributions },
    ].filter((r) => r.commits > 0),
    firstContribution: first,
    lastContribution: last,
    recent: history.events.slice(0, 8),
    generatedAt: new Date().toISOString(),
  };
}
