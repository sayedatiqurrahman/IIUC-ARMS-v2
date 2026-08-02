'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { config } from '@/lib/config';
import { showToast } from '@/lib/utils';
import { useAppStore } from '@/lib/store';
import { FACULTIES, TEACHER_TITLES, STAFF_DESIGNATIONS } from '@/lib/departments';
import CustomSelect from '@/components/CustomSelect';
import { useConfirm } from '@/components/ConfirmModal';

interface UserRecord {
  email: string;
  name: string;
  role: string | null;
  title?: string;
  isBanned?: boolean;
  banReason?: string | null;
  bannedBy?: string | null;
  isCR?: boolean;
  isACR?: boolean;
  githubLogin?: string;
  githubAvatar?: string;
  image?: string;
  universityId?: string;
  semester?: string;
  section?: string;
  lastSignIn?: string;
  department?: string;
  providers?: string[];
  hasProfile?: boolean;
}

interface ActivityLog {
  id: string;
  action: string;
  details: string;
  userId: string;
  userName: string | null;
  createdAt: string;
}

interface AdminStats {
  total: number;
  admins: number;
  teachers: number;
  students: number;
  users: number;
  banned: number;
}

type Tab = 'overview' | 'admins' | 'managers' | 'teachers' | 'students' | 'users' | 'activity' | 'faculty' | 'courses' | 'permissions' | 'telegram' | 'contributors';

const ALL_ROLES = [
  { key: 'admin', label: 'Admin', icon: 'fa-crown', color: 'text-red-400' },
  { key: 'manager', label: 'Manager', icon: 'fa-user-shield', color: 'text-orange-400' },
  { key: 'teacher', label: 'Teacher', icon: 'fa-chalkboard-teacher', color: 'text-green-400' },
  { key: 'cr', label: 'CR', icon: 'fa-user-check', color: 'text-blue-400' },
  { key: 'student', label: 'Student', icon: 'fa-user-graduate', color: 'text-cyan-400' },
  { key: 'user', label: 'User', icon: 'fa-user', color: 'text-dark-text2' },
];

const PERMISSION_ACTIONS = [
  { key: 'addCourse', label: 'Add Course', desc: 'Create new course codes in semesters', icon: 'fa-book-medical', color: 'text-indigo-400' },
  { key: 'editCourse', label: 'Edit Course', desc: 'Edit course titles', icon: 'fa-edit', color: 'text-blue-400' },
  { key: 'deleteCourse', label: 'Delete Course', desc: 'Remove courses from semesters', icon: 'fa-trash', color: 'text-red-400' },
  { key: 'uploadFile', label: 'Upload Files', desc: 'Upload notes, sheets, questions to courses', icon: 'fa-cloud-upload-alt', color: 'text-green-400' },
  { key: 'editLinks', label: 'Edit Shared Links', desc: 'Add/edit/remove shared links in courses', icon: 'fa-link', color: 'text-pink-400' },
  { key: 'moveFile', label: 'Move Files', desc: 'Move files and folders to other locations', icon: 'fa-arrows-alt', color: 'text-cyan-400' },
  { key: 'copyFile', label: 'Copy Files', desc: 'Copy files to other locations', icon: 'fa-copy', color: 'text-teal-400' },
  { key: 'renameFile', label: 'Rename Files', desc: 'Rename files and folders', icon: 'fa-i-cursor', color: 'text-amber-400' },
  { key: 'deleteFile', label: 'Delete Files', desc: 'Delete files and folders permanently', icon: 'fa-times-circle', color: 'text-red-500' },
  { key: 'manageFaculty', label: 'Manage Faculty', desc: 'Add/edit/delete faculty & staff members', icon: 'fa-building', color: 'text-teal-400' },
  { key: 'publishRoutine', label: 'Publish Routine', desc: 'Publish class routines for departments', icon: 'fa-calendar-check', color: 'text-purple-400' },
  { key: 'manageBatches', label: 'Manage Batches', desc: 'Create/edit student batches for seat plan auto-allocation', icon: 'fa-layer-group', color: 'text-indigo-400' },
  { key: 'manageUsers', label: 'Manage Users', desc: 'Ban, promote, or change user roles', icon: 'fa-users-cog', color: 'text-orange-400' },
  { key: 'manageSettings', label: 'Manage Settings', desc: 'Change site settings and permissions', icon: 'fa-cog', color: 'text-yellow-400' },
];

interface ContributorSettings {
  hiddenLogins: string[];
  sortBy: 'contributions' | 'name' | 'commits' | 'prs';
  viewMode: 'sectioned' | 'grid';
  sectionCount: 2 | 3;
  showRanks: boolean;
  showStats: boolean;
  showDeptFilter: boolean;
  showSearch: boolean;
  showOnlyCommitters: boolean;
  allowUserToggle: boolean;
}

const DEFAULT_SETTINGS: ContributorSettings = {
  hiddenLogins: [],
  sortBy: 'contributions',
  viewMode: 'sectioned',
  sectionCount: 3,
  showRanks: true,
  showStats: true,
  showDeptFilter: true,
  showSearch: true,
  showOnlyCommitters: true,
  allowUserToggle: true,
};

interface ContributorItem {
  login: string;
  name: string;
  title: string;
  avatar_url: string;
  html_url: string;
  contributions: number;
  v2Contributions: number;
  dataContributions: number;
  prCount: number;
  role: string;
  roleType: string;
  department: string;
  source: string;
}

