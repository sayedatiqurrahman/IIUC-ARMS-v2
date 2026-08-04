'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ALL_ROLES, PERMISSION_GROUPS, ALL_PERMISSION_ACTIONS } from './constants';

export default function PermissionsTab() {
  const [permissions, setPermissions] = useState<Record<string, string[] | boolean>>({});
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [scopeUser, setScopeUser] = useState('');
  const [scopeSearch, setScopeSearch] = useState('');
  const [scopePerms, setScopePerms] = useState<Record<string, boolean>>({});
  const [showScopeDropdown, setShowScopeDropdown] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>('courses');
  const scopeDropdownRef = useRef<HTMLDivElement>(null);

  const loadPermissions = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/permissions');
      const data = await res.json();
      if (data.success) setPermissions(data.permissions);
    } catch {}
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (data.users) setAllUsers(data.users);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadPermissions(); }, [loadPermissions]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (scopeDropdownRef.current && !scopeDropdownRef.current.contains(e.target as Node)) {
        setShowScopeDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const flash = (msg: string, type: 'ok' | 'err') => {
    if (type === 'ok') { setSuccess(msg); setTimeout(() => setSuccess(''), 2500); }
    else { setError(msg); setTimeout(() => setError(''), 2500); }
  };

  const savePermissions = async (newPerms: Record<string, string[] | boolean>) => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/permissions', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ permissions: newPerms }) });
      if (res.ok) flash('Saved', 'ok'); else flash('Failed to save', 'err');
    } catch { flash('Network error', 'err'); }
    setSaving(false);
  };

  const toggleRole = async (action: string, role: string) => {
    const current = Array.isArray(permissions[action]) ? permissions[action] as string[] : [];
    const updated = current.includes(role) ? current.filter(r => r !== role) : [...current, role];
    const newPerms = { ...permissions, [action]: updated };
    setPermissions(newPerms);
    await savePermissions(newPerms);
  };

  const toggleAllInGroup = async (groupKey: string, role: string) => {
    const group = PERMISSION_GROUPS.find(g => g.key === groupKey);
    if (!group) return;
    const newPerms = { ...permissions };
    const allEnabled = group.actions.every(a => {
      const arr = Array.isArray(newPerms[a.key]) ? newPerms[a.key] as string[] : [];
      return arr.includes(role);
    });
    for (const action of group.actions) {
      const current = Array.isArray(newPerms[action.key]) ? newPerms[action.key] as string[] : [];
      if (allEnabled) {
        newPerms[action.key] = current.filter(r => r !== role);
      } else if (!current.includes(role)) {
        newPerms[action.key] = [...current, role];
      }
    }
    setPermissions(newPerms);
    await savePermissions(newPerms);
  };

  const filteredUsers = useMemo(() => {
    if (!scopeSearch.trim()) return allUsers.slice(0, 25);
    const q = scopeSearch.toLowerCase();
    return allUsers.filter(u => u.email?.includes(q) || u.name?.toLowerCase().includes(q)).slice(0, 25);
  }, [scopeSearch, allUsers]);

  const selectScopeUser = (user: any) => {
    setScopeUser(user.email);
    setScopeSearch(user.name || user.email);
    setShowScopeDropdown(false);
    setScopePerms(user.customPermissions || {});
  };

  const clearScopeUser = () => {
    setScopeUser('');
    setScopeSearch('');
    setScopePerms({});
    setShowScopeDropdown(false);
  };

  const toggleScopePerm = async (permKey: string) => {
    if (!scopeUser) return;
    const updated = { ...scopePerms, [permKey]: !scopePerms[permKey] };
    setScopePerms(updated);
    setSaving(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setCustomPermissions', targetEmail: scopeUser, customPermissions: updated }),
      });
      if (res.ok) {
        setAllUsers(prev => prev.map(u => u.email === scopeUser ? { ...u, customPermissions: updated } : u));
        flash(`Updated ${scopeUser}`, 'ok');
      } else flash('Failed', 'err');
    } catch { flash('Network error', 'err'); }
    setSaving(false);
  };

  const clearAllScopePerms = async (targetEmail: string = scopeUser) => {
    if (!targetEmail) return;
    setSaving(true);
    try {
      await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setCustomPermissions', targetEmail, customPermissions: {} }),
      });
      setAllUsers(prev => prev.map(u => u.email === targetEmail ? { ...u, customPermissions: {} } : u));
      if (targetEmail === scopeUser) setScopePerms({});
      flash(targetEmail === scopeUser ? 'Cleared all custom permissions' : `Removed ${targetEmail} from custom scopes`, 'ok');
    } catch { flash('Network error', 'err'); }
    setSaving(false);
  };

  const usersWithCustomPerms = useMemo(() => {
    return allUsers.filter(u => u.customPermissions && Object.values(u.customPermissions).some(Boolean));
  }, [allUsers]);

  if (loading) return <div className="text-center py-10"><i className="fas fa-spinner fa-spin text-2xl text-qsis"></i></div>;

  return (
    <div className="space-y-5">
      {/* Toast */}
      {success && <div className="px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-xs"><i className="fas fa-check mr-1"></i>{success}</div>}
      {error && <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs"><i className="fas fa-exclamation-triangle mr-1"></i>{error}</div>}

      {/* Role Permissions - Grouped */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-dark-text"><i className="fas fa-key text-amber-400 mr-2"></i>Role Permissions</h3>
            <p className="text-[0.7rem] text-dark-text3 mt-0.5">Toggle which roles can perform each action</p>
          </div>
          {saving && <span className="text-[0.65rem] text-dark-text3"><i className="fas fa-spinner fa-spin mr-1"></i>Saving...</span>}
        </div>

        <div className="space-y-2">
          {PERMISSION_GROUPS.map(group => {
            const isExpanded = expandedGroup === group.key;
            return (
              <div key={group.key} className="bg-dark-bg2 border border-dark-border rounded-xl overflow-hidden">
                {/* Group Header */}
                <button
                  onClick={() => setExpandedGroup(isExpanded ? null : group.key)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-dark-bg2 hover:bg-dark-bg3 transition-colors cursor-pointer border-none text-left"
                >
                  <i className={`fas ${group.icon} ${group.color}`}></i>
                  <span className="text-[0.82rem] font-semibold text-dark-text flex-1">{group.label}</span>
                  <span className="text-[0.65rem] text-dark-text3 mr-2">{group.actions.length} permissions</span>
                  <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'} text-dark-text3 text-[0.6rem]`}></i>
                </button>

                {/* Group Body */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-2 border-t border-dark-border">
                    {/* Role quick-toggle row */}
                    <div className="flex flex-wrap gap-1.5 pt-3">
                      {ALL_ROLES.map(role => {
                        const enabledCount = group.actions.filter(a => {
                          const arr = Array.isArray(permissions[a.key]) ? permissions[a.key] as string[] : [];
                          return arr.includes(role.key);
                        }).length;
                        const allOn = enabledCount === group.actions.length;
                        return (
                          <button
                            key={role.key}
                            onClick={() => toggleAllInGroup(group.key, role.key)}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[0.68rem] font-medium border cursor-pointer transition-all ${
                              allOn
                                ? 'bg-qsis/15 border-qsis/40 text-qsis'
                                : enabledCount > 0
                                  ? 'bg-qsis/5 border-qsis/20 text-qsis/70'
                                  : 'bg-dark-bg border-dark-border text-dark-text3 hover:border-dark-text3'
                            }`}
                          >
                            <i className={`fas ${role.icon} text-[0.6rem]`}></i>
                            {role.label}
                            {allOn ? <i className="fas fa-check text-[0.55rem] ml-0.5"></i> : enabledCount > 0 && <span className="text-[0.55rem] ml-0.5 opacity-60">{enabledCount}/{group.actions.length}</span>}
                          </button>
                        );
                      })}
                    </div>

                    {/* Individual actions */}
                    {group.actions.map(action => (
                      <div key={action.key} className="flex items-center gap-3 p-2.5 rounded-lg bg-dark-bg border border-dark-border/50">
                        <i className={`fas ${action.icon} ${action.color} text-xs w-4 text-center`}></i>
                        <div className="flex-1 min-w-0">
                          <span className="text-[0.78rem] font-medium text-dark-text">{action.label}</span>
                          <span className="text-[0.65rem] text-dark-text3 ml-2">{action.desc}</span>
                        </div>
                        <div className="flex gap-1">
                          {ALL_ROLES.map(role => {
                            const allowed = Array.isArray(permissions[action.key]) && (permissions[action.key] as string[]).includes(role.key);
                            return (
                              <button
                                key={role.key}
                                onClick={() => toggleRole(action.key, role.key)}
                                className={`w-7 h-7 rounded-md flex items-center justify-center text-[0.6rem] border cursor-pointer transition-all ${
                                  allowed
                                    ? 'bg-qsis/15 border-qsis/40 text-qsis'
                                    : 'bg-dark-bg2 border-dark-border text-dark-text3 hover:border-dark-text3'
                                }`}
                                title={`${allowed ? 'Remove' : 'Grant'} ${role.label}`}
                              >
                                <i className={`fas ${role.icon}`}></i>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* CR Semester Restriction */}
      <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <i className="fas fa-user-lock text-purple-400"></i>
          <span className="text-[0.82rem] font-semibold text-dark-text">Course Addition Restrictions</span>
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${permissions.restrictCRToOwnSemester ? 'bg-qsis' : 'bg-dark-bg border border-dark-border'}`}
            onClick={async () => {
              const newVal = !permissions.restrictCRToOwnSemester;
              const newPerms = { ...permissions, restrictCRToOwnSemester: newVal };
              setPermissions(newPerms);
              await savePermissions(newPerms);
            }}
          >
            <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${permissions.restrictCRToOwnSemester ? 'translate-x-5' : 'translate-x-0.5'}`}></div>
          </div>
          <div>
            <div className="text-xs font-semibold text-dark-text">Restrict CR/ACR to own semester only</div>
            <div className="text-[0.68rem] text-dark-text3">
              {permissions.restrictCRToOwnSemester ? 'CR/ACR can only add courses to their current semester + 1 previous' : 'CR/ACR can add courses to any semester'}
            </div>
          </div>
        </label>
      </div>

      {/* Telegram Notification Settings */}
      <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <i className="fas fa-paper-plane text-cyan-400"></i>
          <span className="text-[0.82rem] font-semibold text-dark-text">Telegram Notifications</span>
        </div>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${permissions.notifyPendingAccounts !== false ? 'bg-qsis' : 'bg-dark-bg border border-dark-border'}`}
              onClick={async () => {
                const newVal = permissions.notifyPendingAccounts === false ? true : false;
                const newPerms = { ...permissions, notifyPendingAccounts: newVal };
                setPermissions(newPerms);
                await savePermissions(newPerms);
              }}
            >
              <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${permissions.notifyPendingAccounts !== false ? 'translate-x-5' : 'translate-x-0.5'}`}></div>
            </div>
            <div>
              <div className="text-xs font-semibold text-dark-text">Notify admins on new pending accounts</div>
              <div className="text-[0.68rem] text-dark-text3">
                {permissions.notifyPendingAccounts !== false
                  ? 'Admins with Telegram connected will be notified when a non-university email signs up'
                  : 'Admins will not receive Telegram notifications for pending accounts'}
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Per-User Permission Scopes */}
      <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <i className="fas fa-user-cog text-blue-400"></i>
          <span className="text-[0.82rem] font-semibold text-dark-text">Per-User Permission Scopes</span>
        </div>
        <p className="text-[0.7rem] text-dark-text3 mb-3">Grant or revoke individual permissions for specific users. Overrides role-based defaults.</p>

        {/* User Search */}
        <div className="relative" ref={scopeDropdownRef}>
          <div className="relative">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-dark-text3 text-[0.7rem]"></i>
            <input
              value={scopeSearch}
              onChange={e => {
                setScopeSearch(e.target.value);
                setShowScopeDropdown(true);
                if (!e.target.value) clearScopeUser();
              }}
              onFocus={() => { if (scopeSearch || allUsers.length) setShowScopeDropdown(true); }}
              placeholder="Search by name or email..."
              className="w-full pl-8 pr-8 py-2.5 bg-dark-bg border border-dark-border rounded-lg text-dark-text text-[0.82rem] outline-none focus:border-qsis"
            />
            {scopeSearch && (
              <button onClick={clearScopeUser} className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-text3 hover:text-dark-text bg-transparent border-none cursor-pointer">
                <i className="fas fa-times text-[0.7rem]"></i>
              </button>
            )}
          </div>

          {/* Dropdown */}
          {showScopeDropdown && filteredUsers.length > 0 && (
            <div className="absolute z-[200] top-full left-0 right-0 mt-1 bg-dark-bg2 border border-dark-border rounded-xl shadow-2xl max-h-64 overflow-y-auto">
              {filteredUsers.map((u, i) => {
                const permCount = u.customPermissions ? Object.values(u.customPermissions).filter(Boolean).length : 0;
                return (
                  <button
                    key={i}
                    onMouseDown={e => { e.preventDefault(); selectScopeUser(u); }}
                    className="w-full text-left px-3 py-2.5 hover:bg-qsis/10 text-dark-text flex items-center gap-2.5 border-none bg-transparent cursor-pointer transition-colors border-b border-dark-border/30 last:border-0"
                  >
                    {u.githubAvatar ? <img src={u.githubAvatar} className="w-6 h-6 rounded-full" alt="" /> : <div className="w-6 h-6 rounded-full bg-dark-bg3 flex items-center justify-center"><i className="fas fa-user text-dark-text3 text-[0.55rem]"></i></div>}
                    <div className="flex-1 min-w-0">
                      <div className="text-[0.78rem] font-semibold truncate">{u.name || u.email}</div>
                      <div className="text-[0.65rem] text-dark-text3 truncate">{u.email}</div>
                    </div>
                    <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-dark-bg border border-dark-border text-dark-text3">{u.role || 'user'}</span>
                    {permCount > 0 && <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-qsis/15 text-qsis border border-qsis/30"><i className="fas fa-key mr-0.5"></i>{permCount}</span>}
                  </button>
                );
              })}
            </div>
          )}
          {showScopeDropdown && scopeSearch && filteredUsers.length === 0 && (
            <div className="absolute z-[200] top-full left-0 right-0 mt-1 bg-dark-bg2 border border-dark-border rounded-xl shadow-2xl p-4 text-center">
              <p className="text-dark-text3 text-[0.75rem]">No users found</p>
            </div>
          )}
        </div>

        {/* Selected User Permissions */}
        {scopeUser && (
          <div className="mt-4 p-4 bg-dark-bg border border-dark-border rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <i className="fas fa-user text-qsis text-xs"></i>
                <span className="text-[0.78rem] font-semibold text-dark-text">{scopeUser}</span>
                {Object.values(scopePerms).some(Boolean) && (
                  <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-qsis/15 text-qsis border border-qsis/20">
                    {Object.values(scopePerms).filter(Boolean).length} custom
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {Object.values(scopePerms).some(Boolean) && (
                  <button onClick={() => clearAllScopePerms()} className="text-[0.68rem] text-red-400 hover:text-red-300 bg-transparent border-none cursor-pointer">
                    <i className="fas fa-times mr-0.5"></i>Clear all
                  </button>
                )}
                <button onClick={clearScopeUser} className="text-[0.68rem] text-dark-text3 hover:text-dark-text bg-transparent border-none cursor-pointer">
                  <i className="fas fa-times-circle"></i>
                </button>
              </div>
            </div>

            {/* Grouped permission toggles */}
            <div className="space-y-3">
              {PERMISSION_GROUPS.map(group => (
                <div key={group.key}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <i className={`fas ${group.icon} ${group.color} text-[0.6rem]`}></i>
                    <span className="text-[0.7rem] font-semibold text-dark-text2">{group.label}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {group.actions.map(action => {
                      const enabled = !!scopePerms[action.key];
                      return (
                        <button
                          key={action.key}
                          onClick={() => toggleScopePerm(action.key)}
                          className={`flex items-center gap-1.5 p-2 rounded-lg border text-left cursor-pointer transition-all ${
                            enabled
                              ? 'bg-qsis/10 border-qsis/40 text-dark-text'
                              : 'bg-dark-bg2 border-dark-border text-dark-text3 hover:border-dark-text3'
                          }`}
                        >
                          <i className={`fas ${action.icon} ${enabled ? action.color : 'text-dark-text3'} text-[0.6rem]`}></i>
                          <span className="text-[0.7rem] font-medium flex-1 truncate">{action.label}</span>
                          {enabled ? <i className="fas fa-check-circle text-green-400 text-[0.55rem]"></i> : <i className="fas fa-circle text-dark-border text-[0.55rem]"></i>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Users with custom scopes */}
        {usersWithCustomPerms.length > 0 && (
          <div className="mt-4 border-t border-dark-border pt-3">
            <div className="text-[0.72rem] text-dark-text3 mb-2"><i className="fas fa-list mr-1"></i>Users with custom scopes ({usersWithCustomPerms.length})</div>
            <div className="space-y-1.5">
              {usersWithCustomPerms.map((u, i) => {
                const granted = Object.entries(u.customPermissions || {}).filter(([, v]) => v).map(([k]) => k);
                return (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-dark-bg border border-dark-border hover:border-dark-border2 transition-colors">
                    {u.githubAvatar ? <img src={u.githubAvatar} className="w-5 h-5 rounded-full" alt="" /> : <div className="w-5 h-5 rounded-full bg-dark-bg3 flex items-center justify-center"><i className="fas fa-user text-dark-text3 text-[0.5rem]"></i></div>}
                    <div className="flex-1 min-w-0">
                      <span className="text-[0.72rem] font-semibold text-dark-text">{u.name || u.email}</span>
                      <span className="text-[0.6rem] text-dark-text3 ml-1.5">{u.email}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {granted.slice(0, 3).map(pk => {
                        const pa = ALL_PERMISSION_ACTIONS.find(a => a.key === pk);
                        return pa ? <span key={pk} className="text-[0.58rem] px-1.5 py-0.5 rounded bg-qsis/10 text-qsis border border-qsis/20">{pa.label}</span> : null;
                      })}
                      {granted.length > 3 && <span className="text-[0.58rem] px-1.5 py-0.5 rounded bg-dark-bg border border-dark-border text-dark-text3">+{granted.length - 3}</span>}
                    </div>
                    <button onClick={() => selectScopeUser(u)} className="text-qsis hover:text-qsis/80 bg-transparent border-none cursor-pointer text-[0.68rem]" title="Edit custom scopes"><i className="fas fa-edit"></i></button>
                    <button onClick={() => clearAllScopePerms(u.email)} disabled={saving} className="text-red-400/80 hover:text-red-400 bg-transparent border-none cursor-pointer text-[0.68rem] disabled:opacity-50" title="Remove all custom scopes"><i className="fas fa-times"></i></button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
