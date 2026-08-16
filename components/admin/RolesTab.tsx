'use client';

import { useState, useEffect, useCallback } from 'react';
import { PERMISSION_GROUPS } from './constants';
import { showToast } from '@/lib/utils';

interface CustomRole {
  key: string;
  label: string;
  icon: string;
  color: string;
  permissions: string[];
}

const COLOR_OPTIONS = [
  { value: 'text-blue-400', label: 'Blue' },
  { value: 'text-green-400', label: 'Green' },
  { value: 'text-cyan-400', label: 'Cyan' },
  { value: 'text-purple-400', label: 'Purple' },
  { value: 'text-pink-400', label: 'Pink' },
  { value: 'text-amber-400', label: 'Amber' },
  { value: 'text-teal-400', label: 'Teal' },
  { value: 'text-orange-400', label: 'Orange' },
  { value: 'text-red-400', label: 'Red' },
  { value: 'text-indigo-400', label: 'Indigo' },
];

const ICON_OPTIONS = [
  'fa-user-tag', 'fa-shield-alt', 'fa-star', 'fa-bolt', 'fa-key',
  'fa-users', 'fa-user-shield', 'fa-chalkboard-teacher', 'fa-book', 'fa-building',
];

const EMPTY_DRAFT: CustomRole = { key: '', label: '', icon: 'fa-user-tag', color: 'text-blue-400', permissions: [] };

