import { prisma } from './prisma';
import { Prisma } from '@prisma/client';
import { config } from './config';
import { DEFAULT_PERMISSIONS } from './permission-defaults';

export { DEFAULT_PERMISSIONS };

export interface CustomRole {
  key: string;
  label: string;
  icon: string;
  color: string;
  permissions: string[];
}

let cachedPermissions: Record<string, any> | null = null;
let cachedRoles: CustomRole[] | null = null;
let lastFetch = 0;
const CACHE_TTL = 30_000;

export async function getPermissions(): Promise<Record<string, any>> {
  const now = Date.now();
  if (cachedPermissions && now - lastFetch < CACHE_TTL) return cachedPermissions;
  try {
    const settings = await prisma.siteSettings.findUnique({ where: { id: 'site-settings' } });
    const saved = (settings?.permissions as Record<string, any>) || {};
    const merged: Record<string, any> = {};
    for (const key of Object.keys(DEFAULT_PERMISSIONS)) {
      merged[key] = saved[key] || DEFAULT_PERMISSIONS[key];
      // Preserve the per-email allowlist (`<action>_users`) entries so both the
      // server hasPermission and the client mirror can honour them.
      const perUserKey = `${key}_users`;
      if (Array.isArray(saved[perUserKey])) merged[perUserKey] = saved[perUserKey];
    }
    // Preserve any other saved settings (e.g. restrictCRToOwnSemester) so saving
    // the matrix back never drops them.
    for (const key of Object.keys(saved)) {
      if (!(key in merged)) merged[key] = saved[key];
    }
    cachedPermissions = merged;
  } catch {
    cachedPermissions = DEFAULT_PERMISSIONS;
  }
  lastFetch = now;
  return cachedPermissions;
}

export function invalidatePermissionsCache() {
  cachedPermissions = null;
  cachedRoles = null;
  lastFetch = 0;
}

// Emails the owner has assigned to approve/reject pending accounts. Admins and
// owners can always approve — this list extends that to managers/teachers etc.
export async function getPendingApprovers(): Promise<string[]> {
  try {
    const settings = await prisma.siteSettings.findUnique({ where: { id: 'site-settings' } });
    const perms = (settings?.permissions as Record<string, any>) || {};
    return Array.isArray(perms.pendingApprovers) ? (perms.pendingApprovers as string[]).map(e => String(e).toLowerCase().trim()) : [];
  } catch {
    return [];
  }
}

// Emails that receive the Telegram notification when someone requests access.
// Empty = fall back to all admins.
export async function getPendingNotifTargets(): Promise<string[]> {
  try {
    const settings = await prisma.siteSettings.findUnique({ where: { id: 'site-settings' } });
    const perms = (settings?.permissions as Record<string, any>) || {};
    return Array.isArray(perms.pendingNotifTargets) ? (perms.pendingNotifTargets as string[]).map(e => String(e).toLowerCase().trim()) : [];
  } catch {
    return [];
  }
}

export async function canApprovePending(email: string, role?: string): Promise<boolean> {
  if (!email) return false;
  const lower = email.toLowerCase();
  if (role === 'admin') return true;
  if (config.ownerEmails.some(o => o.toLowerCase() === lower)) return true;
  const approvers = await getPendingApprovers();
  return approvers.includes(lower);
}

export async function getCustomRoles(): Promise<CustomRole[]> {
  const now = Date.now();
  if (cachedRoles && now - lastFetch < CACHE_TTL) return cachedRoles;
  try {
    const settings = await prisma.siteSettings.findUnique({ where: { id: 'site-settings' } });
    const roles = (settings?.customRoles as unknown as CustomRole[]) || [];
    cachedRoles = Array.isArray(roles) ? roles : [];
  } catch {
    cachedRoles = [];
  }
  lastFetch = now;
  return cachedRoles;
}

export async function saveCustomRoles(roles: CustomRole[]): Promise<void> {
  await prisma.siteSettings.upsert({
    where: { id: 'site-settings' },
    create: { id: 'site-settings', customRoles: roles as unknown as Prisma.InputJsonValue },
    update: { customRoles: roles as unknown as Prisma.InputJsonValue },
  });
  invalidatePermissionsCache();
}

// Resolves a profile's custom grants in one pass: the permission bundle of the
// custom role assigned to the profile (if any) plus the per-user customPermissions.
export async function getProfileGrantData(email: string): Promise<{ rolePermissions: string[]; customPermissions: Record<string, boolean> }> {
  try {
    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    const customPermissions = (profile?.customPermissions as Record<string, boolean>) || {};
    let rolePermissions: string[] = [];
    if (profile?.role) {
      const roles = await getCustomRoles();
      const matched = roles.find(r => r.key === profile.role);
      if (matched && Array.isArray(matched.permissions)) rolePermissions = matched.permissions;
    }
    return { rolePermissions, customPermissions };
  } catch {
    return { rolePermissions: [], customPermissions: {} };
  }
}

export async function hasPermission(action: string, role: string, isCR: boolean = false, email?: string): Promise<boolean> {
  const perms = await getPermissions();
  const allowedRoles = perms[action] || DEFAULT_PERMISSIONS[action] || [];
  const roleKey = isCR ? 'cr' : role;
  if (allowedRoles.includes(roleKey)) return true;

  if (email) {
    const { rolePermissions, customPermissions } = await getProfileGrantData(email);
    if (rolePermissions.includes(action)) return true;
    if (customPermissions[action] === true) return true;

    const perUserKey = `${action}_users`;
    const allowedUsers = (perms[perUserKey] as string[]) || [];
    if (allowedUsers.includes(email.toLowerCase())) return true;
  }

  return false;
}

