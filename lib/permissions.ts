import { prisma } from './prisma';
import { config } from './config';
import { DEFAULT_PERMISSIONS } from './permission-defaults';

export { DEFAULT_PERMISSIONS };

let cachedPermissions: Record<string, string[]> | null = null;
let lastFetch = 0;
const CACHE_TTL = 30_000;

export async function getPermissions(): Promise<Record<string, string[]>> {
  const now = Date.now();
  if (cachedPermissions && now - lastFetch < CACHE_TTL) return cachedPermissions;
  try {
    const settings = await prisma.siteSettings.findUnique({ where: { id: 'site-settings' } });
    const saved = (settings?.permissions as Record<string, string[]>) || {};
    const merged: Record<string, string[]> = {};
    for (const key of Object.keys(DEFAULT_PERMISSIONS)) {
      merged[key] = saved[key] || DEFAULT_PERMISSIONS[key];
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
  lastFetch = 0;
}

export async function hasPermission(action: string, role: string, isCR: boolean = false, email?: string): Promise<boolean> {
  const perms = await getPermissions();
  const allowedRoles = perms[action] || DEFAULT_PERMISSIONS[action] || [];
  const roleKey = isCR ? 'cr' : role;
  if (allowedRoles.includes(roleKey)) return true;

  if (email) {
    const custom = await getCustomPermissions(email);
    if (custom[action] === true) return true;

    const perUserKey = `${action}_users`;
    const allowedUsers = (perms[perUserKey] as string[]) || [];
    if (allowedUsers.includes(email.toLowerCase())) return true;
  }

  return false;
}

export async function getCustomPermissions(email: string): Promise<Record<string, boolean>> {
  try {
    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    return (profile?.customPermissions as Record<string, boolean>) || {};
  } catch {
    return {};
  }
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

export function getContactInfo(isCR: boolean, isACR: boolean, role: string): string {
  if (role === 'admin') return 'Contact the site owner.';
  if (role === 'teacher') return 'Contact an admin or manager.';
  if (isCR || isACR) return 'Contact your teacher, manager, or admin.';
  return 'Contact your CR, ACR, teacher, manager, or admin.';
}