export default function RolesTab() {
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<CustomRole>(EMPTY_DRAFT);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/roles');
      const data = await res.json();
      if (data.success) setRoles(data.roles || []);
    } catch {}
    try {
      const res = await fetch('/api/admin/users?limit=1000');
      const data = await res.json();
      if (data.users) setUsers(data.users);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);

  const saveRole = async () => {
    if (!draft.label.trim()) { showToast('Role name is required', 'error'); return; }
    const key = slugify(draft.label);
    if (!key) { showToast('Role name must contain letters or numbers', 'error'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: { ...draft, key } }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        setDraft(EMPTY_DRAFT);
        setEditingKey(null);
        setExpandedRole(key);
        load();
      } else {
        showToast(data.error || 'Failed to save', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    }
    setSaving(false);
  };

  const deleteRole = async (key: string) => {
    if (!window.confirm('Delete this role? Users assigned to it will fall back to their base role.')) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/roles?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        if (editingKey === key) { setEditingKey(null); setDraft(EMPTY_DRAFT); }
        setExpandedRole(null);
        load();
      } else {
        showToast(data.error || 'Failed to delete', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    }
    setSaving(false);
  };

  const startEdit = (r: CustomRole) => {
    setEditingKey(r.key);
    setDraft({ ...r });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetDraft = () => { setEditingKey(null); setDraft(EMPTY_DRAFT); };

  const togglePerm = (key: string) => {
    setDraft(d => ({ ...d, permissions: d.permissions.includes(key) ? d.permissions.filter(p => p !== key) : [...d.permissions, key] }));
  };

  const toggleGroup = (groupActions: string[]) => {
    const allOn = groupActions.every(a => draft.permissions.includes(a));
    setDraft(d => ({ ...d, permissions: allOn ? d.permissions.filter(p => !groupActions.includes(p)) : Array.from(new Set([...d.permissions, ...groupActions])) }));
  };

  const countFor = (key: string) => users.filter(u => u.role === key).length;

  if (loading) return <div className="text-center py-10"><i className="fas fa-spinner fa-spin text-2xl text-qsis"></i></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-dark-text"><i className="fas fa-user-tag text-blue-400 mr-2"></i>Custom Roles</h3>
          <p className="text-[0.7rem] text-dark-text3 mt-0.5">Create role bundles with any combination of permissions, then assign them to users. Custom roles stack on top of the role defaults and per-user scopes.</p>
        </div>
        {saving && <span className="text-[0.65rem] text-dark-text3"><i className="fas fa-spinner fa-spin mr-1"></i>Saving...</span>}
      </div>

      {/* Create / Edit Role */}
      <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-[0.82rem] font-semibold text-dark-text">
            <i className={`fas ${editingKey ? 'fa-edit' : 'fa-plus-circle'} text-qsis mr-1.5`}></i>
            {editingKey ? `Edit Role — ${draft.label}` : 'Create New Role'}
          </h4>
          {editingKey && (
            <button onClick={resetDraft} className="text-[0.68rem] text-dark-text3 hover:text-dark-text bg-transparent border-none cursor-pointer"><i className="fas fa-times mr-0.5"></i>Cancel edit</button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          <div>
            <label className="text-[0.7rem] text-dark-text2 block mb-1">Role Name *</label>
            <input
              type="text"
              value={draft.label}
              onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
              placeholder="e.g. Moderator, Library Assistant..."
              className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis"
            />
            {draft.label.trim() && (
              <p className="text-[0.6rem] text-dark-text3 mt-1">Key: <code className="bg-dark-bg px-1 rounded text-qsis">{slugify(draft.label) || '—'}</code></p>
            )}
          </div>
          <div>
            <label className="text-[0.7rem] text-dark-text2 block mb-1">Color</label>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_OPTIONS.map(c => (
                <button
                  key={c.value}
                  onClick={() => setDraft(d => ({ ...d, color: c.value }))}
                  className={`w-7 h-7 rounded-lg border cursor-pointer transition-all ${draft.color === c.value ? 'border-dark-text bg-dark-bg' : 'border-dark-border bg-dark-bg3'}`}
                  title={c.label}
                >
                  <i className={`fas fa-circle text-[0.5rem] ${c.value}`}></i>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[0.7rem] text-dark-text2 block mb-1">Icon</label>
            <div className="flex flex-wrap gap-1.5">
              {ICON_OPTIONS.map(ic => (
                <button
                  key={ic}
                  onClick={() => setDraft(d => ({ ...d, icon: ic }))}
                  className={`w-7 h-7 rounded-lg border cursor-pointer transition-all flex items-center justify-center ${draft.icon === ic ? 'border-qsis bg-qsis/10 text-qsis' : 'border-dark-border bg-dark-bg3 text-dark-text3 hover:text-dark-text'}`}
                >
                  <i className={`fas ${ic} text-[0.6rem]`}></i>
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-end">
            <button onClick={saveRole} disabled={saving || !draft.label.trim()} className="w-full px-3 py-2 rounded-lg bg-qsis text-white text-[0.78rem] font-semibold cursor-pointer hover:opacity-90 border-none disabled:opacity-50">
              {saving ? <><i className="fas fa-spinner fa-spin mr-1"></i>Saving...</> : <><i className={`fas ${editingKey ? 'fa-save' : 'fa-plus'} mr-1`}></i>{editingKey ? 'Save Role' : 'Create Role'}</>}
            </button>
          </div>
        </div>

        {draft.label.trim() && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-[0.7rem] font-semibold text-dark-text2`}><i className={`fas ${draft.icon} ${draft.color} mr-1.5`}></i>Permissions</span>
              <span className="text-[0.65rem] text-dark-text3">{draft.permissions.length} selected</span>
            </div>
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {PERMISSION_GROUPS.map(group => {
                const allOn = group.actions.every(a => draft.permissions.includes(a.key));
                return (
                  <div key={group.key} className="rounded-lg bg-dark-bg border border-dark-border/60 p-2.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`text-[0.72rem] font-semibold text-dark-text2`}><i className={`fas ${group.icon} ${group.color} mr-1.5 text-[0.6rem]`}></i>{group.label}</span>
                      <button onClick={() => toggleGroup(group.actions.map(a => a.key))} className={`text-[0.62rem] cursor-pointer bg-transparent border-none ${allOn ? 'text-qsis' : 'text-dark-text3 hover:text-dark-text'}`}>
                        <i className={`fas ${allOn ? 'fa-check-circle' : 'fa-circle'} mr-0.5`}></i>{allOn ? 'All granted' : 'Grant all'}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {group.actions.map(action => {
                        const on = draft.permissions.includes(action.key);
                        return (
                          <button
                            key={action.key}
                            onClick={() => togglePerm(action.key)}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border cursor-pointer transition-all text-[0.68rem] ${
                              on ? 'bg-qsis/10 border-qsis/40 text-dark-text' : 'bg-dark-bg2 border-dark-border text-dark-text3 hover:border-dark-text3'
                            }`}
                            title={action.desc}
                          >
                            <i className={`fas ${action.icon} ${on ? action.color : 'text-dark-text3'} text-[0.55rem]`}></i>
                            {action.label}
                            {on && <i className="fas fa-check text-[0.5rem] text-green-400"></i>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Role List */}
      {roles.length === 0 ? (
        <div className="bg-dark-bg2 border border-dark-border rounded-xl p-8 text-center">
          <i className="fas fa-user-tag text-3xl text-dark-text3 mb-3 block"></i>
          <p className="text-[0.9rem] text-dark-text2">No custom roles yet</p>
          <p className="text-[0.75rem] text-dark-text3 mt-1">Create your first role above to bundle permissions for users.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {roles.map(role => {
            const isExpanded = expandedRole === role.key;
            const count = countFor(role.key);
            return (
              <div key={role.key} className="bg-dark-bg2 border border-dark-border rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-9 h-9 rounded-full bg-dark-bg3 border border-dark-border flex items-center justify-center">
                    <i className={`fas ${role.icon} ${role.color} text-[0.8rem]`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[0.82rem] font-semibold text-dark-text">{role.label}</span>
                      <code className="text-[0.58rem] px-1.5 py-0.5 rounded bg-dark-bg border border-dark-border text-dark-text3">{role.key}</code>
                    </div>
                    <p className="text-[0.65rem] text-dark-text3">
                      <span className={count > 0 ? 'text-qsis font-semibold' : ''}>{count} user{count === 1 ? '' : 's'}</span> assigned · {role.permissions.length} permission{role.permissions.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={() => setExpandedRole(isExpanded ? null : role.key)} className="px-2.5 py-1.5 rounded-lg bg-dark-bg text-dark-text2 text-[0.68rem] font-semibold cursor-pointer hover:text-dark-text border border-dark-border">
                      {isExpanded ? 'Hide' : 'View'}
                    </button>
                    <button onClick={() => startEdit(role)} className="px-2.5 py-1.5 rounded-lg bg-dark-bg text-dark-text2 text-[0.68rem] font-semibold cursor-pointer hover:text-qsis border border-dark-border" title="Edit role">
                      <i className="fas fa-pen"></i>
                    </button>
                    <button onClick={() => deleteRole(role.key)} disabled={saving} className="px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-[0.68rem] cursor-pointer hover:bg-red-500/20 border-none disabled:opacity-50" title="Delete role">
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="px-4 pb-3 border-t border-dark-border pt-3">
                    <div className="flex flex-wrap gap-1.5">
                      {role.permissions.length === 0 && <span className="text-[0.7rem] text-dark-text3">No permissions granted</span>}
                      {PERMISSION_GROUPS.flatMap(g => g.actions).filter(a => role.permissions.includes(a.key)).map(a => (
                        <span key={a.key} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-qsis/10 border border-qsis/20 text-[0.66rem] text-dark-text">
                          <i className={`fas ${a.icon} ${a.color} text-[0.55rem]`}></i>{a.label}
                        </span>
                      ))}
                    </div>
                    {count > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {users.filter(u => u.role === role.key).map(u => (
                          <span key={u.email} className="text-[0.6rem] px-2 py-0.5 rounded-full bg-dark-bg border border-dark-border text-dark-text2 truncate max-w-[200px]">
                            {u.name || u.email}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
