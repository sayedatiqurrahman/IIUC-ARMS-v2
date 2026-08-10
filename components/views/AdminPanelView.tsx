'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { config } from '@/lib/config';
import { showToast } from '@/lib/utils';
import { useAppStore } from '@/lib/store';
import { useConfirm } from '@/components/ConfirmModal';
import FacultyDeptTab from '@/components/faculty/FacultyDeptTab';
import { type UserRecord, type ActivityLog, type AdminStats, type Tab, type UserSubTab } from '@/components/admin/types';
import ContributorsTab from '@/components/admin/ContributorsTab';
import RoomsTab from '@/components/admin/RoomsTab';
import BatchesTab from '@/components/admin/BatchesTab';
import PermissionsTab from '@/components/admin/PermissionsTab';
import CoursesTab from '@/components/admin/CoursesTab';
import TelegramTab from '@/components/admin/TelegramTab';
import OverviewTab from '@/components/admin/OverviewTab';
import UsersTab from '@/components/admin/UsersTab';
import FacultyTab from '@/components/admin/FacultyTab';
import ActivityLogTab from '@/components/admin/ActivityLogTab';
import AdminSidebar from '@/components/admin/AdminSidebar';

interface AdminPanelViewProps {
  activeTab?: Tab;
  setActiveTab?: (tab: Tab) => void;
  showSidebar?: boolean;
}

