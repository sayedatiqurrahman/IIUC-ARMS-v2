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
import FacultyDeptTab from './FacultyDeptTab';
import { type UserRecord, type ActivityLog, type AdminStats, type Tab, type UserSubTab } from '@/components/admin/types';
import { ALL_ROLES, ALL_PERMISSION_ACTIONS } from '@/components/admin/constants';
import ContributorsTab from '@/components/admin/ContributorsTab';
import RoomsTab from '@/components/admin/RoomsTab';
import BatchesTab from '@/components/admin/BatchesTab';
import PermissionsTab from '@/components/admin/PermissionsTab';
import CoursesTab from '@/components/admin/CoursesTab';
import TelegramTab from '@/components/admin/TelegramTab';

export default function AdminPanelView() {
  const { data: session } = useSession();
  const { confirm, confirmDialog } = useConfirm();
  const router = useRouter();
  const profile = useAppStore(s => s.profile);

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [userSubTab, setUserSubTab] = useState<UserSubTab>('all');
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [firebaseNextPageToken, setFirebaseNextPageToken] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
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

  const loadUsers = useCallback((role?: string, search?: string, pageToken?: string, append = false) => {
    const params = new URLSearchParams();
    if (role && role !== 'all') params.set('role', role);
    if (search) params.set('search', search);
    if (pageToken) params.set('firebasePageToken', pageToken);
    if (append) setLoadingMore(true);
    fetch(`/api/admin/users?${params}`)
      .then(r => r.json())
      .then(data => {
        if (append) {
          setUsers(prev => [...prev, ...(data.users || [])]);
        } else {
          setUsers(data.users || []);
        }
        setFirebaseNextPageToken(data.firebaseNextPageToken || null);
        setLoadingMore(false);
      })
      .catch(() => setLoadingMore(false));
  }, []);

  useEffect(() => {
    if (!hasAdminAccess) return;
    if (activeTab === 'users') {
      loadUsers(userSubTab === 'all' ? undefined : userSubTab, searchQuery);
    }
  }, [hasAdminAccess, activeTab, userSubTab, searchQuery, loadUsers]);

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
        loadUsers(userSubTab === 'all' ? undefined : userSubTab, searchQuery);
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
        loadUsers(userSubTab === 'all' ? undefined : userSubTab, searchQuery);
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
        loadUsers(userSubTab === 'all' ? undefined : userSubTab, searchQuery);
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
        loadUsers(userSubTab === 'all' ? undefined : userSubTab, searchQuery);
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
        loadUsers(userSubTab === 'all' ? undefined : userSubTab, searchQuery);
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
    { key: 'users', label: 'All Users', icon: 'fa-users', color: 'text-dark-text2', show: isAdmin || isManager },
    { key: 'faculty', label: 'Faculty Members', icon: 'fa-chalkboard-teacher', color: 'text-teal-400', show: isAdmin || isManager || effectiveRole === 'teacher' },
    { key: 'facultyDept', label: 'Faculties & Depts', icon: 'fa-building', color: 'text-purple-400', show: isAdmin || isManager },
    { key: 'courses', label: 'Courses', icon: 'fa-book', color: 'text-indigo-400', show: isAdmin || isManager || effectiveRole === 'teacher' || profile.isCR },
    { key: 'rooms', label: 'Rooms', icon: 'fa-door-open', color: 'text-cyan-400', show: isAdmin || isManager || effectiveRole === 'teacher' },
    { key: 'batches', label: 'Batches', icon: 'fa-layer-group', color: 'text-purple-400', show: isAdmin || isManager || effectiveRole === 'teacher' || profile.isCR },
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

      {/* Tab Navigation - Sidebar + Content */}
      <div className="flex gap-4 mb-5">
        {/* Sidebar */}
        <div className="w-48 flex-shrink-0 hidden md:block">
          <div className="bg-dark-bg2 border border-dark-border rounded-xl p-2 sticky top-20">
            {/* Overview */}
            {(isAdmin || isManager) && (
              <button
                onClick={() => setActiveTab('overview')}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[0.75rem] font-semibold transition-all cursor-pointer border-none text-left ${
                  activeTab === 'overview' ? 'bg-qsis text-white' : 'bg-transparent text-dark-text2 hover:text-dark-text hover:bg-dark-bg3'
                }`}
              >
                <i className={`fas fa-chart-pie w-4 text-center ${activeTab === 'overview' ? 'text-white' : 'text-qsis'}`}></i>
                Overview
              </button>
            )}

            {/* Users */}
            {(isAdmin || isManager) && (
              <div className="mt-2">
                <p className="text-[0.6rem] uppercase tracking-wider text-dark-text3 px-3 mb-1">Users</p>
                <button
                  onClick={() => setActiveTab('users')}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[0.75rem] font-semibold transition-all cursor-pointer border-none text-left ${
                    activeTab === 'users' ? 'bg-qsis text-white' : 'bg-transparent text-dark-text2 hover:text-dark-text hover:bg-dark-bg3'
                  }`}
                >
                  <i className={`fas fa-users w-4 text-center ${activeTab === 'users' ? 'text-white' : 'text-dark-text2'}`}></i>
                  All Users
                </button>
              </div>
            )}

            {/* Academic */}
            {(isAdmin || isManager || effectiveRole === 'teacher') && (
              <div className="mt-2">
                <p className="text-[0.6rem] uppercase tracking-wider text-dark-text3 px-3 mb-1">Academic</p>
                <button
                  onClick={() => setActiveTab('faculty')}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[0.75rem] font-semibold transition-all cursor-pointer border-none text-left ${
                    activeTab === 'faculty' ? 'bg-qsis text-white' : 'bg-transparent text-dark-text2 hover:text-dark-text hover:bg-dark-bg3'
                  }`}
                >
                  <i className={`fas fa-chalkboard-teacher w-4 text-center ${activeTab === 'faculty' ? 'text-white' : 'text-teal-400'}`}></i>
                  Faculty Members
                </button>
                {(isAdmin || isManager) && (
                  <button
                    onClick={() => setActiveTab('facultyDept')}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[0.75rem] font-semibold transition-all cursor-pointer border-none text-left ${
                      activeTab === 'facultyDept' ? 'bg-qsis text-white' : 'bg-transparent text-dark-text2 hover:text-dark-text hover:bg-dark-bg3'
                    }`}
                  >
                    <i className={`fas fa-building w-4 text-center ${activeTab === 'facultyDept' ? 'text-white' : 'text-purple-400'}`}></i>
                    Faculties &amp; Depts
                  </button>
                )}
              </div>
            )}

            {/* Content */}
            {(isAdmin || isManager || effectiveRole === 'teacher' || !!profile?.isCR) && (
              <div className="mt-2">
                <p className="text-[0.6rem] uppercase tracking-wider text-dark-text3 px-3 mb-1">Content</p>
                <button
                  onClick={() => setActiveTab('courses')}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[0.75rem] font-semibold transition-all cursor-pointer border-none text-left ${
                    activeTab === 'courses' ? 'bg-qsis text-white' : 'bg-transparent text-dark-text2 hover:text-dark-text hover:bg-dark-bg3'
                  }`}
                >
                  <i className={`fas fa-book w-4 text-center ${activeTab === 'courses' ? 'text-white' : 'text-indigo-400'}`}></i>
                  Courses
                </button>
                <button
                  onClick={() => setActiveTab('rooms')}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[0.75rem] font-semibold transition-all cursor-pointer border-none text-left ${
                    activeTab === 'rooms' ? 'bg-qsis text-white' : 'bg-transparent text-dark-text2 hover:text-dark-text hover:bg-dark-bg3'
                  }`}
                >
                  <i className={`fas fa-door-open w-4 text-center ${activeTab === 'rooms' ? 'text-white' : 'text-cyan-400'}`}></i>
                  Rooms
                </button>
                <button
                  onClick={() => setActiveTab('batches')}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[0.75rem] font-semibold transition-all cursor-pointer border-none text-left ${
                    activeTab === 'batches' ? 'bg-qsis text-white' : 'bg-transparent text-dark-text2 hover:text-dark-text hover:bg-dark-bg3'
                  }`}
                >
                  <i className={`fas fa-layer-group w-4 text-center ${activeTab === 'batches' ? 'text-white' : 'text-purple-400'}`}></i>
                  Batches
                </button>
              </div>
            )}

            {/* System */}
            {isAdmin && (
              <div className="mt-2">
                <p className="text-[0.6rem] uppercase tracking-wider text-dark-text3 px-3 mb-1">System</p>
                <button
                  onClick={() => setActiveTab('permissions')}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[0.75rem] font-semibold transition-all cursor-pointer border-none text-left ${
                    activeTab === 'permissions' ? 'bg-qsis text-white' : 'bg-transparent text-dark-text2 hover:text-dark-text hover:bg-dark-bg3'
                  }`}
                >
                  <i className={`fas fa-key w-4 text-center ${activeTab === 'permissions' ? 'text-white' : 'text-amber-400'}`}></i>
                  Permissions
                </button>
                <button
                  onClick={() => setActiveTab('contributors')}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[0.75rem] font-semibold transition-all cursor-pointer border-none text-left ${
                    activeTab === 'contributors' ? 'bg-qsis text-white' : 'bg-transparent text-dark-text2 hover:text-dark-text hover:bg-dark-bg3'
                  }`}
                >
                  <i className={`fas fa-users w-4 text-center ${activeTab === 'contributors' ? 'text-white' : 'text-teal-400'}`}></i>
                  Contributors
                </button>
              </div>
            )}

            {/* Other */}
            {(isOwner || isAdmin || isManager) && (
              <div className="mt-2">
                <p className="text-[0.6rem] uppercase tracking-wider text-dark-text3 px-3 mb-1">Other</p>
                {isOwner && (
                  <button
                    onClick={() => setActiveTab('telegram')}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[0.75rem] font-semibold transition-all cursor-pointer border-none text-left ${
                      activeTab === 'telegram' ? 'bg-qsis text-white' : 'bg-transparent text-dark-text2 hover:text-dark-text hover:bg-dark-bg3'
                    }`}
                  >
                    <i className={`fas fa-paper-plane w-4 text-center ${activeTab === 'telegram' ? 'text-white' : 'text-cyan-400'}`}></i>
                    Telegram
                  </button>
                )}
                <button
                  onClick={() => setActiveTab('activity')}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[0.75rem] font-semibold transition-all cursor-pointer border-none text-left ${
                    activeTab === 'activity' ? 'bg-qsis text-white' : 'bg-transparent text-dark-text2 hover:text-dark-text hover:bg-dark-bg3'
                  }`}
                >
                  <i className={`fas fa-history w-4 text-center ${activeTab === 'activity' ? 'text-white' : 'text-yellow-400'}`}></i>
                  Activity Log
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Tab Bar */}
        <div className="flex-1 min-w-0">
          <div className="flex gap-1 mb-4 p-1 bg-dark-bg2 border border-dark-border rounded-xl overflow-x-auto md:hidden">
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
                <button onClick={() => { setActiveTab('users'); setUserSubTab('all'); }} className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-dark-bg border border-dark-border hover:border-qsis/30 text-dark-text text-[0.75rem] font-medium cursor-pointer transition-all">
                  <i className="fas fa-users text-qsis"></i>Manage Users
                </button>
                <button onClick={() => setActiveTab('faculty')} className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-dark-bg border border-dark-border hover:border-qsis/30 text-dark-text text-[0.75rem] font-medium cursor-pointer transition-all">
                  <i className="fas fa-building text-teal-400"></i>Faculty
                </button>
                <button onClick={() => setActiveTab('activity')} className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-dark-bg border border-dark-border hover:border-qsis/30 text-dark-text text-[0.75rem] font-medium cursor-pointer transition-all">
                  <i className="fas fa-history text-yellow-400"></i>Activity Log
                </button>
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

      {/* All Users Tab with Sub-tabs */}
      {activeTab === 'users' && (
        <div>
          {/* Sub-tab Navigation */}
          <div className="flex gap-1 mb-4 p-1 bg-dark-bg2 border border-dark-border rounded-xl overflow-x-auto">
            {([
              { key: 'all' as UserSubTab, label: 'All Users', icon: 'fa-users', color: 'text-dark-text2' },
              { key: 'admin' as UserSubTab, label: 'Admins', icon: 'fa-crown', color: 'text-red-400' },
              { key: 'manager' as UserSubTab, label: 'Managers', icon: 'fa-user-shield', color: 'text-orange-400' },
              { key: 'teacher' as UserSubTab, label: 'Teachers', icon: 'fa-chalkboard-teacher', color: 'text-green-400' },
              { key: 'student' as UserSubTab, label: 'Students', icon: 'fa-user-graduate', color: 'text-blue-400' },
            ]).map(sub => (
              <button
                key={sub.key}
                onClick={() => setUserSubTab(sub.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[0.73rem] font-semibold transition-all cursor-pointer border-none whitespace-nowrap ${
                  userSubTab === sub.key ? 'bg-qsis text-white' : 'bg-transparent text-dark-text2 hover:text-dark-text hover:bg-dark-bg3'
                }`}
              >
                <i className={`fas ${sub.icon} ${userSubTab === sub.key ? 'text-white' : sub.color}`}></i>
                {sub.label}
                {userSubTab === sub.key && <span className="ml-1 text-[0.65rem] opacity-80">({users.length})</span>}
              </button>
            ))}
          </div>

          {/* Add Admin (only on admin sub-tab) */}
          {userSubTab === 'admin' && isSuperAdmin && (
            <div className="mb-4">
              <button onClick={() => setShowAddAdmin(!showAddAdmin)} className="px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 text-[0.75rem] font-semibold cursor-pointer hover:bg-red-500/25 border-none">
                <i className="fas fa-plus mr-1"></i>Add Admin
              </button>
              {showAddAdmin && (
                <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4 mt-3 flex gap-2">
                  <input value={newAdminEmail} onChange={e => setNewAdminEmail(e.target.value)} placeholder="Email to make admin" className="flex-1 px-3 py-2 rounded-lg bg-dark-bg border border-dark-border text-dark-text text-sm" />
                  <button onClick={handleAddAdmin} disabled={!newAdminEmail.trim()} className="px-4 py-2 rounded-lg bg-qsis text-white text-[0.78rem] font-semibold cursor-pointer hover:opacity-90 border-none disabled:opacity-50">Add</button>
                </div>
              )}
            </div>
          )}

          {/* Search + Create User */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="text-sm font-semibold text-dark-text">
              {userSubTab === 'all' && <><i className="fas fa-users text-dark-text2 mr-1"></i>All Users</>}
              {userSubTab === 'admin' && <><i className="fas fa-crown text-red-400 mr-1"></i>Admins</>}
              {userSubTab === 'manager' && <><i className="fas fa-user-shield text-orange-400 mr-1"></i>Managers</>}
              {userSubTab === 'teacher' && <><i className="fas fa-chalkboard-teacher text-green-400 mr-1"></i>Teachers</>}
              {userSubTab === 'student' && <><i className="fas fa-user-graduate text-blue-400 mr-1"></i>Students</>}
              <span className="text-dark-text3 ml-1">({users.length})</span>
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

          {/* Users List */}
          <div className="flex flex-col gap-2">
            {users.map(u => <UserRow key={u.email} u={u} />)}
          </div>
          {users.length === 0 && !loading && (
            <div className="text-center py-10">
              <i className="fas fa-users text-3xl text-dark-text3 mb-3"></i>
              <p className="text-dark-text3 text-sm">No users found</p>
            </div>
          )}
          {firebaseNextPageToken && (
            <button
              onClick={() => loadUsers(userSubTab === 'all' ? undefined : userSubTab, searchQuery, firebaseNextPageToken, true)}
              disabled={loadingMore}
              className="mt-3 w-full py-2.5 rounded-xl border border-dark-border bg-dark-bg2 text-dark-text2 text-[0.78rem] font-semibold hover:bg-dark-bg3 hover:text-dark-text cursor-pointer transition-colors disabled:opacity-50"
            >
              {loadingMore ? <><i className="fas fa-spinner fa-spin mr-1.5"></i>Loading more users...</> : <><i className="fas fa-arrow-down mr-1.5"></i>Load more users</>}
            </button>
          )}
          {loadingMore && <p className="text-[0.68rem] text-dark-text3 text-center mt-1">Fetching from Firebase...</p>}
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

      {/* Faculty & Departments Tab */}
      {activeTab === 'facultyDept' && <FacultyDeptTab effectiveRole={effectiveRole} profile={profile} />}

      {/* Courses Tab */}
      {activeTab === 'courses' && <CoursesTab effectiveRole={effectiveRole} profile={profile} />}

      {/* Rooms Tab */}
      {activeTab === 'rooms' && <RoomsTab effectiveRole={effectiveRole} />}

      {/* Batches Tab */}
      {activeTab === 'batches' && <BatchesTab effectiveRole={effectiveRole} profile={profile} />}

      {/* Permissions Tab */}
      {activeTab === 'permissions' && <PermissionsTab />}

      {/* Contributors Tab */}
      {activeTab === 'contributors' && <ContributorsTab />}

      {/* Telegram Tab */}
      {activeTab === 'telegram' && (
        <TelegramTab isOwner={isOwner} effectiveRole={effectiveRole} />
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
        </div>{/* end flex-1 min-w-0 */}
      </div>{/* end flex gap-4 */}
      {confirmDialog}
    </section>
  );
}