function ContributorsTab() {
  const [contributors, setContributors] = useState<ContributorItem[]>([]);
  const [settings, setSettings] = useState<ContributorSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/contributors');
      if (res.ok) {
        const data = await res.json();
        setContributors(data.contributors || []);
        if (data.settings) setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (newSettings: ContributorSettings) => {
    setSettings(newSettings);
    setSaving(true);
    try {
      await fetch('/api/settings/contributors', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      });
    } catch {}
    setSaving(false);
  };

  const toggleHide = (login: string) => {
    const hidden = settings.hiddenLogins.includes(login)
      ? settings.hiddenLogins.filter(l => l !== login)
      : [...settings.hiddenLogins, login];
    save({ ...settings, hiddenLogins: hidden });
  };

  const showAll = () => save({ ...settings, hiddenLogins: [] });
  const hideAll = () => save({ ...settings, hiddenLogins: contributors.map(c => c.login) });

  const filtered = contributors.filter(c =>
    !filter || c.login.toLowerCase().includes(filter.toLowerCase()) || c.name.toLowerCase().includes(filter.toLowerCase())
  );

  const totalCommits = contributors.reduce((s, c) => s + c.v2Contributions + c.dataContributions, 0);
  const totalPRs = contributors.reduce((s, c) => s + c.prCount, 0);
  const visibleCount = contributors.filter(c => !settings.hiddenLogins.includes(c.login)).length;

  if (loading) {
    return (
      <div className="text-center py-10">
        <i className="fas fa-spinner fa-spin text-2xl text-qsis"></i>
        <p className="text-dark-text2 mt-2 text-sm">Loading contributors...</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-dark-text mb-3">
        <i className="fas fa-users text-teal-400 mr-2"></i>Contributors Management
      </h3>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-gradient-to-br from-teal-500/10 to-teal-500/5 border border-dark-border rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-dark-text">{contributors.length}</p>
          <p className="text-[0.65rem] text-dark-text3">Total</p>
        </div>
        <div className="bg-gradient-to-br from-green-500/10 to-green-500/5 border border-dark-border rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-green-400">{visibleCount}</p>
          <p className="text-[0.65rem] text-dark-text3">Visible</p>
        </div>
        <div className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border border-dark-border rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-blue-400">{totalCommits}</p>
          <p className="text-[0.65rem] text-dark-text3">Commits</p>
        </div>
        <div className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border border-dark-border rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-purple-400">{totalPRs}</p>
          <p className="text-[0.65rem] text-dark-text3">PRs</p>
        </div>
      </div>

      {/* Settings */}
      <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-[0.8rem] font-semibold text-dark-text">
            <i className="fas fa-cog text-qsis mr-1"></i>Display Settings {saving && <span className="text-dark-text3 text-[0.65rem] ml-1">(saving...)</span>}
          </h4>
          <div className="flex gap-2">
            <button onClick={showAll} className="text-[0.7rem] px-2 py-1 rounded bg-dark-bg3 text-green-400 hover:bg-green-500/20 cursor-pointer border-none">
              <i className="fas fa-eye mr-1"></i>Show All
            </button>
            <button onClick={hideAll} className="text-[0.7rem] px-2 py-1 rounded bg-dark-bg3 text-red-400 hover:bg-red-500/20 cursor-pointer border-none">
              <i className="fas fa-eye-slash mr-1"></i>Hide All
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Sort By */}
          <div>
            <label className="text-[0.65rem] text-dark-text3 block mb-1">Sort By</label>
            <select
              value={settings.sortBy}
              onChange={e => save({ ...settings, sortBy: e.target.value as any })}
              className="w-full px-2 py-1.5 text-[0.75rem] bg-dark-bg3 border border-dark-border rounded-lg text-dark-text cursor-pointer"
            >
              <option value="contributions">Total Contributions</option>
              <option value="commits">Commits</option>
              <option value="prs">Pull Requests</option>
              <option value="name">Name</option>
            </select>
          </div>

          {/* View Mode */}
          <div>
            <label className="text-[0.65rem] text-dark-text3 block mb-1">View Mode</label>
            <select
              value={settings.viewMode}
              onChange={e => save({ ...settings, viewMode: e.target.value as any })}
              className="w-full px-2 py-1.5 text-[0.75rem] bg-dark-bg3 border border-dark-border rounded-lg text-dark-text cursor-pointer"
            >
              <option value="sectioned">Sectioned (by role)</option>
              <option value="grid">Grid (all ranked together)</option>
            </select>
          </div>

          {/* Section Count (only when sectioned) */}
          {settings.viewMode === 'sectioned' && (
            <div>
              <label className="text-[0.65rem] text-dark-text3 block mb-1">Sections</label>
              <select
                value={settings.sectionCount}
                onChange={e => save({ ...settings, sectionCount: Number(e.target.value) as 2 | 3 })}
                className="w-full px-2 py-1.5 text-[0.75rem] bg-dark-bg3 border border-dark-border rounded-lg text-dark-text cursor-pointer"
              >
                <option value={3}>3 (Both + Dev + Resource)</option>
                <option value={2}>2 (Dev + Resource)</option>
              </select>
            </div>
          )}

          {/* Toggles */}
          {[
            { key: 'showRanks', label: 'Show Ranks', icon: 'fa-trophy' },
            { key: 'showStats', label: 'Show Stats', icon: 'fa-chart-bar' },
            { key: 'showDeptFilter', label: 'Dept Filter', icon: 'fa-filter' },
            { key: 'showSearch', label: 'Show Search', icon: 'fa-search' },
            { key: 'showOnlyCommitters', label: 'Only Committers', icon: 'fa-code-branch' },
            { key: 'allowUserToggle', label: 'User View Toggle', icon: 'fa-toggle-on' },
          ].map(t => (
            <label key={t.key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!settings[t.key as keyof ContributorSettings]}
                onChange={e => save({ ...settings, [t.key]: e.target.checked })}
                className="w-3.5 h-3.5 accent-qsis cursor-pointer"
              />
              <span className="text-[0.72rem] text-dark-text2">
                <i className={`fas ${t.icon} text-dark-text3 mr-1`}></i>{t.label}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search contributors..."
        value={filter}
        onChange={e => setFilter(e.target.value)}
        className="w-full px-3 py-2 text-[0.8rem] bg-dark-bg2 border border-dark-border rounded-xl text-dark-text mb-4 placeholder:text-dark-text3 focus:outline-none focus:border-qsis"
      />

      {/* Contributor List */}
      <div className="space-y-2">
        {filtered.map((c, i) => {
          const isHidden = settings.hiddenLogins.includes(c.login);
          return (
            <div key={c.login} className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${isHidden ? 'bg-red-500/5 border-red-500/20 opacity-50' : 'bg-dark-bg2 border-dark-border hover:border-dark-text3'}`}>
              {/* Rank */}
              {settings.showRanks && (
                <span className="text-[0.7rem] font-bold text-dark-text3 w-5 text-center">#{i + 1}</span>
              )}

              {/* Avatar */}
              <img src={c.avatar_url} alt={c.login} className="w-9 h-9 rounded-full" />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-[0.8rem] font-semibold text-dark-text truncate">
                  {c.name || c.login} {c.role === 'Founder & Lead' && <span className="text-qsis text-[0.65rem] ml-1">(Founder)</span>}
                </p>
                <p className="text-[0.65rem] text-dark-text3">@{c.login} · {c.roleType} · {c.source}</p>
              </div>

              {/* Stats */}
              {settings.showStats && (
                <div className="flex gap-3 text-[0.7rem]">
                  <span className="text-blue-400" title="V2 commits"><i className="fas fa-code-branch mr-1"></i>{c.v2Contributions}</span>
                  <span className="text-green-400" title="Data commits"><i className="fas fa-database mr-1"></i>{c.dataContributions}</span>
                  <span className="text-purple-400" title="PRs"><i className="fas fa-code-merge mr-1"></i>{c.prCount}</span>
                  <span className="text-dark-text3" title="Total"><i className="fas fa-star mr-1"></i>{c.contributions}</span>
                </div>
              )}

              {/* Hide/Show Toggle */}
              <button
                onClick={() => toggleHide(c.login)}
                className={`px-2 py-1 rounded text-[0.7rem] cursor-pointer border-none transition-colors ${isHidden ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'}`}
                title={isHidden ? 'Show on contributors page' : 'Hide from contributors page'}
              >
                <i className={`fas ${isHidden ? 'fa-eye-slash' : 'fa-eye'}`}></i>
              </button>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-dark-text3 text-sm text-center py-8">No contributors found</p>
      )}
    </div>
  );
}

function PermissionsTab() {
  const [permissions, setPermissions] = useState<Record<string, string[] | boolean>>({});
  const [userGrants, setUserGrants] = useState<{ email: string; name: string; action: string; grantedBy: string; grantedAt: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [grantEmail, setGrantEmail] = useState('');
  const [grantAction, setGrantAction] = useState('uploadFile');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadPermissions = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/permissions');
      const data = await res.json();
      if (data.success) setPermissions(data.permissions);
    } catch {}
    try {
      const res = await fetch('/api/admin/users?all=true');
      const data = await res.json();
      if (data.users) {
        const grants: typeof userGrants = [];
        data.users.forEach((u: any) => {
          if (u.permissions && typeof u.permissions === 'object') {
            Object.entries(u.permissions).forEach(([action, granted]) => {
              if (granted) grants.push({ email: u.email, name: u.name || u.email, action, grantedBy: 'admin', grantedAt: '' });
            });
          }
        });
        setUserGrants(grants);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadPermissions(); }, [loadPermissions]);

  const toggleRole = async (action: string, role: string) => {
    const current = Array.isArray(permissions[action]) ? permissions[action] as string[] : [];
    const updated = current.includes(role) ? current.filter(r => r !== role) : [...current, role];
    const newPerms = { ...permissions, [action]: updated };
    setPermissions(newPerms);
    setSaving(true);
    try {
      const res = await fetch('/api/settings/permissions', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ permissions: newPerms }) });
      if (res.ok) { setSuccess('Permissions updated'); setTimeout(() => setSuccess(''), 2000); }
      else setError('Failed to save');
    } catch { setError('Network error'); }
    setSaving(false);
  };

  const grantUser = async () => {
    if (!grantEmail.trim()) { setError('Enter an email'); return; }
    setError(''); setSuccess('');
    try {
      const res = await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'grantPermission', targetEmail: grantEmail, permission: grantAction }) });
      const data = await res.json();
      if (data.success) {
        setSuccess(`Granted "${grantAction}" to ${grantEmail}`);
        setGrantEmail('');
        loadPermissions();
      } else setError(data.error || 'Failed');
    } catch { setError('Network error'); }
  };

  if (loading) return <div className="text-center py-10"><i className="fas fa-spinner fa-spin text-2xl text-qsis"></i></div>;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-dark-text mb-1"><i className="fas fa-key text-amber-400 mr-2"></i>Role Permissions</h3>
        <p className="text-[0.72rem] text-dark-text3 mb-4">Toggle which roles can perform each action. Changes take effect immediately.</p>
        {success && <div className="mb-3 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-xs"><i className="fas fa-check mr-1"></i>{success}</div>}
        {error && <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs"><i className="fas fa-exclamation-triangle mr-1"></i>{error}</div>}

        <div className="space-y-3">
          {PERMISSION_ACTIONS.map(action => (
            <div key={action.key} className="p-3 bg-dark-bg2 border border-dark-border rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <i className={`fas ${action.icon} ${action.color} text-xs`}></i>
                <span className="text-[0.82rem] font-semibold text-dark-text">{action.label}</span>
                <span className="text-[0.65rem] text-dark-text3 ml-auto">{action.desc}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ALL_ROLES.map(role => {
                  const allowed = Array.isArray(permissions[action.key]) && (permissions[action.key] as string[]).includes(role.key);
                  return (
                    <button
                      key={role.key}
                      onClick={() => toggleRole(action.key, role.key)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[0.7rem] font-medium border cursor-pointer transition-all ${
                        allowed
                          ? 'bg-qsis/15 border-qsis/40 text-qsis'
                          : 'bg-dark-bg border-dark-border text-dark-text3 hover:border-dark-text3'
                      }`}
                    >
                      <i className={`fas ${role.icon} text-[0.6rem]`}></i>
                      {role.label}
                      {allowed && <i className="fas fa-check text-[0.55rem] ml-0.5"></i>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CR Semester Restriction */}
      <div className="border-t border-dark-border pt-5">
        <h3 className="text-sm font-semibold text-dark-text mb-1"><i className="fas fa-user-lock text-purple-400 mr-2"></i>Course Addition Restrictions</h3>
        <p className="text-[0.72rem] text-dark-text3 mb-3">Control which semesters CRs and students can add courses to.</p>
        <div className="p-3 bg-dark-bg2 border border-dark-border rounded-xl">
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              className={`w-10 h-5 rounded-full transition-colors relative ${permissions.restrictCRToOwnSemester ? 'bg-qsis' : 'bg-dark-bg border border-dark-border'}`}
              onClick={async () => {
                const newVal = !permissions.restrictCRToOwnSemester;
                const newPerms = { ...permissions, restrictCRToOwnSemester: newVal };
                setPermissions(newPerms);
                setSaving(true);
                try {
                  const res = await fetch('/api/settings/permissions', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ permissions: newPerms }) });
                  if (res.ok) { setSuccess('Setting updated'); setTimeout(() => setSuccess(''), 2000); }
                  else setError('Failed to save');
                } catch { setError('Network error'); }
                setSaving(false);
              }}
            >
              <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${permissions.restrictCRToOwnSemester ? 'translate-x-5' : 'translate-x-0.5'}`}></div>
            </div>
            <div>
              <div className="text-xs font-semibold text-dark-text">Restrict CR/ACR to own semester only</div>
              <div className="text-[0.68rem] text-dark-text3">
                {permissions.restrictCRToOwnSemester
                  ? 'CR/ACR can only add courses to their current semester + 1 previous'
                  : 'CR/ACR can add courses to any semester (default)'}
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Per-user permission grants */}
      <div className="border-t border-dark-border pt-5">
        <h3 className="text-sm font-semibold text-dark-text mb-1"><i className="fas fa-user-plus text-blue-400 mr-2"></i>Grant Individual Permission</h3>
        <p className="text-[0.72rem] text-dark-text3 mb-3">Give a specific user permission for one action (e.g. grant upload access to someone without GitHub).</p>
        <div className="flex flex-wrap gap-2 p-3 bg-dark-bg2 border border-dark-border rounded-xl">
          <input
            value={grantEmail}
            onChange={e => setGrantEmail(e.target.value)}
            placeholder="user@ugrad.iiuc.ac.bd"
            className="flex-1 min-w-[180px] px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-dark-text text-xs outline-none focus:border-qsis"
          />
          <CustomSelect
            value={grantAction}
            onChange={setGrantAction}
            options={PERMISSION_ACTIONS.map(a => ({ value: a.key, label: a.label, icon: a.icon }))}
          />
          <button onClick={grantUser} className="px-4 py-2 bg-qsis text-white rounded-lg text-xs font-semibold hover:bg-qsis/90">
            <i className="fas fa-plus mr-1"></i>Grant
          </button>
        </div>
      </div>
    </div>
  );
}

function CoursesTab({ effectiveRole, profile }: { effectiveRole: string; profile: any }) {
  const getSemesterCourses = useAppStore(s => s.getSemesterCourses);
  const loadTree = useAppStore(s => s.loadTree);
  const tree = useAppStore(s => s.tree); // subscribe to tree so component re-renders after loadTree
  const session = useAppStore(s => s.profile);
  const [selectedDept, setSelectedDept] = useState(profile?.department || 'qsis');
  const [selectedSem, setSelectedSem] = useState('1st-semister');
  const [showAdd, setShowAdd] = useState(false);
  const [addCode, setAddCode] = useState('');
  const [addTitle, setAddTitle] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [editCourse, setEditCourse] = useState<{ code: string; title: string } | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [deleteCourse, setDeleteCourse] = useState<{ code: string; title: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [canAdd, setCanAdd] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [dbCourses, setDbCourses] = useState<any[]>([]);
  const [showMyCourses, setShowMyCourses] = useState(false);

  const courses = getSemesterCourses(selectedSem, selectedDept);
  const myEmail = (profile?.email || '').toLowerCase();

  // Build a map of code -> addedBy from DB courses
  const addedByMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of dbCourses) {
      if (c.addedBy) map[c.code.toUpperCase()] = c.addedBy;
    }
    return map;
  }, [dbCourses]);

  // Filter courses if "My courses" is toggled
  const filteredCourses = useMemo(() => {
    if (!showMyCourses) return courses;
    return courses.filter(c => {
      const addedBy = addedByMap[c.code.toUpperCase()];
      return addedBy?.toLowerCase() === myEmail;
    });
  }, [courses, showMyCourses, addedByMap, myEmail]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings/permissions');
        const data = await res.json();
        if (!data.success) return;
        const perms = data.permissions || {};
        const isCR = profile?.isCR || false;
        const roleKey = isCR ? 'cr' : effectiveRole;
        const perUserKey = (action: string) => `${action}_users`;
        const check = (action: string) => {
          const allowedUsers = perms[perUserKey(action)] || [];
          if (allowedUsers.includes((profile?.email || '').toLowerCase())) return true;
          const allowedRoles = perms[action] || [];
          return allowedRoles.includes(roleKey);
        };
        setCanAdd(check('addCourse'));
        setCanEdit(check('editCourse'));
        setCanDelete(check('deleteCourse'));
      } catch {}
    })();
  }, [effectiveRole, profile]);

  // Fetch DB courses for addedBy info
  useEffect(() => {
    if (!selectedDept || !selectedSem) return;
    fetch(`/api/courses?department=${selectedDept}&semester=${selectedSem}`)
      .then(r => r.json())
      .then(data => setDbCourses(data.courses || []))
      .catch(() => {});
  }, [selectedDept, selectedSem, tree]);

  async function handleAdd() {
    if (!addCode.trim() || !addTitle.trim()) { setAddError('Code and title required'); return; }
    setAddLoading(true); setAddError('');
    try {
      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ department: selectedDept, semester: selectedSem, code: addCode.trim(), title: addTitle.trim() }),
      });
      const data = await res.json();
      if (!res.ok && !data.success) throw new Error(data.error || 'Failed');
      setShowAdd(false); setAddCode(''); setAddTitle('');
      await loadTree();
    } catch (e: any) { setAddError(e.message); }
    finally { setAddLoading(false); }
  }

  async function handleEdit() {
    if (!editCourse || !editTitle.trim()) return;
    setEditLoading(true);
    try {
      const res = await fetch('/api/courses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: editCourse.code, semester: selectedSem, department: selectedDept, title: editTitle.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setEditCourse(null); setEditTitle('');
      await loadTree();
    } catch (e: any) { alert(e.message); }
    finally { setEditLoading(false); }
  }

  async function handleDelete() {
    if (!deleteCourse) return;
    setDeleteLoading(true);
    try {
      const res = await fetch('/api/courses', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: deleteCourse.code, semester: selectedSem, department: selectedDept }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      if (data.pendingApproval) {
        alert('Delete request sent to owner for approval.');
      }
      setDeleteCourse(null);
      await loadTree();
    } catch (e: any) { alert(e.message); }
    finally { setDeleteLoading(false); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-dark-text"><i className="fas fa-book text-indigo-400 mr-2"></i>Courses (from GitHub)</h3>
        {canAdd && (
          <button onClick={() => { setShowAdd(true); setAddCode(''); setAddTitle(''); setAddError(''); }}
            className="px-3 py-1.5 rounded-lg bg-qsis text-white text-[0.72rem] font-semibold cursor-pointer hover:opacity-90 flex items-center gap-1.5">
            <i className="fas fa-plus"></i> Add Course
          </button>
        )}
      </div>
      <p className="text-dark-text3 text-xs mb-3">Manage courses for each department and semester.</p>

      <div className="flex flex-wrap gap-2 mb-4">
        <CustomSelect value={selectedDept} onChange={setSelectedDept} placeholder="Department..."
          options={FACULTIES.flatMap(f => f.departments.map(d => ({ value: d.id, label: `${d.shortName} — ${d.name}`, icon: 'fa-building', group: f.shortName })))} />
        <CustomSelect value={selectedSem} onChange={setSelectedSem} placeholder="Semester..."
          options={config.semesters.map(s => ({ value: s.id, label: s.label, icon: 'fa-calendar' }))} />
        <button onClick={() => setShowMyCourses(v => !v)}
          className={`px-3 py-1.5 rounded-lg text-[0.72rem] font-semibold border cursor-pointer transition-colors ${showMyCourses ? 'bg-qsis text-white border-qsis' : 'bg-dark-bg3 text-dark-text2 border-dark-border hover:border-qsis/30'}`}>
          <i className={`fas fa-user ${showMyCourses ? 'mr-1' : 'mr-1'}`}></i>My Courses
        </button>
      </div>

      {/* Add Course Modal — portal to body so re-renders don't kill it */}
      {showAdd && createPortal(
        <div className="fixed inset-0 z-[250] bg-black/60 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-dark-bg2 w-full max-w-sm rounded-2xl border border-dark-border p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-dark-text mb-3"><i className="fas fa-book-medical text-qsis mr-2"></i>Add Course</h3>
            {addError && <p className="text-red-400 text-[0.72rem] mb-2">{addError}</p>}
            <input type="text" placeholder="Course Code (e.g. QSM-3601)" value={addCode} onChange={e => setAddCode(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis mb-2" />
            <input type="text" placeholder="Course Title (e.g. Ulumul Quran)" value={addTitle} onChange={e => setAddTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis mb-3" />
            <p className="text-[0.68rem] text-dark-text3 mb-3">
              Folders created: <code className="bg-dark-bg3 px-1 rounded">Mid/NOTES, Mid/Previous Questions, Final/NOTES, Final/Previous Questions, sheet, Syllabus, Other</code>
            </p>
            <div className="flex gap-2">
              <button onClick={handleAdd} disabled={addLoading || !addCode.trim() || !addTitle.trim()}
                className="flex-1 py-2 rounded-lg bg-qsis text-white text-[0.82rem] font-semibold border-none cursor-pointer hover:opacity-90 disabled:opacity-50">
                {addLoading ? <><i className="fas fa-spinner fa-spin mr-1"></i>Creating...</> : <><i className="fas fa-plus mr-1"></i>Add Course</>}
              </button>
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2 rounded-lg bg-dark-bg3 text-dark-text2 text-[0.82rem] font-semibold border border-dark-border cursor-pointer hover:bg-dark-bg2">Cancel</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Course Modal — portal to body */}
      {editCourse && createPortal(
        <div className="fixed inset-0 z-[250] bg-black/60 flex items-center justify-center p-4" onClick={() => setEditCourse(null)}>
          <div className="bg-dark-bg2 w-full max-w-sm rounded-2xl border border-dark-border p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-dark-text mb-1"><i className="fas fa-edit text-blue-400 mr-2"></i>Edit Course</h3>
            <p className="text-dark-text3 text-[0.72rem] mb-3">Editing <span className="font-mono text-qsis">{editCourse.code}</span></p>
            <input type="text" placeholder="New course title" value={editTitle} onChange={e => setEditTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis mb-3" />
            <div className="flex gap-2">
              <button onClick={handleEdit} disabled={editLoading || !editTitle.trim()}
                className="flex-1 py-2 rounded-lg bg-blue-500 text-white text-[0.82rem] font-semibold border-none cursor-pointer hover:opacity-90 disabled:opacity-50">
                {editLoading ? <><i className="fas fa-spinner fa-spin mr-1"></i>Saving...</> : <><i className="fas fa-check mr-1"></i>Save</>}
              </button>
              <button onClick={() => setEditCourse(null)} className="flex-1 py-2 rounded-lg bg-dark-bg3 text-dark-text2 text-[0.82rem] font-semibold border border-dark-border cursor-pointer hover:bg-dark-bg2">Cancel</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Course Modal — portal to body */}
      {deleteCourse && createPortal(
        <div className="fixed inset-0 z-[250] bg-black/60 flex items-center justify-center p-4" onClick={() => setDeleteCourse(null)}>
          <div className="bg-dark-bg2 w-full max-w-sm rounded-2xl border border-dark-border p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-red-400 mb-2"><i className="fas fa-trash mr-2"></i>Delete Course</h3>
            <p className="text-dark-text2 text-[0.82rem] mb-1">Are you sure you want to delete:</p>
            <p className="font-mono text-qsis text-sm font-bold mb-3">{deleteCourse.code} — {deleteCourse.title}</p>
            <p className="text-red-400 text-[0.72rem] mb-3"><i className="fas fa-exclamation-triangle mr-1"></i>This will permanently delete the course folder from GitHub and the database. The owner will be notified.</p>
            <div className="flex gap-2">
              <button onClick={handleDelete} disabled={deleteLoading}
                className="flex-1 py-2 rounded-lg bg-red-500 text-white text-[0.82rem] font-semibold border-none cursor-pointer hover:opacity-90 disabled:opacity-50">
                {deleteLoading ? <><i className="fas fa-spinner fa-spin mr-1"></i>Deleting...</> : <><i className="fas fa-trash mr-1"></i>Delete</>}
              </button>
              <button onClick={() => setDeleteCourse(null)} className="flex-1 py-2 rounded-lg bg-dark-bg3 text-dark-text2 text-[0.82rem] font-semibold border border-dark-border cursor-pointer hover:bg-dark-bg2">Cancel</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <div className="space-y-2">
        {filteredCourses.length === 0 && <p className="text-dark-text3 text-sm text-center py-6">No courses found for {selectedDept}/{selectedSem}{showMyCourses ? ' (my courses)' : ''}.</p>}
        {filteredCourses.map(c => {
          const addedBy = addedByMap[c.code.toUpperCase()];
          const isMyCourse = addedBy?.toLowerCase() === myEmail;
          const canDeleteThis = isMyCourse || ['admin', 'manager', 'teacher'].includes(effectiveRole) || profile?.isCR;
          return (
          <div key={c.code} className="flex items-center gap-3 px-4 py-3 bg-dark-bg2 border border-dark-border rounded-xl hover:border-qsis/30 transition-colors group">
            <span className="text-qsis font-mono text-xs font-bold min-w-[80px]">{c.code}</span>
            <span className="flex-1 text-dark-text text-xs">{c.title}</span>
            {addedBy && (
              <span className={`text-[0.65rem] px-1.5 py-0.5 rounded-full ${isMyCourse ? 'bg-qsis/10 text-qsis' : 'bg-dark-bg3 text-dark-text3'}`} title={`Added by ${addedBy}`}>
                <i className="fas fa-user-circle mr-0.5"></i>{isMyCourse ? 'You' : addedBy.split('@')[0]}
              </span>
            )}
            <span className="text-dark-text3 text-xs">{c.totalFiles} files</span>
            <div className="flex gap-1">
              {c.categories.map(cat => (
                <span key={cat.key} className="text-[0.6rem] px-1.5 py-0.5 rounded-full bg-dark-bg3 text-dark-text3" title={`${cat.label}: ${cat.count}`}>
                  <i className={`fas fa-${cat.icon} mr-0.5`}></i>{cat.count}
                </span>
              ))}
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {canEdit && (
                <button onClick={() => { setEditCourse({ code: c.code, title: c.title }); setEditTitle(c.title); }}
                  className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 border-none cursor-pointer flex items-center justify-center text-[0.7rem] hover:bg-blue-500/20" title="Edit title">
                  <i className="fas fa-pen"></i>
                </button>
              )}
              {canDelete && canDeleteThis && (
                <button onClick={() => setDeleteCourse({ code: c.code, title: c.title })}
                  className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 border-none cursor-pointer flex items-center justify-center text-[0.7rem] hover:bg-red-500/20" title="Delete course">
                  <i className="fas fa-trash"></i>
                </button>
              )}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

function TelegramTab({ isOwner }: { isOwner: boolean }) {
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState('');
  const [botStatus, setBotStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [botInfo, setBotInfo] = useState<any>(null);

  useEffect(() => {
    fetch('/api/telegram/broadcast')
      .then(r => r.json())
      .then(data => {
        setBotStatus(data.success ? 'ok' : 'error');
        setBotInfo(data);
      })
      .catch(() => setBotStatus('error'));
  }, []);

  async function handleBroadcast() {
    if (!broadcastMsg.trim() || !isOwner) return;
    setBroadcastLoading(true);
    setBroadcastResult('');
    try {
      const res = await fetch('/api/telegram/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: broadcastMsg.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setBroadcastResult('Message sent successfully!');
        setBroadcastMsg('');
      } else {
        setBroadcastResult(data.error || 'Failed to send');
      }
    } catch {
      setBroadcastResult('Network error');
    } finally {
      setBroadcastLoading(false);
    }
  }

  const botCommands = [
    { cmd: '/start', desc: 'Welcome message & main menu' },
    { cmd: '/help', desc: 'List all available commands' },
    { cmd: '/courses', desc: 'List all courses (dept > sem > courses)' },
    { cmd: '/courses qs', desc: 'Courses in QSIS department' },
    { cmd: '/courses qs 3', desc: 'Courses in QSIS, 3rd semester' },
    { cmd: '/departments', desc: 'List all departments with links' },
    { cmd: '/semester 3', desc: 'Browse semester 3 departments' },
    { cmd: '/search notes', desc: 'Search files by name' },
    { cmd: '/stats', desc: 'View site statistics' },
    { cmd: '/broadcast <msg>', desc: 'Send announcement (owner only)' },
    { cmd: 'QUR101', desc: 'Search course by code (any format)' },
  ];

  return (
    <div>
      <h3 className="text-sm font-semibold text-dark-text mb-3"><i className="fas fa-paper-plane text-cyan-400 mr-2"></i>Telegram Bot</h3>

      {/* Bot Status */}
      <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${botStatus === 'ok' ? 'bg-green-400' : botStatus === 'loading' ? 'bg-yellow-400 animate-pulse' : 'bg-red-400'}`}></div>
          <div>
            <p className="text-dark-text text-sm font-semibold">IIUC-ARMS Bot</p>
            <p className="text-dark-text3 text-[0.72rem]">
              {botStatus === 'ok' ? `Bot is online · ${botInfo?.users || 0} registered users` : botStatus === 'loading' ? 'Checking...' : 'Bot is offline or token missing'}
            </p>
          </div>
        </div>
      </div>

      {/* Commands Reference */}
      <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4 mb-4">
        <h4 className="text-dark-text text-sm font-semibold mb-3"><i className="fas fa-terminal text-qsis mr-2"></i>Bot Commands</h4>
        <div className="space-y-1.5">
          {botCommands.map((c, i) => (
            <div key={i} className="flex items-start gap-3 text-[0.78rem]">
              <code className="bg-dark-bg3 px-1.5 py-0.5 rounded text-qsis font-mono whitespace-nowrap">{c.cmd}</code>
              <span className="text-dark-text2">{c.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Broadcast */}
      {isOwner && (
        <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4">
          <h4 className="text-dark-text text-sm font-semibold mb-3"><i className="fas fa-bullhorn text-yellow-400 mr-2"></i>Broadcast Announcement</h4>
          <textarea
            className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis resize-y min-h-[80px] mb-2"
            placeholder="Type your announcement message... (HTML supported: <b>bold</b>, <i>italic</i>, <code>code</code>)"
            value={broadcastMsg}
            onChange={e => setBroadcastMsg(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleBroadcast}
              disabled={broadcastLoading || !broadcastMsg.trim()}
              className="px-4 py-2 rounded-lg bg-cyan-500 text-white text-[0.78rem] font-semibold border-none cursor-pointer hover:opacity-90 disabled:opacity-50"
            >
              {broadcastLoading ? <><i className="fas fa-spinner fa-spin mr-1"></i>Sending...</> : <><i className="fas fa-paper-plane mr-1"></i>Send to Bot Users</>}
            </button>
            {broadcastResult && (
              <span className={`text-[0.72rem] ${broadcastResult.includes('success') ? 'text-green-400' : 'text-red-400'}`}>{broadcastResult}</span>
            )}
          </div>
          <p className="text-[0.68rem] text-dark-text3 mt-2">
            <i className="fas fa-info-circle mr-1"></i>
            This sends the message to the bot owner's chat. For full broadcast to all users, use the Telegram bot directly with <code>/broadcast</code>.
          </p>
        </div>
      )}

      {!isOwner && (
        <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4 text-center">
          <p className="text-dark-text3 text-[0.82rem]">
            <i className="fas fa-lock mr-1"></i>Broadcast is only available to the owner.
          </p>
        </div>
      )}
    </div>
  );
}

export default function AdminPanelView() {
  const { data: session } = useSession();
  const { confirm, ConfirmModal } = useConfirm();
  const router = useRouter();
  const profile = useAppStore(s => s.profile);

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userFilter, setUserFilter] = useState<'all' | 'admin' | 'manager' | 'teacher' | 'student' | 'user'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [facultyList, setFacultyList] = useState<any[]>([]);
  const [facultyForm, setFacultyForm] = useState({ department: '', name: '', title: '', email: '', phone: '', shortForm: '', memberType: 'faculty' });
  const [facultySaving, setFacultySaving] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ inserted: number; updated: number; skipped: number; errors?: string[] } | null>(null);
  const [facultyRequests, setFacultyRequests] = useState<any[]>([]);
  const [facultyDeptFilter, setFacultyDeptFilter] = useState('qsis');
  const [facultyTitleFilter, setFacultyTitleFilter] = useState('');
  const [overviewFacultyCount, setOverviewFacultyCount] = useState(0);
  const [recentLogins, setRecentLogins] = useState<UserRecord[]>([]);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [createUserForm, setCreateUserForm] = useState({ email: '', name: '', role: 'user', department: '', semester: '', section: '' });
  const [createUserLoading, setCreateUserLoading] = useState(false);
  const [createUserError, setCreateUserError] = useState('');
  const [createUserSuccess, setCreateUserSuccess] = useState('');

  const email = session?.user?.email || profile.email || '';
  const effectiveRole = config.getEffectiveRole(email, profile.role);
  const isAdmin = effectiveRole === 'admin';
  const isManager = effectiveRole === 'manager';
  const isOwner = config.ownerEmails.includes(email.toLowerCase());
  const isTeacherOrAbove = effectiveRole === 'admin' || effectiveRole === 'manager' || effectiveRole === 'teacher';
  const hasAdminAccess = isAdmin || isManager || effectiveRole === 'teacher';

  useEffect(() => {
    if (!hasAdminAccess) return;
    fetch('/api/activity?limit=50')
      .then(r => r.json())
      .then(data => {
        setActivities(data.activities || []);
        setStats(data.stats || null);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load admin data');
        setLoading(false);
      });
    fetch('/api/faculty')
      .then(r => r.json())
      .then(data => setOverviewFacultyCount((data.members || []).length))
      .catch(() => {});
    fetch('/api/admin/users?sort=recent&limit=5')
      .then(r => r.json())
      .then(data => setRecentLogins((data.users || []).filter((u: UserRecord) => u.lastSignIn).slice(0, 5)))
      .catch(() => {});
  }, [hasAdminAccess]);

  const loadUsers = useCallback((role?: string, search?: string) => {
    const params = new URLSearchParams();
    if (role && role !== 'all') params.set('role', role);
    if (search) params.set('search', search);
    fetch(`/api/admin/users?${params}`)
      .then(r => r.json())
      .then(data => setUsers(data.users || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!hasAdminAccess) return;
    const tabRole = activeTab === 'admins' ? 'admin'
      : activeTab === 'managers' ? 'manager'
      : activeTab === 'teachers' ? 'teacher'
      : activeTab === 'students' ? 'student'
      : activeTab === 'faculty' ? undefined
      : userFilter;
    if (activeTab !== 'faculty') loadUsers(tabRole, searchQuery);
  }, [hasAdminAccess, activeTab, userFilter, searchQuery, loadUsers]);

  const handleBan = async (targetEmail: string, isBanned: boolean) => {
    const action = isBanned ? 'unban' : 'ban';
    const label = isBanned ? 'Unban' : 'Ban';
    let banReason = '';
    if (!isBanned) {
      const reason = prompt(`Ban ${targetEmail}?\n\nEnter a reason (optional):`);
      if (reason === null) return;
      banReason = reason;
    } else {
      if (!await confirm({ message: `Unban user ${targetEmail}?`, title: 'Unban User' })) return;
    }
    setActionLoading(targetEmail + action);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetEmail, action, banReason }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        loadUsers(activeTab === 'admins' ? 'admin' : activeTab === 'managers' ? 'manager' : activeTab === 'teachers' ? 'teacher' : activeTab === 'students' ? 'student' : userFilter, searchQuery);
      } else {
        showToast(data.error || 'Failed', 'error');
      }
    } catch {
      showToast('Action failed', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const handleSetRole = async (targetEmail: string, newRole: string) => {
    if (!await confirm({ message: `Change ${targetEmail}'s role to ${newRole}?`, title: 'Change Role' })) return;
    setActionLoading(targetEmail + 'role');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetEmail, action: 'setRole', newRole }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        loadUsers(activeTab === 'admins' ? 'admin' : activeTab === 'managers' ? 'manager' : activeTab === 'teachers' ? 'teacher' : activeTab === 'students' ? 'student' : userFilter, searchQuery);
      } else {
        showToast(data.error || 'Failed', 'error');
      }
    } catch {
      showToast('Action failed', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const handleAddAdmin = async () => {
    if (!newAdminEmail.trim()) return;
    await handleSetRole(newAdminEmail.trim(), 'admin');
    setNewAdminEmail('');
    setShowAddAdmin(false);
  };

  const handleToggleCR = async (targetEmail: string, currentCR: boolean) => {
    setActionLoading(targetEmail + 'cr');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetEmail, action: 'toggleCR', isCR: !currentCR }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        loadUsers(activeTab === 'admins' ? 'admin' : activeTab === 'managers' ? 'manager' : activeTab === 'teachers' ? 'teacher' : activeTab === 'students' ? 'student' : userFilter, searchQuery);
      } else {
        showToast(data.error || 'Failed', 'error');
      }
    } catch {
      showToast('Action failed', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const handleToggleACR = async (targetEmail: string, currentACR: boolean) => {
    setActionLoading(targetEmail + 'acr');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetEmail, action: 'toggleACR', isACR: !currentACR }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        loadUsers(activeTab === 'admins' ? 'admin' : activeTab === 'managers' ? 'manager' : activeTab === 'teachers' ? 'teacher' : activeTab === 'students' ? 'student' : userFilter, searchQuery);
      } else {
        showToast(data.error || 'Failed', 'error');
      }
    } catch {
      showToast('Action failed', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const handleToggleManager = async (targetEmail: string, currentRole: string) => {
    if (currentRole === 'manager') {
      await handleSetRole(targetEmail, 'student');
      return;
    }
    if (!await confirm({ message: `Promote ${targetEmail} to Manager? You will remain admin.`, title: 'Promote to Manager' })) return;
    setActionLoading(targetEmail + 'manager');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetEmail, action: 'setRole', newRole: 'manager' }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        loadUsers(activeTab === 'managers' ? 'manager' : userFilter, searchQuery);
      } else {
        showToast(data.error || 'Failed', 'error');
      }
    } catch {
      showToast('Action failed', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const handleCreateUser = async () => {
    setCreateUserError('');
    setCreateUserSuccess('');
    if (!createUserForm.email.trim() || !createUserForm.email.includes('@')) {
      setCreateUserError('Valid email required');
      return;
    }
    setCreateUserLoading(true);
    try {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createUserForm),
      });
      const data = await res.json();
      if (data.success) {
        setCreateUserSuccess(data.message);
        setCreateUserForm({ email: '', name: '', role: 'user', department: '', semester: '', section: '' });
        setShowCreateUser(false);
        loadUsers();
      } else {
        setCreateUserError(data.error || 'Failed');
      }
    } catch {
      setCreateUserError('Network error');
    }
    setCreateUserLoading(false);
  };

  const loadFaculty = (dept?: string) => {
    const params = new URLSearchParams();
    if (dept || facultyDeptFilter) params.set('department', dept || facultyDeptFilter);
    if (facultyTitleFilter) params.set('title', facultyTitleFilter);
    fetch(`/api/faculty?${params}`)
      .then(r => r.json())
      .then(data => setFacultyList(data.members || []))
      .catch(() => {});
  };

  useEffect(() => {
    if (activeTab === 'faculty') loadFaculty();
  }, [activeTab, facultyDeptFilter, facultyTitleFilter]);

  const handleAddFaculty = async () => {
    if (!facultyForm.department || !facultyForm.name) {
      showToast('Department and name are required', 'error');
      return;
    }
    setFacultySaving(true);
    try {
      const res = await fetch('/api/faculty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(facultyForm),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`${facultyForm.name} added to faculty`, 'success');
        setFacultyForm({ department: '', name: '', title: '', email: '', phone: '', shortForm: '', memberType: 'faculty' });
        loadFaculty(facultyForm.department);
      } else {
        showToast(data.error || 'Failed to add', 'error');
      }
    } catch {
      showToast('Failed to add faculty', 'error');
    } finally {
      setFacultySaving(false);
    }
  };

  const handleDeleteFaculty = async (id: string, name: string) => {
    if (!await confirm({ message: `Remove ${name} from faculty?`, danger: true, title: 'Remove Faculty' })) return;
    try {
      const res = await fetch(`/api/faculty?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast(`${name} removed`, 'success');
        loadFaculty();
      } else {
        showToast(data.error || 'Failed', 'error');
      }
    } catch {
      showToast('Failed', 'error');
    }
  };

  const handleBulkImport = async () => {
    if (!bulkInput.trim()) {
      showToast('Paste JSON or CSV data first', 'error');
      return;
    }
    setBulkImporting(true);
    setBulkResult(null);
    try {
      let members: any[] = [];
      const trimmed = bulkInput.trim();
      if (trimmed.startsWith('[')) {
        members = JSON.parse(trimmed);
      } else {
        const lines = trimmed.split('\n').filter(l => l.trim());
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        for (let i = 1; i < lines.length; i++) {
          const vals = lines[i].split(',').map(v => v.trim());
          const obj: any = {};
          headers.forEach((h, idx) => { obj[h] = vals[idx] || ''; });
          members.push(obj);
        }
      }
      if (members.length === 0) {
        showToast('No records found', 'error');
        setBulkImporting(false);
        return;
      }
      const res = await fetch('/api/faculty/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ members, mode: 'skip' }),
      });
      const data = await res.json();
      if (data.success) {
        setBulkResult(data);
        showToast(`Imported: ${data.inserted} new, ${data.updated} updated, ${data.skipped} skipped`, 'success');
        loadFaculty();
      } else {
        showToast(data.error || 'Import failed', 'error');
      }
    } catch (e: any) {
      showToast(`Import error: ${e.message}`, 'error');
    } finally {
      setBulkImporting(false);
    }
  };

  const loadFacultyRequests = () => {
    fetch('/api/faculty/request?status=pending')
      .then(r => r.json())
      .then(data => setFacultyRequests(data.requests || []))
      .catch(() => {});
  };

  useEffect(() => {
    if (activeTab === 'faculty') loadFacultyRequests();
  }, [activeTab]);

  const handleToggleVisibility = async (id: string, currentVisible: boolean) => {
    try {
      const res = await fetch('/api/faculty', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isVisible: !currentVisible }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Now ${!currentVisible ? 'visible' : 'hidden'} publicly`, 'success');
        loadFaculty();
      } else {
        showToast(data.error || 'Failed', 'error');
      }
    } catch {
      showToast('Failed to update visibility', 'error');
    }
  };

  const handleBulkVisibility = async (department: string, visible: boolean) => {
    if (!await confirm({ message: `${visible ? 'Show' : 'Hide'} ALL faculty in this department publicly?`, title: 'Bulk Visibility' })) return;
    try {
      const res = await fetch('/api/faculty', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ department, isVisible: visible }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`${data.count} members ${visible ? 'shown' : 'hidden'}`, 'success');
        loadFaculty();
      } else {
        showToast(data.error || 'Failed', 'error');
      }
    } catch {
      showToast('Failed', 'error');
    }
  };

  const groupedFaculty = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const m of facultyList) {
      const dept = m.department || 'Unknown';
      if (!map.has(dept)) map.set(dept, []);
      map.get(dept)!.push(m);
    }
    return map;
  }, [facultyList]);

  const availableTitles = useMemo(() => {
    const titles = new Set<string>();
    for (const m of facultyList) {
      if (m.title) titles.add(m.title);
    }
    return Array.from(titles).sort();
  }, [facultyList]);

  if (!hasAdminAccess) {
    return (
      <section className="mb-5">
        <div className="text-center py-20">
          <i className="fas fa-shield-alt text-4xl text-red-400 mb-4 block opacity-30"></i>
          <p className="text-[1rem] text-dark-text2 mb-2">Access Denied</p>
          <p className="text-[0.82rem] text-dark-text2 opacity-60">You need admin, manager, or teacher privileges to view this page.</p>
          <button onClick={() => router.push('/')} className="mt-4 px-4 py-2 bg-qsis text-white rounded-lg text-sm">Go Home</button>
        </div>
      </section>
    );
  }

  const formatAction = (action: string) => {
    switch (action) {
      case 'file_upload': return { label: 'File Upload', icon: 'fa-upload', color: 'text-blue-400' };
      case 'routine_publish': return { label: 'Routine Published', icon: 'fa-calendar-check', color: 'text-green-400' };
      case 'routine_unpublish_all': return { label: 'Routine Unpublished', icon: 'fa-calendar-minus', color: 'text-yellow-400' };
      case 'user_ban': return { label: 'User Banned', icon: 'fa-ban', color: 'text-red-400' };
      case 'user_unban': return { label: 'User Unbanned', icon: 'fa-check-circle', color: 'text-green-400' };
      case 'role_change': return { label: 'Role Changed', icon: 'fa-user-tag', color: 'text-orange-400' };
      case 'github_connect': return { label: 'GitHub Connected', icon: 'fab fa-github', color: 'text-purple-400' };
      case 'login': return { label: 'User Login', icon: 'fa-sign-in-alt', color: 'text-qsis' };
      default: return { label: action.replace(/_/g, ' '), icon: 'fa-circle', color: 'text-gray-400' };
    }
  };

  const formatDate = (d: string) => new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const getRoleBadge = (role: string | null, u?: UserRecord) => {
    switch (role) {
      case 'admin': return <span className="px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 text-[0.65rem] font-semibold">Admin</span>;
      case 'manager': return <span className="px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 text-[0.65rem] font-semibold">Manager</span>;
      case 'teacher': return <span className="px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 text-[0.65rem] font-semibold">Teacher</span>;
      case 'student': return <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 text-[0.65rem] font-semibold">Student</span>;
      default: return <span className="px-2 py-0.5 rounded-full bg-gray-500/15 text-gray-400 text-[0.65rem] font-semibold">User</span>;
    }
  };

  const isSuperAdmin = config.ownerEmails.includes(email);

  const UserRow = ({ u }: { u: UserRecord }) => {
    const isSelf = u.email === email;
    const uRole = u.role || 'user';
    const isOwner = config.ownerEmails.includes(u.email.toLowerCase());
    const canEditRole = !isSelf && !isOwner && (isAdmin || (isManager && uRole !== 'admin' && uRole !== 'manager'));
    const canBan = !isSelf && !isOwner && uRole !== 'admin' && (isAdmin || isManager);
    const canToggleCR = !isSelf && (isAdmin || isManager);
    const canToggleACR = !isSelf && (isAdmin || isManager);
    const canPromoteManager = isAdmin && !isSelf && !isOwner;

    return (
      <div className={`bg-dark-bg2 border rounded-xl p-4 transition-all hover:border-qsis/30 ${u.isBanned ? 'border-red-500/30 opacity-60' : 'border-dark-border'}`}>
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <img src={u.githubAvatar || u.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name || u.email)}&background=6366f1&color=fff&bold=true&size=48`} alt="" className="w-11 h-11 rounded-full border-2 border-dark-border object-cover" />
            {u.isBanned && <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center"><i className="fas fa-ban text-white text-[0.45rem]"></i></div>}
          </div>
          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              <span className="text-[0.85rem] font-semibold text-dark-text truncate">{u.name || u.email.split('@')[0]}</span>
              {getRoleBadge(u.role, u)}
              {u.isCR && <span className="px-1.5 py-0.5 rounded-md bg-purple-500/15 text-purple-400 text-[0.6rem] font-bold">CR</span>}
              {u.isACR && <span className="px-1.5 py-0.5 rounded-md bg-indigo-500/15 text-indigo-400 text-[0.6rem] font-bold">ACR</span>}
              {isOwner && <span className="px-1.5 py-0.5 rounded-md bg-yellow-500/15 text-yellow-400 text-[0.6rem] font-bold"><i className="fas fa-star mr-0.5"></i>Owner</span>}
              {u.githubLogin && <a href={`https://github.com/${u.githubLogin}`} target="_blank" rel="noopener noreferrer" className="text-dark-text3 hover:text-dark-text"><i className="fab fa-github text-[0.7rem]"></i></a>}
            </div>
            <p className="text-[0.72rem] text-dark-text3 truncate">{u.email}{u.universityId ? ` (${u.universityId})` : ''}{u.semester ? ` — ${u.semester}` : ''}</p>
            {u.isBanned && u.banReason && (
              <div className="mt-1.5 p-1.5 rounded bg-red-500/10 border border-red-500/20">
                <p className="text-[0.62rem] text-red-400"><i className="fas fa-info-circle mr-1"></i>{u.banReason}</p>
                {u.bannedBy && <p className="text-[0.58rem] text-dark-text3 mt-0.5">Banned by: {u.bannedBy}</p>}
              </div>
            )}
            {u.lastSignIn && <p className="text-[0.62rem] text-dark-text3 mt-0.5"><i className="fas fa-clock mr-0.5"></i>{formatDate(u.lastSignIn)}</p>}
          </div>
          {/* Actions */}
          <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
            {canToggleCR && (
              <button onClick={() => handleToggleCR(u.email, !!u.isCR)} disabled={actionLoading === u.email + 'cr'}
                className={`px-2 py-1 rounded-lg text-[0.65rem] font-semibold cursor-pointer border transition-all disabled:opacity-50 ${
                  u.isCR ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' : 'bg-dark-bg3 text-dark-text2 border-dark-border hover:text-purple-400 hover:border-purple-500/30'
                }`} title={u.isCR ? 'Remove CR' : 'Make CR'}>
                {actionLoading === u.email + 'cr' ? <i className="fas fa-spinner fa-spin"></i> : 'CR'}
              </button>
            )}
            {canToggleACR && (
              <button onClick={() => handleToggleACR(u.email, !!u.isACR)} disabled={actionLoading === u.email + 'acr'}
                className={`px-2 py-1 rounded-lg text-[0.65rem] font-semibold cursor-pointer border transition-all disabled:opacity-50 ${
                  u.isACR ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'bg-dark-bg3 text-dark-text2 border-dark-border hover:text-indigo-400 hover:border-indigo-500/30'
                }`} title={u.isACR ? 'Remove ACR' : 'Make ACR'}>
                {actionLoading === u.email + 'acr' ? <i className="fas fa-spinner fa-spin"></i> : 'ACR'}
              </button>
            )}
            {canEditRole && (
              <CustomSelect
                value={uRole}
                onChange={(val) => handleSetRole(u.email, val)}
                options={[
                  { value: 'user', label: 'User', icon: 'fa-user' },
                  { value: 'student', label: 'Student', icon: 'fa-user-graduate' },
                  { value: 'teacher', label: 'Teacher', icon: 'fa-chalkboard-teacher' },
                  ...(isAdmin ? [{ value: 'manager', label: 'Manager', icon: 'fa-user-shield' }] : []),
                  ...(isSuperAdmin ? [{ value: 'admin', label: 'Admin', icon: 'fa-crown' }] : []),
                ]}
                className="min-w-[120px]"
              />
            )}
            {canPromoteManager && (
              <button onClick={() => handleToggleManager(u.email, uRole)} disabled={actionLoading === u.email + 'manager'}
                className={`px-2 py-1 rounded-lg text-[0.65rem] font-semibold cursor-pointer border transition-all disabled:opacity-50 ${
                  uRole === 'manager' ? 'bg-orange-500/20 text-orange-300 border-orange-500/30' : 'bg-dark-bg3 text-dark-text2 border-dark-border hover:text-orange-400 hover:border-orange-500/30'
                }`} title={uRole === 'manager' ? 'Remove Manager' : 'Make Manager'}>
                {actionLoading === u.email + 'manager' ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-user-shield"></i>}
              </button>
            )}
            {canBan && (
              u.isBanned ? (
                <button onClick={() => handleBan(u.email, true)} disabled={actionLoading === u.email + 'unban'}
                  className="px-2.5 py-1 rounded-lg bg-green-500/15 text-green-400 text-[0.68rem] font-semibold cursor-pointer hover:bg-green-500/25 border border-green-500/20 disabled:opacity-50">
                  {actionLoading === u.email + 'unban' ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-check mr-0.5"></i>Unban</>}
                </button>
              ) : (
                <button onClick={() => handleBan(u.email, false)} disabled={actionLoading === u.email + 'ban'}
                  className="px-2.5 py-1 rounded-lg bg-red-500/15 text-red-400 text-[0.68rem] font-semibold cursor-pointer hover:bg-red-500/25 border border-red-500/20 disabled:opacity-50">
                  {actionLoading === u.email + 'ban' ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-ban mr-0.5"></i>Ban</>}
                </button>
              )
            )}
          </div>
        </div>
      </div>
    );
  };

  const TABS: { key: Tab; label: string; icon: string; color: string; show: boolean }[] = [
    { key: 'overview', label: 'Overview', icon: 'fa-chart-pie', color: 'text-qsis', show: isAdmin || isManager },
    { key: 'admins', label: 'Admins', icon: 'fa-crown', color: 'text-red-400', show: isSuperAdmin },
    { key: 'managers', label: 'Managers', icon: 'fa-user-shield', color: 'text-orange-400', show: isAdmin },
    { key: 'teachers', label: 'Teachers', icon: 'fa-chalkboard-teacher', color: 'text-green-400', show: isAdmin || isManager },
    { key: 'students', label: 'Students', icon: 'fa-user-graduate', color: 'text-blue-400', show: isAdmin || isManager },
    { key: 'users', label: 'All Users', icon: 'fa-users', color: 'text-dark-text2', show: isAdmin || isManager },
    { key: 'faculty', label: 'Faculty', icon: 'fa-building', color: 'text-teal-400', show: isAdmin || isManager || effectiveRole === 'teacher' },
    { key: 'courses', label: 'Courses', icon: 'fa-book', color: 'text-indigo-400', show: isAdmin || isManager || effectiveRole === 'teacher' || profile.isCR },
    { key: 'permissions', label: 'Permissions', icon: 'fa-key', color: 'text-amber-400', show: isAdmin },
    { key: 'contributors', label: 'Contributors', icon: 'fa-users', color: 'text-teal-400', show: isAdmin },
    { key: 'telegram', label: 'Telegram', icon: 'fa-paper-plane', color: 'text-cyan-400', show: isOwner },
    { key: 'activity', label: 'Activity Log', icon: 'fa-history', color: 'text-yellow-400', show: isAdmin || isManager },
  ];

  return (
    <section className="mb-5">
      <div className="mb-5">
        <h2 className="text-xl font-bold text-dark-text flex items-center gap-2">
          <i className="fas fa-shield-alt text-qsis"></i>Admin Panel
        </h2>
        <p className="text-[0.82rem] text-dark-text2 mt-1">
          {isAdmin ? 'Full admin access' : isManager ? 'Manager access — you can manage users but cannot change admin roles' : 'Teacher access — you can manage faculty members'}
        </p>
      </div>

      {loading && (
        <div className="text-center py-10">
          <i className="fas fa-spinner fa-spin text-2xl text-qsis"></i>
          <p className="text-dark-text2 mt-2 text-sm">Loading admin data...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
          <i className="fas fa-exclamation-triangle text-red-400 mr-2"></i>
          <span className="text-red-400 text-sm">{error}</span>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-5 p-1 bg-dark-bg2 border border-dark-border rounded-xl overflow-x-auto">
        {TABS.filter(t => t.show).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[0.75rem] font-semibold transition-all cursor-pointer border-none whitespace-nowrap ${
              activeTab === tab.key ? 'bg-qsis text-white' : 'bg-transparent text-dark-text2 hover:text-dark-text hover:bg-dark-bg3'
            }`}
          >
            <i className={`fas ${tab.icon} ${activeTab === tab.key ? 'text-white' : tab.color}`}></i>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && stats && (
        <div>
          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-5">
            {[
              { label: 'Total Users', value: stats.total, icon: 'fa-users', color: 'text-qsis', bg: 'from-qsis/10 to-qsis/5' },
              { label: 'Admins', value: stats.admins, icon: 'fa-crown', color: 'text-red-400', bg: 'from-red-500/10 to-red-500/5' },
              { label: 'Teachers', value: stats.teachers, icon: 'fa-chalkboard-teacher', color: 'text-green-400', bg: 'from-green-500/10 to-green-500/5' },
              { label: 'Students', value: stats.students, icon: 'fa-user-graduate', color: 'text-blue-400', bg: 'from-blue-500/10 to-blue-500/5' },
            ].map(s => (
              <div key={s.label} className={`bg-gradient-to-br ${s.bg} border border-dark-border rounded-xl p-4 text-center`}>
                <i className={`fas ${s.icon} text-xl ${s.color} mb-1.5`}></i>
                <p className="text-2xl font-bold text-dark-text">{s.value}</p>
                <p className="text-[0.68rem] text-dark-text3">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Secondary Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {[
              { label: 'Managers', value: (stats as any).managers || 0, icon: 'fa-user-shield', color: 'text-orange-400' },
              { label: 'Banned', value: stats.banned, icon: 'fa-ban', color: 'text-red-400' },
              { label: 'GitHub Connected', value: (stats as any).githubConnected || 0, icon: 'fab fa-github', color: 'text-purple-400' },
              { label: 'Faculty Members', value: overviewFacultyCount, icon: 'fa-building', color: 'text-teal-400' },
            ].map(s => (
              <div key={s.label} className="bg-dark-bg2 border border-dark-border rounded-xl p-3 text-center">
                <i className={`fas ${s.icon} text-sm ${s.color} mb-1`}></i>
                <p className="text-lg font-bold text-dark-text">{s.value}</p>
                <p className="text-[0.62rem] text-dark-text3">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            {/* Recent Logins */}
            {recentLogins.length > 0 && (
              <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-dark-text mb-3"><i className="fas fa-sign-in-alt text-qsis mr-2"></i>Recent Logins</h3>
                <div className="space-y-0">
                  {recentLogins.map(u => (
                    <div key={u.email} className="flex items-center gap-3 py-2 border-b border-dark-border/50 last:border-0">
                      <img src={u.githubAvatar || u.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name || u.email)}&background=6366f1&color=fff&bold=true&size=32`} alt="" className="w-7 h-7 rounded-full border border-dark-border object-cover flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[0.75rem] font-medium text-dark-text truncate">{u.name || u.email.split('@')[0]}</p>
                        <p className="text-[0.6rem] text-dark-text3">{u.lastSignIn ? formatDate(u.lastSignIn) : ''}</p>
                      </div>
                      {getRoleBadge(u.role)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-dark-text mb-3"><i className="fas fa-bolt text-yellow-400 mr-2"></i>Quick Actions</h3>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setActiveTab('users')} className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-dark-bg border border-dark-border hover:border-qsis/30 text-dark-text text-[0.75rem] font-medium cursor-pointer transition-all">
                  <i className="fas fa-users text-qsis"></i>Manage Users
                </button>
                <button onClick={() => setActiveTab('faculty')} className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-dark-bg border border-dark-border hover:border-qsis/30 text-dark-text text-[0.75rem] font-medium cursor-pointer transition-all">
                  <i className="fas fa-building text-teal-400"></i>Faculty
                </button>
                <button onClick={() => setActiveTab('activity')} className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-dark-bg border border-dark-border hover:border-qsis/30 text-dark-text text-[0.75rem] font-medium cursor-pointer transition-all">
                  <i className="fas fa-history text-yellow-400"></i>Activity Log
                </button>
                {isAdmin && (
                  <button onClick={() => setActiveTab('managers')} className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-dark-bg border border-dark-border hover:border-qsis/30 text-dark-text text-[0.75rem] font-medium cursor-pointer transition-all">
                    <i className="fas fa-user-shield text-orange-400"></i>Managers
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          {activities.length > 0 && (
            <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-dark-text"><i className="fas fa-clock text-qsis mr-2"></i>Recent Activity</h3>
                <span className="text-[0.65rem] text-dark-text3">{activities.length} recent logs</span>
              </div>
              <div className="space-y-0">
                {activities.slice(0, 10).map(a => {
                  const fa = formatAction(a.action);
                  let detailText = a.action.replace(/_/g, ' ');
                  try {
                    const d = JSON.parse(a.details);
                    if (d.count) detailText += ` (${d.count})`;
                    if (d.semester) detailText = `${d.semester}${d.branch ? ' / ' + d.branch : ''}`;
                    if (d.publisher) detailText += ` by ${d.publisher}`;
                  } catch {
                    if (a.details) detailText = a.details;
                  }
                  return (
                    <div key={a.id} className="flex items-center gap-3 py-2.5 border-b border-dark-border/50 last:border-0">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${fa.color.replace('text-', 'bg-').replace('400', '500/15').replace('500', '500/15')}`}>
                        <i className={`fas ${fa.icon} ${fa.color} text-xs`}></i>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[0.78rem] font-medium text-dark-text">{fa.label}</span>
                        </div>
                        <p className="text-[0.68rem] text-dark-text3 truncate">{a.userName || a.userId} &middot; {formatDate(a.createdAt)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {activities.length > 10 && (
                <button onClick={() => setActiveTab('activity')} className="mt-2 text-[0.72rem] text-qsis hover:underline cursor-pointer bg-transparent border-none">
                  View all {activities.length} activities <i className="fas fa-arrow-right ml-1"></i>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Admins Tab */}
      {activeTab === 'admins' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-dark-text"><i className="fas fa-crown text-red-400 mr-2"></i>Admins ({users.length})</h3>
            {isSuperAdmin && (
              <button onClick={() => setShowAddAdmin(!showAddAdmin)} className="px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 text-[0.75rem] font-semibold cursor-pointer hover:bg-red-500/25 border-none">
                <i className="fas fa-plus mr-1"></i>Add Admin
              </button>
            )}
          </div>
          {showAddAdmin && (
            <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4 mb-4 flex gap-2">
              <input value={newAdminEmail} onChange={e => setNewAdminEmail(e.target.value)} placeholder="Email to make admin" className="flex-1 px-3 py-2 rounded-lg bg-dark-bg border border-dark-border text-dark-text text-sm" />
              <button onClick={handleAddAdmin} disabled={!newAdminEmail.trim()} className="px-4 py-2 rounded-lg bg-qsis text-white text-[0.78rem] font-semibold cursor-pointer hover:opacity-90 border-none disabled:opacity-50">Add</button>
            </div>
          )}
          <div className="flex flex-col gap-2">
            {users.map(u => <UserRow key={u.email} u={u} />)}
          </div>
        </div>
      )}

      {/* Managers Tab */}
      {activeTab === 'managers' && (
        <div>
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-dark-text"><i className="fas fa-user-shield text-orange-400 mr-2"></i>Managers ({users.length})</h3>
            <p className="text-[0.75rem] text-dark-text3 mt-1">Managers can manage users, upload files, and publish routines. They cannot change admin roles or promote other managers.</p>
          </div>
          <div className="flex flex-col gap-2">
            {users.map(u => <UserRow key={u.email} u={u} />)}
          </div>
          {users.length === 0 && <p className="text-dark-text3 text-sm text-center py-8">No managers assigned yet</p>}
        </div>
      )}

      {/* Teachers / Students / Users Tabs */}
      {(activeTab === 'teachers' || activeTab === 'students' || activeTab === 'users') && (
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="text-sm font-semibold text-dark-text">
              {activeTab === 'teachers' && <><i className="fas fa-chalkboard-teacher text-green-400 mr-1"></i>Teachers ({users.length})</>}
              {activeTab === 'students' && <><i className="fas fa-user-graduate text-blue-400 mr-1"></i>Students ({users.length})</>}
              {activeTab === 'users' && <><i className="fas fa-users text-dark-text2 mr-1"></i>All Users ({users.length})</>}
            </h3>
            <div className="flex gap-2 items-center">
              {isAdmin && (
                <button onClick={() => setShowCreateUser(!showCreateUser)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-qsis/15 text-qsis text-[0.78rem] font-semibold hover:bg-qsis/25 transition-colors">
                  <i className="fas fa-user-plus"></i> Create User
                </button>
              )}
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by name or email..."
                className="px-3 py-1.5 rounded-lg bg-dark-bg border border-dark-border text-dark-text text-[0.78rem] w-60"
              />
            </div>
          </div>

          {/* Create User Form */}
          {showCreateUser && (
            <div className="bg-dark-bg2 border border-qsis/20 rounded-xl p-4 mb-4">
              <h4 className="text-[0.85rem] font-semibold text-dark-text mb-3"><i className="fas fa-user-plus text-qsis mr-1.5"></i>Create New User</h4>
              <p className="text-[0.72rem] text-dark-text3 mb-3">Create an account for any email address (including non-university emails). They can set their password via email.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-[0.72rem] text-dark-text2 block mb-1">Email *</label>
                  <input type="email" value={createUserForm.email} onChange={e => setCreateUserForm(p => ({ ...p, email: e.target.value }))} className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" placeholder="user@example.com" />
                </div>
                <div>
                  <label className="text-[0.72rem] text-dark-text2 block mb-1">Full Name</label>
                  <input type="text" value={createUserForm.name} onChange={e => setCreateUserForm(p => ({ ...p, name: e.target.value }))} className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" placeholder="John Doe" />
                </div>
                <div>
                  <label className="text-[0.72rem] text-dark-text2 block mb-1">Role *</label>
                  <CustomSelect
                    value={createUserForm.role}
                    onChange={(val) => setCreateUserForm(p => ({ ...p, role: val }))}
                    options={[
                      { value: 'user', label: 'User', icon: 'fa-user' },
                      { value: 'student', label: 'Student', icon: 'fa-user-graduate' },
                      { value: 'teacher', label: 'Teacher', icon: 'fa-chalkboard-teacher' },
                      { value: 'manager', label: 'Manager', icon: 'fa-user-shield' },
                      { value: 'admin', label: 'Admin', icon: 'fa-crown' },
                    ]}
                  />
                </div>
                <div>
                  <label className="text-[0.72rem] text-dark-text2 block mb-1">Department</label>
                  <input type="text" value={createUserForm.department} onChange={e => setCreateUserForm(p => ({ ...p, department: e.target.value }))} className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" placeholder="e.g. qsis" />
                </div>
                <div>
                  <label className="text-[0.72rem] text-dark-text2 block mb-1">Semester</label>
                  <CustomSelect
                    value={createUserForm.semester}
                    onChange={(val) => setCreateUserForm(p => ({ ...p, semester: val }))}
                    placeholder="None"
                    options={config.semesters.map(s => ({ value: s.id, label: s.label, icon: 'fa-calendar' }))}
                  />
                </div>
                <div>
                  <label className="text-[0.72rem] text-dark-text2 block mb-1">Section</label>
                  <input type="text" value={createUserForm.section} onChange={e => setCreateUserForm(p => ({ ...p, section: e.target.value }))} className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" placeholder="e.g. A" />
                </div>
              </div>
              {createUserError && <p className="text-[0.75rem] text-red-400 mb-2"><i className="fas fa-exclamation-circle mr-1"></i>{createUserError}</p>}
              {createUserSuccess && <p className="text-[0.75rem] text-green-400 mb-2"><i className="fas fa-check-circle mr-1"></i>{createUserSuccess}</p>}
              <div className="flex gap-2">
                <button onClick={() => { setShowCreateUser(false); setCreateUserError(''); setCreateUserSuccess(''); }} className="px-4 py-2 rounded-lg bg-dark-bg border border-dark-border text-dark-text2 text-[0.82rem] hover:bg-dark-bg3 transition-colors">Cancel</button>
                <button onClick={handleCreateUser} disabled={createUserLoading} className="px-4 py-2 rounded-lg bg-qsis text-white text-[0.82rem] font-semibold hover:bg-qsis/90 transition-colors disabled:opacity-50">
                  {createUserLoading ? <><i className="fas fa-spinner fa-spin mr-1"></i>Creating...</> : <><i className="fas fa-user-plus mr-1"></i>Create User</>}
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {users.map(u => <UserRow key={u.email} u={u} />)}
          </div>
        </div>
      )}

      {/* Faculty Tab */}
      {activeTab === 'faculty' && (
        <div>
          <h3 className="text-sm font-semibold text-dark-text mb-1"><i className="fas fa-building text-teal-400 mr-2"></i>Faculty Management</h3>
          <p className="text-[0.75rem] text-dark-text3 mb-4">Add and manage faculty members. Also available at <a href="/faculty" target="_blank" className="text-qsis underline">/faculty</a> with inline editing.</p>

          {/* Pending Faculty Requests */}
          {facultyRequests.length > 0 && (
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 mb-5">
              <h4 className="text-[0.82rem] font-semibold text-orange-400 mb-3"><i className="fas fa-inbox mr-1"></i>Pending Faculty Requests ({facultyRequests.length})</h4>
              <div className="space-y-2">
                {facultyRequests.slice(0, 5).map(r => (
                  <div key={r.id} className="flex items-center gap-3 bg-dark-bg2 rounded-lg p-3 border border-dark-border">
                    <div className="flex-1 min-w-0">
                      <p className="text-[0.8rem] text-dark-text font-medium">{r.name} <span className="text-dark-text3">— {r.department}</span></p>
                      <p className="text-[0.65rem] text-dark-text3">{r.title || 'No designation'}{r.email ? ` · ${r.email}` : ''} · Requested by {r.requesterId}</p>
                    </div>
                    <button onClick={async () => { await fetch('/api/faculty/request', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: r.id, action: 'approve' }) }); showToast(`${r.name} approved`, 'success'); loadFacultyRequests(); loadFaculty(); }}
                      className="px-2.5 py-1 rounded-lg bg-green-500/20 text-green-400 text-[0.65rem] font-semibold cursor-pointer hover:bg-green-500/30 border-none"><i className="fas fa-check mr-1"></i>Approve</button>
                    <button onClick={async () => { await fetch('/api/faculty/request', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: r.id, action: 'reject' }) }); showToast(`Request rejected`, 'success'); loadFacultyRequests(); }}
                      className="px-2.5 py-1 rounded-lg bg-red-500/20 text-red-400 text-[0.65rem] font-semibold cursor-pointer hover:bg-red-500/30 border-none"><i className="fas fa-times mr-1"></i>Reject</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bulk Import Toggle */}
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setBulkMode(!bulkMode)}
              className={`px-4 py-2 rounded-lg text-[0.78rem] font-semibold cursor-pointer border transition-all ${bulkMode ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'bg-dark-bg2 text-dark-text2 border-dark-border hover:text-dark-text'}`}>
              <i className="fas fa-file-import mr-1"></i>{bulkMode ? 'Single Entry Mode' : 'Bulk Import'}
            </button>
          </div>

          {/* Bulk Import Mode */}
          {bulkMode ? (
            <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4 mb-5">
              <h4 className="text-[0.82rem] font-semibold text-dark-text mb-2"><i className="fas fa-file-import text-orange-400 mr-1"></i>Bulk Import Faculty</h4>
              <p className="text-[0.7rem] text-dark-text3 mb-3">Paste JSON array or CSV. CSV headers: <code className="bg-dark-bg px-1 rounded text-qsis">department, name, title, email, phone, shortform, membertype</code></p>
              <textarea value={bulkInput} onChange={e => setBulkInput(e.target.value)}
                rows={8}
                placeholder={`JSON example:\n[\n  { "department": "Computer Science and Engineering", "name": "Dr. Ahmed", "title": "Professor", "email": "ahmed@iiuc.ac.bd" }\n]\n\nCSV example:\ndepartment,name,title,email\nComputer Science and Engineering,Dr. Ahmed,Professor,ahmed@iiuc.ac.bd`}
                className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.78rem] font-mono outline-none focus:border-qsis resize-y" />
              <div className="flex items-center gap-3 mt-3">
                <button onClick={handleBulkImport} disabled={bulkImporting || !bulkInput.trim()}
                  className="px-4 py-2 rounded-lg bg-orange-500 text-white text-[0.78rem] font-semibold cursor-pointer hover:opacity-90 border-none disabled:opacity-50">
                  {bulkImporting ? <><i className="fas fa-spinner fa-spin mr-1"></i>Importing...</> : <><i className="fas fa-file-import mr-1"></i>Import</>}
                </button>
                {bulkResult && (
                  <span className="text-[0.72rem] text-dark-text3">
                    <i className="fas fa-check-circle text-green-400 mr-1"></i>
                    {bulkResult.inserted} added, {bulkResult.updated} updated, {bulkResult.skipped} skipped
                  </span>
                )}
              </div>
              {bulkResult?.errors && bulkResult.errors.length > 0 && (
                <div className="mt-2 text-[0.7rem] text-red-400">
                  {bulkResult.errors.slice(0, 5).map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}
            </div>
          ) : (
            /* Add Faculty Form */
            <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4 mb-5">
              <h4 className="text-[0.82rem] font-semibold text-dark-text mb-3"><i className="fas fa-plus-circle text-qsis mr-1"></i>Add New Faculty / Staff</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="text-[0.7rem] text-dark-text2 block mb-1">Department *</label>
                  <CustomSelect
                    value={facultyForm.department}
                    onChange={(val) => setFacultyForm(f => ({ ...f, department: val }))}
                    placeholder="Select department..."
                    options={[
                      ...FACULTIES.flatMap(f => f.departments.map(d => ({
                        value: d.id,
                        label: `${d.shortName} — ${d.name}`,
                        icon: 'fa-building',
                        group: `${f.shortName} — ${f.name}`,
                      }))),
                    ]}
                  />
                </div>
                <div>
                  <label className="text-[0.7rem] text-dark-text2 block mb-1">Type *</label>
                  <CustomSelect
                    value={facultyForm.memberType || 'faculty'}
                    onChange={(val) => setFacultyForm(f => ({ ...f, memberType: val, title: '' }))}
                    options={[
                      { value: 'faculty', label: 'Faculty', icon: 'fa-chalkboard-teacher' },
                      { value: 'staff', label: 'Staff', icon: 'fa-user-tie' },
                    ]}
                  />
                </div>
                <div>
                  <label className="text-[0.7rem] text-dark-text2 block mb-1">Full Name *</label>
                  <input type="text" value={facultyForm.name} onChange={e => setFacultyForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Prof. Dr. Gias Uddin Hafiz" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" />
                </div>
                <div>
                  <label className="text-[0.7rem] text-dark-text2 block mb-1">Designation</label>
                  <CustomSelect
                    value={facultyForm.title}
                    onChange={(val) => setFacultyForm(f => ({ ...f, title: val }))}
                    placeholder="Select designation..."
                    options={(facultyForm.memberType === 'staff' ? STAFF_DESIGNATIONS : TEACHER_TITLES).map(t => ({ value: t, label: t, icon: 'fa-chalkboard-teacher' }))}
                  />
                </div>
                <div>
                  <label className="text-[0.7rem] text-dark-text2 block mb-1">Short Form</label>
                  <input type="text" value={facultyForm.shortForm} onChange={e => setFacultyForm(f => ({ ...f, shortForm: e.target.value.toUpperCase() }))} placeholder="e.g. GH" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" />
                </div>
                <div>
                  <label className="text-[0.7rem] text-dark-text2 block mb-1">Email</label>
                  <input type="email" value={facultyForm.email} onChange={e => setFacultyForm(f => ({ ...f, email: e.target.value }))} placeholder="yourname@iiuc.ac.bd" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" />
                </div>
                <div>
                  <label className="text-[0.7rem] text-dark-text2 block mb-1">Phone</label>
                  <input type="tel" value={facultyForm.phone} onChange={e => setFacultyForm(f => ({ ...f, phone: e.target.value }))} placeholder="+8801XXXXXXXXX" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" />
                </div>
              </div>
              <button onClick={handleAddFaculty} disabled={facultySaving || !facultyForm.department || !facultyForm.name} className="mt-3 px-4 py-2 rounded-lg bg-qsis text-white text-[0.78rem] font-semibold cursor-pointer hover:opacity-90 border-none disabled:opacity-50">
                {facultySaving ? <><i className="fas fa-spinner fa-spin mr-1"></i>Adding...</> : <><i className="fas fa-plus mr-1"></i>Add Member</>}
              </button>
            </div>
          )}

          {/* Faculty List */}
          <div className="bg-dark-bg2 border border-dark-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-dark-border">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[0.82rem] font-semibold text-dark-text"><i className="fas fa-list text-dark-text3 mr-1"></i>All Faculty ({facultyList.length})</h4>
                <button onClick={() => loadFaculty()} className="text-[0.72rem] text-dark-text2 hover:text-qsis bg-transparent border-none cursor-pointer"><i className="fas fa-sync mr-1"></i>Refresh</button>
              </div>
              {/* Filters */}
              <div className="flex flex-wrap gap-2">
                <CustomSelect
                  value={facultyDeptFilter}
                  onChange={setFacultyDeptFilter}
                  placeholder="All Departments"
                  className="max-w-[220px]"
                  options={[
                    { value: '', label: 'All Departments', icon: 'fa-building' },
                    ...FACULTIES.flatMap(f => f.departments.map(d => ({
                      value: d.id,
                      label: d.shortName,
                      icon: 'fa-building',
                      group: `${f.shortName} — ${f.name}`,
                    }))),
                  ]}
                />
                <CustomSelect
                  value={facultyTitleFilter}
                  onChange={setFacultyTitleFilter}
                  placeholder="All Designations"
                  className="max-w-[200px]"
                  options={[
                    { value: '', label: 'All Designations', icon: 'fa-chalkboard-teacher' },
                    ...availableTitles.map(t => ({ value: t, label: t, icon: 'fa-chalkboard-teacher' })),
                  ]}
                />
                {(facultyDeptFilter || facultyTitleFilter) && (
                  <button onClick={() => { setFacultyDeptFilter(''); setFacultyTitleFilter(''); }}
                    className="text-[0.7rem] text-dark-text3 hover:text-red-400 bg-transparent border-none cursor-pointer">
                    <i className="fas fa-times mr-0.5"></i>Clear
                  </button>
                )}
              </div>
            </div>
            {facultyList.length === 0 ? (
              <p className="text-dark-text3 text-sm text-center py-8">No faculty members found</p>
            ) : (
              <div className="divide-y divide-dark-border">
                {Array.from(groupedFaculty.entries()).map(([dept, members]) => {
                  const visibleCount = members.filter((m: any) => m.isVisible).length;
                  return (
                    <div key={dept}>
                      {/* Department Header */}
                      <div className="px-4 py-2.5 bg-dark-bg/80 flex items-center justify-between sticky top-0 z-10">
                        <div className="flex items-center gap-2">
                          <i className="fas fa-building text-teal-400 text-[0.7rem]"></i>
                          <span className="text-[0.78rem] font-semibold text-dark-text">{dept}</span>
                          <span className="text-[0.65rem] text-dark-text3">({members.length})</span>
                          <span className={`text-[0.6rem] px-1.5 py-0.5 rounded-full ${visibleCount > 0 ? 'bg-green-500/15 text-green-400' : 'bg-dark-bg3 text-dark-text3'}`}>
                            {visibleCount}/{members.length} visible
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => handleBulkVisibility(dept, true)}
                            className="px-2 py-1 rounded text-[0.62rem] text-green-400 bg-green-500/10 hover:bg-green-500/20 border-none cursor-pointer">
                            <i className="fas fa-eye mr-0.5"></i>Show All
                          </button>
                          <button onClick={() => handleBulkVisibility(dept, false)}
                            className="px-2 py-1 rounded text-[0.62rem] text-dark-text3 bg-dark-bg3 hover:text-red-400 border-none cursor-pointer">
                            <i className="fas fa-eye-slash mr-0.5"></i>Hide All
                          </button>
                        </div>
                      </div>
                      {/* Members */}
                      {members.map((m: any) => (
                        <div key={m.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-dark-bg/50 transition-colors group">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-qsis/20 to-accent/20 border border-dark-border flex items-center justify-center flex-shrink-0">
                            <span className="text-[0.68rem] font-bold text-qsis">{m.shortForm || m.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[0.82rem] font-medium text-dark-text truncate">{m.name}</span>
                              {m.title && <span className="text-[0.65rem] text-qsis">{m.title}</span>}
                              {m.memberType === 'staff' && <span className="text-[0.6rem] px-1 py-0.5 rounded bg-orange-500/15 text-orange-400">Staff</span>}
                            </div>
                            <p className="text-[0.7rem] text-dark-text3">{m.email ? `${m.email}` : ''}{m.phone ? ` · ${m.phone}` : ''}</p>
                          </div>
                          <button onClick={() => handleToggleVisibility(m.id, m.isVisible)}
                            className={`px-2 py-1 rounded text-[0.62rem] font-semibold cursor-pointer border transition-all ${
                              m.isVisible
                                ? 'bg-green-500/15 text-green-400 border-green-500/30 hover:bg-green-500/25'
                                : 'bg-dark-bg3 text-dark-text3 border-dark-border hover:text-dark-text'
                            }`} title={m.isVisible ? 'Visible publicly — click to hide' : 'Hidden — click to show publicly'}>
                            <i className={`fas ${m.isVisible ? 'fa-eye' : 'fa-eye-slash'} mr-0.5`}></i>
                            {m.isVisible ? 'Public' : 'Hidden'}
                          </button>
                          <button onClick={() => handleDeleteFaculty(m.id, m.name)} className="px-2 py-1 rounded bg-red-500/10 text-red-400 text-[0.65rem] cursor-pointer hover:bg-red-500/20 border-none opacity-0 group-hover:opacity-100 transition-opacity" title="Remove">
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Courses Tab */}
      {activeTab === 'courses' && <CoursesTab effectiveRole={effectiveRole} profile={profile} />}

      {/* Permissions Tab */}
      {activeTab === 'permissions' && <PermissionsTab />}

      {/* Contributors Tab */}
      {activeTab === 'contributors' && <ContributorsTab />}

      {/* Telegram Tab */}
      {activeTab === 'telegram' && (
        <TelegramTab isOwner={isOwner} />
      )}

      {/* Activity Log Tab */}
      {activeTab === 'activity' && (
        <div>
          <h3 className="text-sm font-semibold text-dark-text mb-3"><i className="fas fa-history text-yellow-400 mr-2"></i>Activity Log</h3>
          {activities.length === 0 && <p className="text-dark-text3 text-sm text-center py-8">No activity recorded yet</p>}
          {activities.map(a => {
            const fa = formatAction(a.action);
            return (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3 hover:bg-dark-bg/50 transition-colors border-b border-dark-border">
                <i className={`fas ${fa.icon} ${fa.color} text-sm`}></i>
                <div className="flex-1 min-w-0">
                  <p className="text-[0.78rem] text-dark-text">{a.details}</p>
                  <p className="text-[0.65rem] text-dark-text3">{a.userName || a.userId} &middot; {formatDate(a.createdAt)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {<ConfirmModal />}
    </section>
  );
}
