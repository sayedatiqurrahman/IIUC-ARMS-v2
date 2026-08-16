'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';

type PermissionsMap = Record<string, string[] | boolean>;

const ADMIN_ROLES = ['admin', 'manager', 'teacher'];

/**
 * Computes the effective permission state for the signed-in user.
 * Mirrors the server-side `hasPermission` logic (lib/permissions.ts) so the
 * client can gate UI (admin panel access, tabs, edit buttons) on the same
 * three layers: role-based defaults, per-user `customPermissions`, and the
 * per-action email allowlist stored in the site-settings permission map.
 */
export function useUserAccess(
  email: string,
  role: string,
  isCR: boolean,
  customPermissions: Record<string, boolean> = {}
) {
  const [permissions, setPermissions] = useState<PermissionsMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetch('/api/settings/permissions')
      .then(r => r.json())
      .then(data => {
        if (!mounted) return;
        setPermissions((data && data.permissions) || {});
        setLoading(false);
      })
      .catch(() => {
        if (mounted) {
          setPermissions({});
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [email]);

  const lowerEmail = (email || '').toLowerCase();
  const roleKey = isCR ? 'cr' : role;

  // Actions explicitly granted to this user (bypasses role-based defaults):
  // customPermissions on the profile OR membership in `<action>_users`.
  const explicitGrants = useMemo(() => {
    const granted = new Set<string>();
    for (const [k, v] of Object.entries(customPermissions || {})) {
      if (v === true) granted.add(k);
    }
    for (const [k, v] of Object.entries(permissions)) {
      if (!k.endsWith('_users') || !Array.isArray(v)) continue;
      if (v.includes(lowerEmail)) granted.add(k.slice(0, -6));
    }
    return Array.from(granted);
  }, [customPermissions, permissions, lowerEmail]);

  const has = useCallback(
    (action: string): boolean => {
      const allowedRoles = Array.isArray(permissions[action]) ? (permissions[action] as string[]) : [];
      if (allowedRoles.includes(roleKey)) return true;
      if (customPermissions[action] === true) return true;
      const users = permissions[`${action}_users`];
      if (Array.isArray(users) && users.includes(lowerEmail)) return true;
      return false;
    },
    [permissions, roleKey, customPermissions, lowerEmail]
  );

  const hasAdminPanelAccess = ADMIN_ROLES.includes(role) || explicitGrants.length > 0;
  const hasCoursePerms = ['addCourse', 'editCourse', 'deleteCourse', 'saveCourseToGitHub'].some(has);

  return { permissions, loading, has, explicitGrants, hasAdminPanelAccess, hasCoursePerms };
}
