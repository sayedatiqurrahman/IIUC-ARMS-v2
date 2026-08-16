'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';

type PermissionsMap = Record<string, string[] | boolean>;

interface CustomRole {
  key: string;
  label: string;
  icon: string;
  color: string;
  permissions: string[];
}

const ADMIN_ROLES = ['admin', 'manager', 'teacher'];

/**
 * Computes the effective permission state for the signed-in user.
 * Mirrors the server-side `hasPermission` logic (lib/permissions.ts) so the
 * client can gate UI (admin panel access, tabs, edit buttons) on the same
 * layers: role-based defaults, the user's assigned custom-role bundle,
 * per-user `customPermissions`, and the per-action email allowlist stored in
 * the site-settings permission map.
 */
export function useUserAccess(
  email: string,
  role: string,
  isCR: boolean,
  customPermissions: Record<string, boolean> = {}
) {
  const [permissions, setPermissions] = useState<PermissionsMap>({});
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [myRole, setMyRole] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetch('/api/settings/permissions')
      .then(r => r.json())
      .then(data => {
        if (!mounted) return;
        setPermissions((data && data.permissions) || {});
        setCustomRoles((data && data.customRoles) || []);
        setMyRole((data && data.myRole) || '');
        setLoading(false);
      })
      .catch(() => {
        if (mounted) {
          setPermissions({});
          setCustomRoles([]);
          setMyRole('');
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [email]);

  const lowerEmail = (email || '').toLowerCase();
  const roleKey = isCR ? 'cr' : role;

  // The custom role bundle assigned to this profile (if profile.role matches a
  // defined custom role) — grants its permission actions on top of defaults.
  const assignedRole = useMemo(
    () => customRoles.find(r => r.key === myRole) || null,
    [customRoles, myRole]
  );

  // Actions explicitly granted to this user (bypasses role-based defaults):
  // custom-role bundle, customPermissions on the profile OR membership in
  // `<action>_users`.
  const explicitGrants = useMemo(() => {
    const granted = new Set<string>();
    for (const p of assignedRole?.permissions || []) granted.add(p);
    for (const [k, v] of Object.entries(customPermissions || {})) {
      if (v === true) granted.add(k);
    }
    for (const [k, v] of Object.entries(permissions)) {
      if (!k.endsWith('_users') || !Array.isArray(v)) continue;
      if (v.includes(lowerEmail)) granted.add(k.slice(0, -6));
    }
    return Array.from(granted);
  }, [assignedRole, customPermissions, permissions, lowerEmail]);

  const has = useCallback(
    (action: string): boolean => {
      const allowedRoles = Array.isArray(permissions[action]) ? (permissions[action] as string[]) : [];
      if (allowedRoles.includes(roleKey)) return true;
      if (assignedRole && assignedRole.permissions.includes(action)) return true;
      if (customPermissions[action] === true) return true;
      const users = permissions[`${action}_users`];
      if (Array.isArray(users) && users.includes(lowerEmail)) return true;
      return false;
    },
    [permissions, roleKey, assignedRole, customPermissions, lowerEmail]
  );

  const hasAdminPanelAccess = ADMIN_ROLES.includes(role) || explicitGrants.length > 0;
  const hasCoursePerms = ['addCourse', 'editCourse', 'deleteCourse', 'saveCourseToGitHub'].some(has);

  return { permissions, customRoles, loading, has, explicitGrants, hasAdminPanelAccess, hasCoursePerms };
}