export async function getCustomPermissions(email: string): Promise<Record<string, boolean>> {
  const { customPermissions } = await getProfileGrantData(email);
  return customPermissions;
}

export async function setCustomPermissions(email: string, permissions: Record<string, boolean>): Promise<void> {
  await prisma.profile.upsert({
    where: { userId: email },
    create: { userId: email, email, customPermissions: permissions },
    update: { customPermissions: permissions },
  });
  invalidatePermissionsCache();
}

function semesterIndex(semId: string): number {
  const idx = config.semesters.findIndex(s => s.id === semId);
  return idx >= 0 ? idx : -1;
}

export async function canAddCourseToSemester(
  email: string,
  role: string,
  isCR: boolean,
  isACR: boolean,
  userSemester: string | null,
  userDepartment: string | null,
  targetSemester: string,
  targetDepartment: string
): Promise<{ allowed: boolean; reason?: string }> {
  if (!email) return { allowed: false, reason: 'Please login to add courses.' };

  if (role === 'admin' || role === 'manager' || role === 'teacher') {
    return { allowed: true };
  }

  if (!(await hasPermission('addCourse', role, isCR, email))) {
    return { allowed: false, reason: 'You do not have permission to add courses.' };
  }

  // "Add to Any Semester" lifts the semester restriction for this user.
  if (await hasPermission('addToAnySemester', role, isCR, email)) {
    return { allowed: true };
  }

  const settings = await prisma.siteSettings.findUnique({ where: { id: 'site-settings' } });
  const perms = (settings?.permissions as Record<string, any>) || {};
  const restrictCR = perms.restrictCRToOwnSemester === true;

  if ((isCR || isACR) && !restrictCR) {
    return { allowed: true };
  }

  if (!userSemester) {
    return { allowed: false, reason: 'Your profile does not have a semester set. Please contact admin.' };
  }

  if (userDepartment && targetDepartment !== userDepartment) {
    return { allowed: false, reason: `You can only add courses to your own department (${userDepartment.toUpperCase()}).` };
  }

  const targetIdx = semesterIndex(targetSemester);
  const userIdx = semesterIndex(userSemester);

  if (targetIdx === userIdx || targetIdx === userIdx - 1) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `You can only add courses to your current semester or one previous semester.`,
  };
}

// The semester a relative upload path targets (2nd path segment). Related
// Sources and Related Kitabs are cross-semester folders — never restricted.
export function extractUploadSemester(relPath: string): string {
  const parts = relPath.split('/');
  if (parts.length >= 2 && parts[1] === config.relatedSourcesFolder) return config.relatedSourcesFolder;
  if (parts.length >= 2 && parts[1] === config.relatedKitabsFolder) return config.relatedKitabsFolder;
  return parts[1] || '';
}

export function extractUploadDepartment(relPath: string): string {
  const parts = relPath.split('/');
  return parts[0] || '';
}

// Whether a caller may upload files to the given semester. Admins/managers/
// teachers and holders of the "Add to Any Semester" permission may upload
// anywhere; everyone else stays scoped to their own semester or one previous.
export async function canUploadToSemester(
  email: string,
  role: string,
  isCR: boolean,
  userSemester: string | null,
  targetSemester: string,
  targetDepartment?: string | null,
  userDepartment?: string | null,
): Promise<{ allowed: boolean; reason?: string }> {
  if (role === 'admin' || role === 'manager' || role === 'teacher') {
    return { allowed: true };
  }

  if (!(await hasPermission('uploadFile', role, isCR, email))) {
    return { allowed: false, reason: 'You do not have permission to upload files.' };
  }

  // uploadAnyDepartment = can upload to any department, any semester
  if (await hasPermission('uploadAnyDepartment', role, isCR, email)) {
    return { allowed: true };
  }

  // uploadAnySemester = can upload to any semester within own department
  if (targetSemester === config.relatedSourcesFolder || targetSemester === config.relatedKitabsFolder) {
    return { allowed: true };
  }

  if (await hasPermission('uploadAnySemester', role, isCR, email)) {
    // Check department matches
    if (!targetDepartment || !userDepartment || targetDepartment === userDepartment) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `You can upload to any semester in your department, but not to other departments.`,
    };
  }

  // Legacy: addToAnySemester (kept for backward compat)
  if (await hasPermission('addToAnySemester', role, isCR, email)) {
    return { allowed: true };
  }

  if (!userSemester) {
    return { allowed: false, reason: 'Your profile does not have a semester set. Please contact admin.' };
  }

  const targetIdx = semesterIndex(targetSemester);
  const userIdx = semesterIndex(userSemester);

  if (targetIdx === userIdx || targetIdx === userIdx - 1) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `You can only upload files to your current semester or one previous semester.`,
  };
}

export function getContactInfo(isCR: boolean, isACR: boolean, role: string): string {
  if (role === 'admin') return 'Contact the site owner.';
  if (role === 'teacher') return 'Contact an admin or manager.';
  if (isCR || isACR) return 'Contact your teacher, manager, or admin.';
  return 'Contact your CR, ACR, teacher, manager, or admin.';
}
