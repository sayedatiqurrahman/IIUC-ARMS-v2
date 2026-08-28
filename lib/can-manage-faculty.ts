import { config } from '@/lib/config';
import { hasPermission } from '@/lib/permissions';
import { resolveDepartment } from '@/lib/departments';

/**
 * Whether a caller may manage faculty/staff members.
 * Honours the `manageFaculty` permission (role-based defaults + per-user
 * customPermissions + per-email allowlist) instead of roles alone, so users
 * explicitly granted "Manage Faculty" in the admin panel actually get it.
 * Admins and teachers may manage any department; managers and permission
 * holders stay scoped to their own department when they have one.
 */
export async function canManageFaculty(
  email: string,
  profileRole?: string,
  profileDept?: string,
  targetDept?: string
): Promise<boolean> {
  const role = config.getEffectiveRole(email, profileRole);
  if (!(await hasPermission('manageFaculty', role, false, email))) return false;
  if (role !== 'admin' && role !== 'teacher' && profileDept && targetDept
    && resolveDepartment(profileDept) !== resolveDepartment(targetDept)) return false;
  return true;
}
