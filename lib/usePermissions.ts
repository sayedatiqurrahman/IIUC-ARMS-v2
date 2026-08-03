'use client';
import { useState, useEffect } from 'react';

interface PermissionMap {
  [key: string]: string[];
}

export function usePermissions() {
  const [permissions, setPermissions] = useState<PermissionMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/settings/permissions')
      .then(r => r.json())
      .then(data => {
        setPermissions(data.permissions || {});
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const hasPermission = (action: string, role: string, isCR?: boolean): boolean => {
    const allowedRoles = permissions[action] || [];
    const roleKey = isCR ? 'cr' : role;
    return allowedRoles.includes(roleKey);
  };

  return { permissions, loading, hasPermission };
}
