import { config } from './config';

const CLUBS_FOLDER = 'clubs';

export interface ClubDataConfig {
  name: string;
  slug: string;
  department: string;
  description?: string;
  logoUrl?: string;
  coverUrl?: string;
  theme?: string;
  createdAt: string;
  createdBy: string;
}

export interface ClubDataMember {
  userId: string;
  role: string;
  name?: string;
  department?: string;
  session?: string;
  joinedAt: string;
  assignedBy?: string;
}

export interface ClubDataEvent {
  id: string;
  title: string;
  description?: string;
  eventDate?: string;
  venue?: string;
  coverUrl?: string;
  createdBy: string;
  createdAt: string;
}

export interface ClubDataCertificate {
  certificateId: string;
  memberName: string;
  universityId: string;
  department: string;
  session?: string;
  post?: string;
  eventName?: string;
  eventId?: string;
  issuedBy: string;
  issuedAt: string;
}

export interface ClubDataClaim {
  userId: string;
  requestedRole: string;
  message?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface ClubDataStore {
  config: ClubDataConfig;
  members: ClubDataMember[];
  events: ClubDataEvent[];
  certificates: ClubDataCertificate[];
  claims: ClubDataClaim[];
}

function headers(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT;
  return {
    Accept: 'application/vnd.github.v3+json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function clubDataPath(slug: string, file: string): string {
  return `${CLUBS_FOLDER}/${slug}/${file}`;
}

export async function readClubFile<T>(slug: string, file: string): Promise<T | null> {
  try {
    const path = clubDataPath(slug, file);
    const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}?ref=${config.branch}`;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.content) return null;
    const decoded = atob(data.content.replace(/\n/g, ''));
    return JSON.parse(decoded) as T;
  } catch {
    return null;
  }
}

export async function writeClubFile<T>(slug: string, file: string, content: T, message: string): Promise<boolean> {
  try {
    const path = clubDataPath(slug, file);
    const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}`;
    const body = JSON.stringify({
      message,
      content: btoa(JSON.stringify(content, null, 2)),
      branch: config.branch,
    });
    const res = await fetch(url, {
      method: 'PUT',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function readClubConfig(slug: string): Promise<ClubDataConfig | null> {
  return readClubFile<ClubDataConfig>(slug, 'config.json');
}

export async function readClubMembers(slug: string): Promise<ClubDataMember[]> {
  return (await readClubFile<ClubDataMember[]>(slug, 'members.json')) || [];
}

export async function readClubEvents(slug: string): Promise<ClubDataEvent[]> {
  return (await readClubFile<ClubDataEvent[]>(slug, 'events.json')) || [];
}

export async function readClubCertificates(slug: string): Promise<ClubDataCertificate[]> {
  return (await readClubFile<ClubDataCertificate[]>(slug, 'certificates.json')) || [];
}

export async function readClubClaims(slug: string): Promise<ClubDataClaim[]> {
  return (await readClubFile<ClubDataClaim[]>(slug, 'claims.json')) || [];
}

export async function writeClubMembers(slug: string, members: ClubDataMember[]): Promise<boolean> {
  return writeClubFile(slug, 'members.json', members, `Update club members: ${slug}`);
}

export async function writeClubEvents(slug: string, events: ClubDataEvent[]): Promise<boolean> {
  return writeClubFile(slug, 'events.json', events, `Update club events: ${slug}`);
}

export async function writeClubCertificates(slug: string, certs: ClubDataCertificate[]): Promise<boolean> {
  return writeClubFile(slug, 'certificates.json', certs, `Update club certificates: ${slug}`);
}

export async function writeClubClaims(slug: string, claims: ClubDataClaim[]): Promise<boolean> {
  return writeClubFile(slug, 'claims.json', claims, `Update club claims: ${slug}`);
}

export async function initClubRepo(slug: string, configData: ClubDataConfig): Promise<boolean> {
  const membersOk = await writeClubMembers(slug, []);
  const eventsOk = await writeClubEvents(slug, []);
  const certsOk = await writeClubCertificates(slug, []);
  const claimsOk = await writeClubClaims(slug, []);
  const configOk = await writeClubFile(slug, 'config.json', configData, `Init club: ${configData.name}`);
  return configOk && membersOk && eventsOk && certsOk && claimsOk;
}

export async function syncClubFromDB(slug: string): Promise<{ synced: boolean; counts: Record<string, number> }> {
  try {
    const { prisma } = await import('./prisma');
    const club = await prisma.club.findUnique({
      where: { slug },
      include: { members: true, events: true, certificates: true, claims: true },
    });
    if (!club) return { synced: false, counts: {} };

    const configData: ClubDataConfig = {
      name: club.name, slug: club.slug, department: club.department,
      description: club.description || undefined,
      logoUrl: club.logoUrl || undefined,
      coverUrl: club.coverUrl || undefined,
      createdAt: club.createdAt.toISOString(),
      createdBy: club.createdBy,
    };

    const members: ClubDataMember[] = club.members.map(m => ({
      userId: m.userId, role: m.role, assignedBy: m.assignedBy || undefined,
      joinedAt: m.createdAt.toISOString(),
    }));

    const events: ClubDataEvent[] = club.events.map(e => ({
      id: e.id, title: e.title, description: e.description || undefined,
      eventDate: e.eventDate?.toISOString(), venue: e.venue || undefined,
      createdBy: e.createdBy, createdAt: e.createdAt.toISOString(),
    }));

    const certificates: ClubDataCertificate[] = club.certificates.map(c => ({
      certificateId: c.certificateId, memberName: c.memberName,
      universityId: c.universityId, department: c.department,
      session: c.session || undefined, post: c.post || undefined,
      eventName: c.eventName || undefined,
      eventId: c.eventId || undefined,
      issuedBy: c.issuedBy, issuedAt: c.issuedAt.toISOString(),
    }));

    const claims: ClubDataClaim[] = club.claims.map(cl => ({
      userId: cl.userId, requestedRole: cl.requestedRole,
      message: cl.message || undefined, status: cl.status as any,
      reviewedBy: cl.reviewedBy || undefined,
      reviewedAt: cl.reviewedAt?.toISOString(),
      createdAt: cl.createdAt.toISOString(),
    }));

    await Promise.all([
      writeClubFile(slug, 'config.json', configData, `Sync club config: ${slug}`),
      writeClubMembers(slug, members),
      writeClubEvents(slug, events),
      writeClubCertificates(slug, certificates),
      writeClubClaims(slug, claims),
    ]);

    return {
      synced: true,
      counts: { members: members.length, events: events.length, certificates: certificates.length, claims: claims.length },
    };
  } catch {
    return { synced: false, counts: {} };
  }
}

export const CLUB_ROLES: Record<string, { label: string; group: string; color: string; icon: string; order: number }> = {
  advisor:        { label: 'Advisor',          group: 'Executive',   color: 'text-amber-400',  icon: 'fa-user-tie',      order: 0 },
  president:      { label: 'President',        group: 'Executive',   color: 'text-red-400',    icon: 'fa-crown',         order: 1 },
  vice_president: { label: 'Vice President',   group: 'Executive',   color: 'text-orange-400', icon: 'fa-user-shield',   order: 2 },
  gs:             { label: 'General Secretary', group: 'Executive',  color: 'text-yellow-400', icon: 'fa-scroll',        order: 3 },
  ags:            { label: 'Assistant GS',     group: 'Executive',   color: 'text-blue-400',   icon: 'fa-user-check',    order: 4 },
  ogs:            { label: 'Office GS',        group: 'Executive',   color: 'text-purple-400', icon: 'fa-envelope',      order: 5 },
  treasurer:      { label: 'Treasurer',        group: 'Finance',     color: 'text-emerald-400', icon: 'fa-coins',        order: 6 },
  finance:        { label: 'Finance Secretary', group: 'Finance',    color: 'text-green-400',  icon: 'fa-money-bill',    order: 7 },
  it_media:       { label: 'IT & Media',       group: 'Operations',  color: 'text-cyan-400',   icon: 'fa-laptop',        order: 8 },
  cultural:       { label: 'Cultural Secretary', group: 'Operations', color: 'text-pink-400',  icon: 'fa-music',         order: 9 },
  publication:    { label: 'Publication',      group: 'Operations',  color: 'text-indigo-400', icon: 'fa-pen-fancy',     order: 10 },
  office_secretary: { label: 'Office Secretary', group: 'Operations', color: 'text-teal-400', icon: 'fa-folder-open',   order: 11 },
  member:         { label: 'Member',           group: 'Members',     color: 'text-dark-text2', icon: 'fa-user',          order: 99 },
};

export function getRoleGroupMembers(members: ClubDataMember[]): Record<string, ClubDataMember[]> {
  const groups: Record<string, ClubDataMember[]> = {};
  for (const m of members) {
    const roleInfo = CLUB_ROLES[m.role] || CLUB_ROLES.member;
    const group = roleInfo.group;
    if (!groups[group]) groups[group] = [];
    groups[group].push(m);
  }
  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => {
      const aOrder = CLUB_ROLES[a.role]?.order ?? 99;
      const bOrder = CLUB_ROLES[b.role]?.order ?? 99;
      return aOrder - bOrder;
    });
  }
  return groups;
}