export default function AdminPanelView({ activeTab: activeTabProp, setActiveTab: setActiveTabProp, showSidebar = true }: AdminPanelViewProps = {}) {
  const { data: session } = useSession();
  const { confirm, confirmDialog } = useConfirm();
  const router = useRouter();
  const profile = useAppStore(s => s.profile);

  const [internalTab, setInternalTab] = useState<Tab>('overview');
  const activeTab = activeTabProp ?? internalTab;
  const setActiveTab = setActiveTabProp ?? setInternalTab;
  const [userSubTab, setUserSubTab] = useState<UserSubTab>('all');
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);

  // Per-sub-tab pagination state so tabs never share each other's lists/pages
  const [userStates, setUserStates] = useState<Partial<Record<UserSubTab, { users: UserRecord[]; total: number; page: number; search: string; nextToken: string | null }>>>({});
  const userState = userStates[userSubTab] ?? { users: [] as UserRecord[], total: 0, page: 1, search: '', nextToken: null as string | null };
  const users = userState.users;
  const totalUsers = userState.total;
  const currentPage = userState.page;
  const searchQuery = userState.search;
  const firebaseNextPageToken = userState.nextToken;

  const patchUserState = (tab: UserSubTab, patch: Partial<typeof userState>) => {
    setUserStates(prev => ({
      ...prev,
      [tab]: { users: [], total: 0, page: 1, search: '', nextToken: null, ...prev[tab], ...patch },
    }));
  };
  const setCurrentPage = (page: number) => patchUserState(userSubTab, { page });
  const setSearchQuery = (q: string) => patchUserState(userSubTab, { search: q });
  const tabFromArgs = (role?: string, domain?: string): UserSubTab => {
    if (role === 'admin') return 'admin';
    if (role === 'manager') return 'manager';
    if (domain === 'teacher') return 'teacher';
    if (domain === 'student') return 'student';
    if (domain === 'external') return 'external';
    if (domain === 'pending') return 'pending';
    return 'all';
  };
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
  const [createUserForm, setCreateUserForm] = useState({ email: '', role: 'user', department: '', password: '' });
  const [createUserLoading, setCreateUserLoading] = useState(false);
  const [createUserError, setCreateUserError] = useState('');
  const [createUserSuccess, setCreateUserSuccess] = useState('');

  const email = session?.user?.email || profile.email || '';
  const effectiveRole = config.getEffectiveRole(email, profile.role);
  const isAdmin = effectiveRole === 'admin';
  const isManager = effectiveRole === 'manager';
  const isOwner = config.ownerEmails.includes(email.toLowerCase());
  const hasAdminAccess = isAdmin || isManager || effectiveRole === 'teacher';
  const canViewExternalUsers = isAdmin || isManager;
  const canManageFacultyDepts = isAdmin || isManager || profile.customPermissions?.manageFacultyDepts === true;
  const isSuperAdmin = config.ownerEmails.includes(email);
  const useSidebar = (isAdmin || isManager) && showSidebar !== false;

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

  const loadUsers = useCallback((role?: string, search?: string, pageToken?: string, append = false, domain?: string, page?: number) => {
    const tab = tabFromArgs(role, domain);
    const params = new URLSearchParams();
    if (role && role !== 'all') params.set('role', role);
    if (search) params.set('search', search);
    if (pageToken) params.set('firebasePageToken', pageToken);
    if (domain && domain !== 'all') params.set('domain', domain);
    if (page) params.set('page', String(page));
    params.set('limit', '10');
    if (append) setLoadingMore(true);
    fetch(`/api/admin/users?${params}`)
      .then(r => r.json())
      .then(data => {
        setUserStates(prev => {
          const cur = prev[tab] ?? { users: [], total: 0, page: 1, search: '', nextToken: null };
          return {
            ...prev,
            [tab]: {
              ...cur,
              users: append ? [...cur.users, ...(data.users || [])] : (data.users || []),
              total: data.total || data.users?.length || 0,
              nextToken: data.firebaseNextPageToken || null,
              page: page || cur.page,
            },
          };
        });
        setLoadingMore(false);
      })
      .catch(() => setLoadingMore(false));
  }, []);

  const refreshUsers = useCallback(() => {
    const domainFilter = userSubTab === 'student' ? 'student' : userSubTab === 'teacher' ? 'teacher' : userSubTab === 'external' ? 'external' : userSubTab === 'pending' ? 'pending' : undefined;
    const roleFilter = userSubTab === 'admin' ? 'admin' : userSubTab === 'manager' ? 'manager' : undefined;
    setCurrentPage(1);
    loadUsers(roleFilter, searchQuery, undefined, false, domainFilter, 1);
  }, [userSubTab, searchQuery, loadUsers]);

  useEffect(() => {
    if (!hasAdminAccess) return;
    if (activeTab === 'users') {
      const domainFilter = userSubTab === 'student' ? 'student' : userSubTab === 'teacher' ? 'teacher' : userSubTab === 'external' ? 'external' : userSubTab === 'pending' ? 'pending' : undefined;
      const roleFilter = userSubTab === 'admin' ? 'admin' : userSubTab === 'manager' ? 'manager' : undefined;
      setCurrentPage(1);
      loadUsers(roleFilter, searchQuery, undefined, false, domainFilter, 1);
    }
  }, [hasAdminAccess, activeTab, userSubTab, searchQuery, loadUsers]);

  const handleBan = async (targetEmail: string, isBanned: boolean) => {
    const action = isBanned ? 'unban' : 'ban';
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
        refreshUsers();
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
        refreshUsers();
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
        refreshUsers();
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
        refreshUsers();
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
        refreshUsers();
      } else {
        showToast(data.error || 'Failed', 'error');
      }
    } catch {
      showToast('Action failed', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const handleDeleteUser = async (targetEmail: string) => {
    if (!await confirm({ message: `Delete ${targetEmail} permanently from Firebase and database? This cannot be undone.`, title: 'Delete User', danger: true })) return;
    setActionLoading(targetEmail + 'delete');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetEmail, action: 'delete' }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        refreshUsers();
      } else {
        showToast(data.error || 'Failed', 'error');
      }
    } catch {
      showToast('Action failed', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const handleApprove = async (targetEmail: string) => {
    setActionLoading(targetEmail + 'approve');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetEmail, action: 'approve' }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        refreshUsers();
      } else {
        showToast(data.error || 'Failed', 'error');
      }
    } catch {
      showToast('Action failed', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const handleReject = async (targetEmail: string) => {
    if (!await confirm({ message: `Reject ${targetEmail}'s account? They will be banned.`, title: 'Reject Account', danger: true })) return;
    setActionLoading(targetEmail + 'reject');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetEmail, action: 'reject' }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        refreshUsers();
      } else {
        showToast(data.error || 'Failed', 'error');
      }
    } catch {
      showToast('Action failed', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const handleSendToPending = async (targetEmail: string) => {
    if (!await confirm({ message: `Move ${targetEmail} back to Pending Approval? They will immediately lose access until approved again.`, title: 'Move to Pending', danger: true })) return;
    setActionLoading(targetEmail + 'pending');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetEmail, action: 'sendToPending' }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        refreshUsers();
      } else {
        showToast(data.error || 'Failed', 'error');
      }
    } catch {
      showToast('Action failed', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const [approveAllLoading, setApproveAllLoading] = useState(false);
  const handleApproveAll = async () => {
    if (!await confirm({ message: 'Approve ALL pending external accounts? They will gain access immediately.', title: 'Approve All Pending', danger: true })) return;
    setApproveAllLoading(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approveAllPending' }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        refreshUsers();
      } else {
        showToast(data.error || 'Failed', 'error');
      }
    } catch {
      showToast('Action failed', 'error');
    } finally {
      setApproveAllLoading(false);
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
        setCreateUserForm({ email: '', role: 'user', department: '', password: '' });
        setShowCreateUser(false);
        refreshUsers();
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

  const TABS: { key: Tab; label: string; icon: string; color: string; show: boolean }[] = [
    { key: 'overview', label: 'Overview', icon: 'fa-chart-pie', color: 'text-qsis', show: isAdmin || isManager },
    { key: 'users', label: 'All Users', icon: 'fa-users', color: 'text-dark-text2', show: isAdmin || isManager },
    { key: 'faculty', label: 'Faculty Members', icon: 'fa-chalkboard-teacher', color: 'text-teal-400', show: isAdmin || isManager },
    { key: 'facultyDept', label: 'Faculties & Depts', icon: 'fa-building', color: 'text-purple-400', show: canManageFacultyDepts },
    { key: 'courses', label: 'Courses', icon: 'fa-book', color: 'text-indigo-400', show: isAdmin || isManager || effectiveRole === 'teacher' || profile.isCR },
    { key: 'rooms', label: 'Rooms', icon: 'fa-door-open', color: 'text-cyan-400', show: isAdmin || isManager || effectiveRole === 'teacher' },
    { key: 'batches', label: 'Batches', icon: 'fa-layer-group', color: 'text-purple-400', show: isAdmin || isManager || effectiveRole === 'teacher' || profile.isCR },
    { key: 'permissions', label: 'Permissions', icon: 'fa-key', color: 'text-amber-400', show: isAdmin },
    { key: 'contributors', label: 'Contributors', icon: 'fa-users', color: 'text-teal-400', show: isAdmin },
    { key: 'telegram', label: 'Telegram', icon: 'fa-paper-plane', color: 'text-cyan-400', show: isOwner },
    { key: 'activity', label: 'Activity Log', icon: 'fa-history', color: 'text-yellow-400', show: isAdmin || isManager },
  ];

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

  return (
    <section className="mb-5">
      <div className="mb-5">
        <h2 className="text-xl font-bold text-dark-text flex items-center gap-2">
          <i className="fas fa-shield-alt text-qsis"></i>Admin Panel
        </h2>
        <p className="text-[0.82rem] text-dark-text2 mt-1">
          {isAdmin ? 'Full admin access' : isManager ? 'Manager access — you can manage users but cannot change admin roles' : 'Teacher access — you can manage faculty, courses, rooms, and batches'}
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

      {/* Tab Navigation - Sidebar (admin/manager) + Inline tabs (teacher/custom permission) */}
      <div className="flex gap-4 mb-5">
        {useSidebar && (
          <AdminSidebar
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            isAdmin={isAdmin}
            isManager={isManager}
            isOwner={isOwner}
            effectiveRole={effectiveRole}
            profileIsCR={profile?.isCR}
            canManageFacultyDepts={canManageFacultyDepts}
          />
        )}

        <div className="flex-1 min-w-0">
          {/* Inline Tab Bar - always visible for teacher/custom permission, mobile-only for admin/manager */}
          <div className={`flex gap-1 mb-4 p-1 bg-dark-bg2 border border-dark-border rounded-xl overflow-x-auto scrollbar-thin ${useSidebar ? 'md:hidden' : ''}`}>
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

        <div>
      {/* Overview Tab */}
      {activeTab === 'overview' && stats && (
        <OverviewTab
          stats={stats}
          activities={activities}
          overviewFacultyCount={overviewFacultyCount}
          recentLogins={recentLogins}
          setActiveTab={setActiveTab}
          setUserSubTab={setUserSubTab}
        />
      )}

      {/* All Users Tab with Sub-tabs */}
      {activeTab === 'users' && (
        <UsersTab
          users={users}
          totalUsers={totalUsers}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          loading={loading}
          loadingMore={loadingMore}
          firebaseNextPageToken={firebaseNextPageToken}
          userSubTab={userSubTab}
          setUserSubTab={setUserSubTab}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          showCreateUser={showCreateUser}
          setShowCreateUser={setShowCreateUser}
          createUserForm={createUserForm}
          setCreateUserForm={setCreateUserForm}
          createUserLoading={createUserLoading}
          createUserError={createUserError}
          createUserSuccess={createUserSuccess}
          showAddAdmin={showAddAdmin}
          setShowAddAdmin={setShowAddAdmin}
          newAdminEmail={newAdminEmail}
          setNewAdminEmail={setNewAdminEmail}
          isSuperAdmin={isSuperAdmin}
          isAdmin={isAdmin}
          isManager={isManager}
          canViewExternalUsers={canViewExternalUsers}
          email={email}
          actionLoading={actionLoading}
          handleCreateUser={handleCreateUser}
          handleAddAdmin={handleAddAdmin}
          handleToggleCR={handleToggleCR}
          handleToggleACR={handleToggleACR}
          handleSetRole={handleSetRole}
          handleBan={handleBan}
          handleToggleManager={handleToggleManager}
          handleApprove={handleApprove}
          handleReject={handleReject}
          handleDeleteUser={handleDeleteUser}
          handleSendToPending={handleSendToPending}
          handleApproveAll={handleApproveAll}
          approveAllLoading={approveAllLoading}
          loadUsers={loadUsers}
          setCreateUserError={setCreateUserError}
          setCreateUserSuccess={setCreateUserSuccess}
        />
      )}

      {/* Faculty Tab */}
      {activeTab === 'faculty' && (
        <FacultyTab
          facultyList={facultyList}
          facultyForm={facultyForm}
          setFacultyForm={setFacultyForm}
          facultySaving={facultySaving}
          bulkMode={bulkMode}
          setBulkMode={setBulkMode}
          bulkInput={bulkInput}
          setBulkInput={setBulkInput}
          bulkImporting={bulkImporting}
          bulkResult={bulkResult}
          facultyRequests={facultyRequests}
          facultyDeptFilter={facultyDeptFilter}
          setFacultyDeptFilter={setFacultyDeptFilter}
          facultyTitleFilter={facultyTitleFilter}
          setFacultyTitleFilter={setFacultyTitleFilter}
          groupedFaculty={groupedFaculty}
          availableTitles={availableTitles}
          handleAddFaculty={handleAddFaculty}
          handleBulkImport={handleBulkImport}
          handleToggleVisibility={handleToggleVisibility}
          handleBulkVisibility={handleBulkVisibility}
          handleDeleteFaculty={handleDeleteFaculty}
          loadFaculty={loadFaculty}
          loadFacultyRequests={loadFacultyRequests}
        />
      )}

      {/* Faculty & Departments Tab */}
      {activeTab === 'facultyDept' && <FacultyDeptTab effectiveRole={effectiveRole} profile={profile} canManage={canManageFacultyDepts} />}

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
      {activeTab === 'activity' && <ActivityLogTab activities={activities} />}
        </div>{/* end content */}
        </div>{/* end flex-1 min-w-0 */}
      </div>{/* end flex gap-4 */}
      {confirmDialog}
    </section>
  );
}
