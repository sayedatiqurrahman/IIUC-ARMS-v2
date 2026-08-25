export interface ClubDataMember {
  userId: string;
  role: string;
  clubRoles?: string | null;
  name?: string;
  department?: string;
  session?: string;
  joinedAt: string;
  assignedBy?: string;
  previousRole?: string;
  previousRoleSession?: string;
  isClubAdmin?: boolean;
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

// Assistant roles that can be numbered (e.g., Asst. Office Secretary 1, 2, 3)
export const ASSISTANT_ROLE_TEMPLATES: Record<string, { label: string; group: string; color: string; icon: string; baseOrder: number }> = {
  asst_office_secretary: { label: 'Asst. Office Secretary', group: 'Operations', color: 'text-teal-400/70', icon: 'fa-folder', baseOrder: 11.1 },
  asst_president:        { label: 'Asst. President',        group: 'Executive',  color: 'text-red-400/70',  icon: 'fa-crown', baseOrder: 1.1 },
  asst_vice_president:   { label: 'Asst. Vice President',   group: 'Executive',  color: 'text-orange-400/70', icon: 'fa-user-shield', baseOrder: 2.1 },
  asst_gs:               { label: 'Asst. General Secretary', group: 'Executive', color: 'text-yellow-400/70', icon: 'fa-scroll', baseOrder: 3.1 },
  asst_treasurer:        { label: 'Asst. Treasurer',        group: 'Finance',    color: 'text-emerald-400/70', icon: 'fa-coins', baseOrder: 6.1 },
  asst_it_media:         { label: 'Asst. IT & Media',       group: 'Operations', color: 'text-cyan-400/70', icon: 'fa-laptop', baseOrder: 8.1 },
  asst_cultural:         { label: 'Asst. Cultural Secretary', group: 'Operations', color: 'text-pink-400/70', icon: 'fa-music', baseOrder: 9.1 },
  asst_publication:      { label: 'Asst. Publication',      group: 'Operations', color: 'text-indigo-400/70', icon: 'fa-pen-fancy', baseOrder: 10.1 },
  asst_finance:          { label: 'Asst. Finance Secretary', group: 'Finance',   color: 'text-green-400/70', icon: 'fa-money-bill', baseOrder: 7.1 },
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

// Get label for any role key (built-in, assistant, or custom)
export function getRoleLabel(roleKey: string, customRoles?: Array<{ key: string; label: string }>): string {
  if (CLUB_ROLES[roleKey]) return CLUB_ROLES[roleKey].label;
  const asstKey = roleKey.replace(/_\d+$/, '');
  if (ASSISTANT_ROLE_TEMPLATES[asstKey]) return ASSISTANT_ROLE_TEMPLATES[asstKey].label + (roleKey !== asstKey ? ' ' + roleKey.split('_').pop() : '');
  const custom = customRoles?.find(r => r.key === roleKey);
  if (custom) return custom.label;
  return roleKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
