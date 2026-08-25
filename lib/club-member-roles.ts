export interface ClubMemberRole {
  key: string;
  label: string;
  icon: string;
  color: string;
  description: string;
}

export const CLUB_MEMBER_ROLES: Record<string, ClubMemberRole> = {
  club_admin: {
    key: 'club_admin',
    label: 'Club Admin',
    icon: 'fas fa-user-shield',
    color: 'text-blue-400',
    description: 'Full control over the club page and settings',
  },
  club_maintainer: {
    key: 'club_maintainer',
    label: 'Maintainer',
    icon: 'fas fa-wrench',
    color: 'text-green-400',
    description: 'Can manage club info, members, and settings',
  },
  club_event_manager: {
    key: 'club_event_manager',
    label: 'Event Manager',
    icon: 'fas fa-calendar-days',
    color: 'text-purple-400',
    description: 'Can create and manage events',
  },
  club_cert_issuer: {
    key: 'club_cert_issuer',
    label: 'Certificate Issuer',
    icon: 'fas fa-award',
    color: 'text-yellow-400',
    description: 'Can issue and manage certificates',
  },
  club_content_manager: {
    key: 'club_content_manager',
    label: 'Content Manager',
    icon: 'fas fa-pen-to-square',
    color: 'text-pink-400',
    description: 'Can create and edit posts',
  },
};

export const CLUB_MEMBER_ROLE_LIST = Object.values(CLUB_MEMBER_ROLES);

export function parseClubRoles(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function hasClubRole(clubRoles: string | null | undefined, role: string): boolean {
  return parseClubRoles(clubRoles).includes(role);
}

export function hasAnyClubRole(clubRoles: string | null | undefined, roles: string[]): boolean {
  const myRoles = parseClubRoles(clubRoles);
  return roles.some(r => myRoles.includes(r));
}
