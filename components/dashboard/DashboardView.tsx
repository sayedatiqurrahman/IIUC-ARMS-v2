'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useAppStore } from '@/lib/store';
import { config } from '@/lib/config';
import { getFileIconByType, showToast, timeAgo } from '@/lib/utils';
import { updateUserProfile } from '@/lib/firebase';
import { useConfirm } from '@/components/ConfirmModal';
import DashboardSidebar from './DashboardSidebar';
import {
  ProfileCard,
  TeacherInfoSection,
  AccountLinkingSection,
  GitHubConnection,
  SecuritySection,
} from '@/components/dashboard';
import TelegramVerify from './TelegramVerify';
import { useUrlTab } from '@/lib/use-url-tabs';
import InstallAppButton from './InstallAppButton';
import AdminPanelView from '@/components/views/AdminPanelView';
import { useUserAccess } from '@/lib/useUserAccess';
import { filterAdminNav } from '@/components/admin/nav';

// Deep-linkable tabs: /dashboard?tab=profile, /dashboard?tab=admin-panel&admin=permissions
const SECTION_KEYS: readonly string[] = ['overview', 'profile', 'activity', 'github', 'security', 'batch', 'cr-tools', 'teacher-info', 'admin-panel'];
const ADMIN_KEYS: readonly string[] = ['overview', 'users', 'faculty', 'facultyDept', 'courses', 'rooms', 'batches', 'permissions', 'roles', 'contributors', 'telegram', 'activity'];

function extractUniversityId(email: string): string {
  const match = email.match(/^(q\d+)/i);
  return match ? match[1].toUpperCase() : '';
}

export default function DashboardView() {
  const router = useRouter();
  const { data: session } = useSession();
  const { confirm, confirmDialog } = useConfirm();
  const profile = useAppStore(s => s.profile);
  const updateProfile = useAppStore(s => s.updateProfile);
  const recentReads = useAppStore(s => s.recentReads);
  const openRecentFile = useAppStore(s => s.openRecentFile);
  const setUploadOpen = useAppStore(s => s.setUploadOpen);
  const clearOnboarding = useAppStore(s => s.clearOnboarding);
  const loadProfile = useAppStore(s => s.loadProfile);

  const [activeSection, setActiveSection] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminTab, setAdminTab] = useState('overview');

  // Deep-linkable tabs: /dashboard?tab=profile, /dashboard?tab=admin-panel&admin=permissions
  const setSectionWithUrl = useUrlTab('tab', activeSection, setActiveSection, SECTION_KEYS);
  const setAdminTabWithUrl = useUrlTab('admin', adminTab, setAdminTab, ADMIN_KEYS);

  const [editingProfile, setEditingProfile] = useState(false);
  const [editingSocials, setEditingSocials] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [profileForm, setProfileForm] = useState({
    universityId: '', name: '', whatsapp: '', phone: '', telegramId: '', semester: '', section: '', department: '', batchId: '', session: '',
    facebook: '', twitter: '', linkedin: '', website: '',
    company: '', companyUrl: '', publicEmail: '',
    hideWhatsapp: false, hideUniversityId: false, hideSemester: false, hideEmail: false, hideCompany: false, showInContributors: true,
    profileType: '',
  });

  const [switchCRMode, setSwitchCRMode] = useState(false);
  const [switchCRLoading, setSwitchCRLoading] = useState(false);
  const [switchCRMsg, setSwitchCRMsg] = useState('');
  const [switchCRErr, setSwitchCRErr] = useState('');
  const [sectionPeers, setSectionPeers] = useState<any[]>([]);
  const [fetchingPeers, setFetchingPeers] = useState(false);

  const hasGitHub = !!(session as any)?.accessToken || !!profile.githubLogin || !!profile.githubToken;
  const email = (session as any)?.user?.email || profile.email || '';
  const effectiveRole = config.getEffectiveRole(email, profile.role);
  const isVersityEmail = /@(?:ugrad\.)?iiuc\.ac\.bd$/i.test(email);
  const isStudentEmail = /@ugrad\.iiuc\.ac\.bd$/i.test(email);
  const isTeacherEmail = isVersityEmail && !isStudentEmail;
  const isStudent = effectiveRole === 'student' || isStudentEmail;
  const isTeacherOrAbove = effectiveRole === 'admin' || effectiveRole === 'manager' || effectiveRole === 'teacher';
  const isTeacherUser = effectiveRole === 'teacher' || isTeacherEmail;
  const isAdmin = effectiveRole === 'admin';
  // Non-versity admins choose their own info type (teacher / student / maintainer).
  const isNonVersityAdmin = isAdmin && !isVersityEmail;
  const profileType = (profile as any).profileType || '';
  // Admins with a non-versity email decide which section they fill; otherwise
  // the versity email decides. Teacher info never shows for students and vice versa.
  const showStudentSection = isNonVersityAdmin ? profileType === 'student' : (isStudent || effectiveRole === 'manager' || (isAdmin && isStudentEmail));
  const showTeacherSection = isNonVersityAdmin ? profileType === 'teacher' : isTeacherUser;
  const { has, hasAdminPanelAccess, hasCoursePerms } = useUserAccess(
    email,
    effectiveRole,
    !!profile.isCR,
    (profile as any).customPermissions || {}
  );
  const isManager = effectiveRole === 'manager';
  const isOwner = config.ownerEmails.includes(email.toLowerCase());
  const hasAdminAccess = hasAdminPanelAccess;
  const canManageFacultyDepts = isAdmin || isManager || has('manageFacultyDepts');
  const [ghUser, setGhUser] = useState<any>(null);
  const [ghStats, setGhStats] = useState<any>(null);
  const [personalActivity, setPersonalActivity] = useState<any[]>([]);

  useEffect(() => {
    if (!email) return;
    fetch('/api/activity/personal?limit=10')
      .then(r => r.json())
      .then(data => setPersonalActivity(data.activities || []))
      .catch(() => {});
  }, [email]);

  const [showTokenModal, setShowTokenModal] = useState(false);
  const [patInput, setPatInput] = useState('');
  const [patLoading, setPatLoading] = useState(false);
  const [patValid, setPatValid] = useState<boolean | null>(null);
  const [patReplacing, setPatReplacing] = useState(false);

  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpLoading, setTotpLoading] = useState(false);
  const [totpSetupMode, setTotpSetupMode] = useState(false);
  const [totpQR, setTotpQR] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [totpMsg, setTotpMsg] = useState('');
  const [totpErrMsg, setTotpErrMsg] = useState('');
  const [totpDisableMode, setTotpDisableMode] = useState(false);
  const [totpDisableCode, setTotpDisableCode] = useState('');
  const [totpMethods, setTotpMethods] = useState<string[]>(['email']);
  const [totpMethodsLoading, setTotpMethodsLoading] = useState(false);

  useEffect(() => { loadProfile(); }, []);

  useEffect(() => {
    const token = profile.githubToken;
    if (!token || !token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
      setPatValid(null);
      return;
    }
    fetch('https://api.github.com/user', {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
    }).then(r => setPatValid(r.ok)).catch(() => setPatValid(false));
  }, [profile.githubToken]);

  useEffect(() => {
    const user = (session as any)?.user;
    if (!user?.email) return;
    fetch('/api/auth/totp/check')
      .then(r => r.json())
      .then(d => { if (d.totpEnabled) setTotpEnabled(true); if (d.totpMethods) setTotpMethods(d.totpMethods); })
      .catch(() => {});
  }, [session]);

  useEffect(() => {
    const email = profile.email || (session as any)?.user?.email || '';
    if (email && !profile.universityId) {
      const extracted = extractUniversityId(email);
      if (extracted) updateProfile({ universityId: extracted });
    }
  }, [profile.email, profile.universityId]);

  const displayName = profile.name || (session as any)?.user?.name || 'User';
  const displayEmail = profile.publicEmail || profile.email || session?.user?.email || '';
  const displayImage = profile.image || (session as any)?.user?.image || '';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ghToken = params.get('gh_token');
    const ghLogin = params.get('gh_login');
    const ghInstall = params.get('gh_install');
    const ghError = params.get('error');
    if (ghToken && ghLogin) {
      useAppStore.setState(s => ({
        profile: { ...s.profile, githubLogin: ghLogin, githubToken: ghToken, githubInstallationId: ghInstall || '' },
        githubToken: ghToken,
      }));
      fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ githubLogin: ghLogin, githubToken: ghToken, githubInstallationId: ghInstall || '' }),
      }).catch(() => {});
      fetch('/api/github/sync-profile', { method: 'POST' }).catch(() => {});
      showToast(`Connected as @${ghLogin}!`, 'success');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (ghError) {
      showToast(`GitHub Error: ${ghError}`, 'error');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!profile.githubToken || !hasGitHub) return;
    fetch('/api/github/sync-profile', { method: 'POST' }).catch(() => {});
    if (profile.githubLogin) {
      setGhUser({
        login: profile.githubLogin,
        name: profile.githubLogin,
        avatar_url: profile.githubAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.githubLogin)}&background=333&color=fff&bold=true&size=80`,
      });
    }
    const ghHeaders = { Authorization: `token ${profile.githubToken}`, Accept: 'application/vnd.github.v3+json' };
    fetch('https://api.github.com/user', { headers: ghHeaders })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setGhUser((prev: any) => ({ ...prev, name: data.name || prev?.name || profile.githubLogin, avatar_url: data.avatar_url || prev?.avatar_url }));
          return fetch(`https://api.github.com/users/${data.login}`, { headers: ghHeaders });
        }
      })
      .then(r => r?.json())
      .then(data => { if (data) setGhStats(data); })
      .catch(() => {});
  }, [profile.githubToken, profile.githubLogin, profile.githubAvatar, hasGitHub]);

  async function handleDisconnect() {
    if (!await confirm({ message: 'Disconnect this GitHub account? You can reconnect later.', danger: true, title: 'Disconnect GitHub' })) return;
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ githubLogin: '', githubToken: '', githubInstallationId: '', githubAvatar: '' }),
      });
      if (!res.ok) throw new Error('Failed to save');
      useAppStore.setState(s => ({
        profile: { ...s.profile, githubLogin: '', githubToken: '', githubInstallationId: '', githubAvatar: '' },
        githubToken: '',
      }));
      setGhUser(null);
      setGhStats(null);
      setPatValid(null);
      localStorage.removeItem('patSkipForever');
      localStorage.removeItem('patAskCount');
      showToast('GitHub disconnected', 'success');
    } catch {
      showToast('Disconnect failed. Please try again.', 'error');
    }
  }

  async function handlePastePAT() {
    const token = patInput.trim();
    if (!token) return;
    setPatLoading(true);
    try {
      const res = await fetch('https://api.github.com/user', {
        headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
      });
      if (!res.ok) {
        showToast('Invalid token. Please check and try again.', 'error');
        setPatLoading(false);
        return;
      }
      const ghUser = await res.json();
      await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ githubLogin: ghUser.login, githubToken: token, githubAvatar: ghUser.avatar_url }),
      });
      useAppStore.setState(s => ({
        profile: { ...s.profile, githubLogin: ghUser.login, githubToken: token, githubAvatar: ghUser.avatar_url },
        githubToken: token,
      }));
      setPatValid(true);
      setPatReplacing(false);
      setGhUser({ login: ghUser.login, name: ghUser.name || ghUser.login, avatar_url: ghUser.avatar_url });
      setShowTokenModal(false);
      setPatInput('');
      showToast(`Connected as @${ghUser.login}!`, 'success');
      for (const { owner, repo } of config.githubStarRepos) {
        fetch(`https://api.github.com/user/starred/${owner}/${repo}`, {
          method: 'PUT',
          headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Length': '0' },
        }).catch(() => {});
      }
      fetch(`https://api.github.com/user/following/${config.owner}`, {
        method: 'PUT',
        headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
      }).catch(() => {});
      fetch('/api/github/sync-profile', { method: 'POST' }).catch(() => {});
    } catch {
      showToast('Failed to connect. Please try again.', 'error');
    } finally {
      setPatLoading(false);
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('Image must be under 2MB.'); return; }
    setUploadingAvatar(true);
    try {
      const base64 = await file.arrayBuffer().then(buf => {
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return 'data:image/jpeg;base64,' + btoa(binary);
      });
      await updateProfile({ image: base64 });
      try { await updateUserProfile(undefined, base64); } catch {}
      showToast('Profile picture updated!', 'success');
    } catch {
      showToast('Failed to update picture', 'error');
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  }

  const socialLinks = [
    profile.website && { icon: 'fas fa-globe', label: 'Website', url: profile.website },
    profile.facebook && { icon: 'fab fa-facebook', label: 'Facebook', url: profile.facebook },
    profile.twitter && { icon: 'fab fa-twitter', label: 'Twitter', url: profile.twitter },
    profile.linkedin && { icon: 'fab fa-linkedin', label: 'LinkedIn', url: profile.linkedin },
  ].filter(Boolean) as { icon: string; label: string; url: string }[];

  const handleTotpSetup = async () => {
    setTotpErrMsg(''); setTotpMsg(''); setTotpLoading(true);
    try {
      const res = await fetch('/api/auth/totp/setup', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setTotpErrMsg(data.error || 'Failed to start setup'); setTotpLoading(false); return; }
      setTotpQR(data.qrCode);
      setTotpSecret(data.secret);
      setTotpSetupMode(true);
    } catch { setTotpErrMsg('Failed to connect to server'); }
    finally { setTotpLoading(false); }
  };

  const handleTotpVerify = async () => {
    if (totpCode.length !== 6) return;
    setTotpErrMsg(''); setTotpMsg(''); setTotpLoading(true);
    try {
      const res = await fetch('/api/auth/totp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: totpCode }),
      });
      const data = await res.json();
      if (!res.ok) { setTotpErrMsg(data.error || 'Invalid code'); setTotpLoading(false); return; }
      setTotpEnabled(true);
      setTotpSetupMode(false);
      setTotpQR(''); setTotpSecret(''); setTotpCode('');
      setTotpMsg('Two-factor authentication enabled!');
    } catch { setTotpErrMsg('Verification failed'); }
    finally { setTotpLoading(false); }
  };

  const handleTotpDisable = async () => {
    if (totpDisableCode.length !== 6) return;
    setTotpErrMsg(''); setTotpMsg(''); setTotpLoading(true);
    try {
      const res = await fetch('/api/auth/totp/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: totpDisableCode }),
      });
      const data = await res.json();
      if (!res.ok) { setTotpErrMsg(data.error || 'Invalid code'); setTotpLoading(false); return; }
      setTotpEnabled(false);
      setTotpDisableMode(false);
      setTotpDisableCode('');
      setTotpMsg('Two-factor authentication disabled.');
    } catch { setTotpErrMsg('Failed to disable'); }
    finally { setTotpLoading(false); }
  };

  const handleTotpMethodsSave = async (methods: string[]) => {
    setTotpMethodsLoading(true);
    try {
      const res = await fetch('/api/auth/totp/methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ methods }),
      });
      const data = await res.json();
      if (res.ok && data.totpMethods) {
        setTotpMethods(data.totpMethods);
        setTotpMsg('Login method preferences saved!');
      }
    } catch { setTotpErrMsg('Failed to save preferences'); }
    finally { setTotpMethodsLoading(false); }
  };

  const adminMenuItems: { id: string; label: string; icon: string; color?: string }[] = filterAdminNav({
    isAdmin,
    isManager,
    isOwner,
    effectiveRole,
    profileIsCR: !!profile.isCR,
    canManageFacultyDepts,
    isTeacherUser,
    hasCoursePerms,
    has,
  }).flatMap(group => group.items).map(item => ({ id: item.key, label: item.label, icon: item.icon, color: item.color }));

  const handleAdminNavigate = (tab: string) => {
    setSectionWithUrl('admin-panel');
    setAdminTabWithUrl(tab);
    setSidebarOpen(false);
  };

  function renderContent() {
    switch (activeSection) {
      case 'overview':
        return (
          <div className="space-y-4">
            {/* Welcome card */}
            {effectiveRole === 'external' && (
              <div className="bg-gradient-to-br from-purple-500/10 to-indigo-500/5 border border-purple-500/20 rounded-2xl p-5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <i className="fas fa-globe text-purple-400 text-[1.1rem]"></i>
                  </div>
                  <div>
                    <h4 className="text-[0.95rem] font-bold text-dark-text mb-1">Welcome to IIUC-ARMS</h4>
                    <p className="text-[0.8rem] text-dark-text2 leading-relaxed mb-2">
                      This is an academic resource management system for <strong>IIUC</strong> students and faculty. You signed in with a personal email, so your access is limited.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 text-purple-400 text-[0.72rem] font-medium"><i className="fas fa-info-circle"></i> Read-only</span>
                      <InstallAppButton />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Profile summary */}
            <ProfileCard
              profile={profile} displayImage={displayImage} displayName={displayName} displayEmail={displayEmail}
              hasGitHub={hasGitHub} ghUser={ghUser} isStudent={isStudent} isTeacherOrAbove={isTeacherOrAbove} isTeacherUser={isTeacherUser} isAdmin={isAdmin} isNonVersityAdmin={isNonVersityAdmin} showStudentSection={showStudentSection} showTeacherSection={showTeacherSection}
              editingProfile={editingProfile} editingSocials={editingSocials}
              profileForm={profileForm} setProfileForm={setProfileForm}
              setEditingProfile={setEditingProfile} setEditingSocials={setEditingSocials}
              updateProfile={updateProfile} socialLinks={socialLinks}
              uploadingAvatar={uploadingAvatar} avatarInputRef={avatarInputRef} handleAvatarUpload={handleAvatarUpload}
            />

            {/* GitHub Connection Highlight */}
            {!hasGitHub && (
              <div className="bg-gradient-to-br from-gray-500/10 to-gray-600/5 border border-gray-500/20 rounded-2xl p-5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gray-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <i className="fab fa-github text-gray-300 text-[1.3rem]"></i>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-[0.95rem] font-bold text-dark-text mb-1">Connect GitHub</h4>
                    <p className="text-[0.8rem] text-dark-text2 leading-relaxed mb-3">
                      Link your GitHub account to appear in the <strong>Contributors</strong> list and get credit for your uploads.
                    </p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 text-[0.72rem] font-medium"><i className="fas fa-star"></i> Appear in Contributors</span>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 text-[0.72rem] font-medium"><i className="fas fa-check-circle"></i> Credit for uploads</span>
                    </div>
                    <button
                      onClick={() => setSectionWithUrl('github')}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-qsis text-white text-[0.8rem] font-semibold cursor-pointer hover:opacity-90 transition-opacity"
                    >
                      <i className="fab fa-github"></i> Connect Now
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* GitHub Connected Status */}
            {hasGitHub && ghUser && (
              <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <img src={ghUser.avatar_url} alt="" className="w-10 h-10 rounded-full border-2 border-dark-border" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[0.85rem] font-bold">{ghUser.name || ghUser.login}</span>
                      <span className="text-[0.7rem] text-green-400 flex items-center gap-1"><i className="fas fa-check-circle"></i> Connected</span>
                    </div>
                    <p className="text-[0.72rem] text-dark-text2">@{ghUser.login}</p>
                  </div>
                  <button
                    onClick={() => setActiveSection('github')}
                    className="px-3 py-1.5 rounded-lg border border-dark-border bg-dark-bg3 text-dark-text text-[0.72rem] font-semibold cursor-pointer hover:border-qsis transition-all"
                  >
                    Manage
                  </button>
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5">
              <h4 className="text-[0.95rem] font-semibold mb-3"><i className="fas fa-bolt text-qsis mr-2"></i>Quick Actions</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <button className="flex flex-col items-center gap-2 p-4 rounded-xl border border-dark-border bg-dark-bg3 hover:border-qsis hover:bg-qsis/5 transition-all cursor-pointer" onClick={() => setUploadOpen(true)}>
                  <i className="fas fa-upload text-[1.2rem] text-qsis"></i><span className="text-[0.75rem] font-semibold">Upload Files</span>
                </button>
                <button className="flex flex-col items-center gap-2 p-4 rounded-xl border border-dark-border bg-dark-bg3 hover:border-qsis hover:bg-qsis/5 transition-all cursor-pointer" onClick={() => router.push('/routine')}>
                  <i className="fas fa-calendar-alt text-[1.2rem] text-accent"></i><span className="text-[0.75rem] font-semibold">View Routine</span>
                </button>
                <button className="flex flex-col items-center gap-2 p-4 rounded-xl border border-dark-border bg-dark-bg3 hover:border-qsis hover:bg-qsis/5 transition-all cursor-pointer" onClick={() => router.push('/history')}>
                  <i className="fas fa-history text-[1.2rem] text-yellow-500"></i><span className="text-[0.75rem] font-semibold">My History</span>
                </button>
                <button className="flex flex-col items-center gap-2 p-4 rounded-xl border border-dark-border bg-dark-bg3 hover:border-qsis hover:bg-qsis/5 transition-all cursor-pointer" onClick={() => router.push('/contributors')}>
                  <i className="fas fa-users text-[1.2rem] text-blue-500"></i><span className="text-[0.75rem] font-semibold">Team</span>
                </button>
                <button className="flex flex-col items-center gap-2 p-4 rounded-xl border border-dark-border bg-dark-bg3 hover:border-qsis hover:bg-qsis/5 transition-all cursor-pointer" onClick={() => { clearOnboarding(); window.history.replaceState({}, '', window.location.pathname); window.location.reload(); }}>
                  <i className="fas fa-user-cog text-[1.2rem] text-purple-500"></i><span className="text-[0.75rem] font-semibold">Edit Personalize</span>
                </button>
              </div>
            </div>
          </div>
        );

      case 'profile':
        return (
          <div className="space-y-4">
            <ProfileCard
              profile={profile} displayImage={displayImage} displayName={displayName} displayEmail={displayEmail}
              hasGitHub={hasGitHub} ghUser={ghUser} isStudent={isStudent} isTeacherOrAbove={isTeacherOrAbove} isTeacherUser={isTeacherUser} isAdmin={isAdmin} isNonVersityAdmin={isNonVersityAdmin} showStudentSection={showStudentSection} showTeacherSection={showTeacherSection}
              editingProfile={editingProfile} editingSocials={editingSocials}
              profileForm={profileForm} setProfileForm={setProfileForm}
              setEditingProfile={setEditingProfile} setEditingSocials={setEditingSocials}
              updateProfile={updateProfile} socialLinks={socialLinks}
              uploadingAvatar={uploadingAvatar} avatarInputRef={avatarInputRef} handleAvatarUpload={handleAvatarUpload}
            />
            <AccountLinkingSection email={email} linkedEmails={(profile as any).linkedEmails || []} onRefresh={loadProfile} />
          </div>
        );

      case 'activity':
        return (
          <div className="space-y-4">
            {/* Personal Activity */}
            <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5">
              <h4 className="text-[0.95rem] font-semibold mb-3 flex items-center gap-2"><i className="fas fa-history text-yellow-400"></i> My Recent Activity</h4>
              {personalActivity.length === 0 && recentReads.length === 0 ? (
                <div className="text-center py-6 text-dark-text2">
                  <i className="fas fa-clock text-2xl mb-2 block opacity-30"></i>
                  <p className="text-[0.82rem]">No activity yet. Start browsing files!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {personalActivity.map((a: any) => (
                    <div key={a.id} className="flex items-start gap-3 p-3 rounded-xl bg-dark-bg3 border border-dark-border">
                      <div className="w-8 h-8 rounded-lg bg-yellow-500/10 flex items-center justify-center flex-shrink-0 mt-0.5"><i className="fas fa-scroll text-yellow-400 text-[0.65rem]"></i></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[0.78rem] text-dark-text font-medium">{a.action}</p>
                        {a.details && <p className="text-[0.68rem] text-dark-text3 truncate mt-0.5">{a.details}</p>}
                      </div>
                      <span className="text-[0.6rem] text-dark-text3 whitespace-nowrap">{new Date(a.createdAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recently Opened Files */}
            {recentReads.length > 0 && (
              <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5">
                <h4 className="text-[0.95rem] font-semibold mb-3"><i className="fas fa-clock text-blue-400 mr-2"></i>Recently Opened</h4>
                <div className="flex flex-col gap-2">
                  {recentReads.slice(0, 7).map((item: any) => (
                    <div key={item.path} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-dark-bg3 transition-colors cursor-pointer" onClick={() => openRecentFile(item)}>
                      <div className="text-[1.1rem]">{getFileIconByType(item.mimeType)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[0.82rem] font-semibold truncate">{item.name}</div>
                        <div className="text-[0.68rem] text-dark-text2">{item.lastRead ? timeAgo(item.lastRead) : ''}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case 'github':
        return (
          <div>
            <GitHubConnection
              hasGitHub={hasGitHub} ghUser={ghUser} ghStats={ghStats} profile={profile}
              showTokenModal={showTokenModal} setShowTokenModal={setShowTokenModal}
              patInput={patInput} setPatInput={setPatInput} patLoading={patLoading}
              patValid={patValid} patReplacing={patReplacing} setPatReplacing={setPatReplacing}
              handlePastePAT={handlePastePAT} handleDisconnect={handleDisconnect}
            />
            <TelegramVerify
              telegramChatId={(profile as any).telegramChatId}
              telegramVerified={(profile as any).telegramVerified}
              telegramId={(profile as any).telegramId}
              email={email}
            />
          </div>
        );

      case 'security':
        return (
          <SecuritySection
            totpEnabled={totpEnabled} totpLoading={totpLoading} totpSetupMode={totpSetupMode}
            totpQR={totpQR} totpSecret={totpSecret} totpCode={totpCode}
            totpMsg={totpMsg} totpErrMsg={totpErrMsg} totpDisableMode={totpDisableMode}
            totpDisableCode={totpDisableCode} totpMethods={totpMethods} totpMethodsLoading={totpMethodsLoading}
            setTotpCode={setTotpCode} setTotpDisableCode={setTotpDisableCode}
            setTotpSetupMode={setTotpSetupMode} setTotpDisableMode={setTotpDisableMode}
            setTotpErrMsg={setTotpErrMsg} setTotpMethods={setTotpMethods}
            handleTotpSetup={handleTotpSetup} handleTotpVerify={handleTotpVerify}
            handleTotpDisable={handleTotpDisable} handleTotpMethodsSave={handleTotpMethodsSave}
          />
        );

      case 'teacher-info':
        return showTeacherSection ? <TeacherInfoSection email={email} profile={profile} /> : null;

      case 'cr-tools':
        return (
          <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[0.95rem] font-semibold flex items-center gap-2"><i className="fas fa-user-tie text-qsis"></i> CR Tools</h4>
              {!switchCRMode && (
                <button onClick={() => setSwitchCRMode(true)} className="px-3 py-1.5 rounded-lg border border-dark-border bg-dark-bg3 text-dark-text text-[0.72rem] font-semibold cursor-pointer hover:border-qsis transition-all">
                  <i className="fas fa-exchange-alt mr-1"></i> Transfer CR
                </button>
              )}
            </div>
            <p className="text-[0.78rem] text-dark-text2 mb-3">Manage your class representative duties and transfer CR role.</p>
            {switchCRMsg && <div className="mb-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-[0.8rem]"><i className="fas fa-check-circle mr-2"></i>{switchCRMsg}</div>}
            {switchCRErr && <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[0.8rem]"><i className="fas fa-exclamation-circle mr-2"></i>{switchCRErr}</div>}
            {switchCRMode && (
              <div className="bg-dark-bg3 border border-dark-border rounded-xl p-4 mt-3">
                <p className="text-[0.78rem] text-dark-text2 mb-2"><i className="fas fa-info-circle text-qsis mr-1"></i>Select a student from <strong>{profile.semester} — Section {profile.section}</strong> to become the new CR.</p>
                {fetchingPeers ? (
                  <div className="text-center py-4"><i className="fas fa-spinner fa-spin text-xl text-qsis"></i></div>
                ) : sectionPeers.length > 0 ? (
                  <div className="space-y-2 mb-3">
                    {sectionPeers.map(p => (
                      <div key={p.userId} className="flex items-center justify-between p-2.5 rounded-lg bg-dark-bg border border-dark-border hover:border-qsis/30 transition-all">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-qsis/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-[0.65rem] font-bold text-qsis">{p.name ? p.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2) : '??'}</span>
                          </div>
                          <div>
                            <span className="text-[0.8rem] font-semibold">{p.name || p.userId}</span>
                            <span className="text-[0.7rem] text-dark-text2 ml-1.5">{p.universityId || ''}</span>
                          </div>
                        </div>
                        <button
                          onClick={async () => {
                            if (!await confirm({ message: `Transfer CR role to ${p.name || p.userId}? You will lose CR privileges.`, danger: true, title: 'Transfer CR Role' })) return;
                            setSwitchCRLoading(true); setSwitchCRMsg(''); setSwitchCRErr('');
                            try {
                              const res = await fetch('/api/cr/switch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetEmail: p.userId }) });
                              const data = await res.json();
                              if (data.success) {
                                setSwitchCRMsg(data.message); setSwitchCRMode(false); setSectionPeers([]);
                                useAppStore.setState(s => ({ profile: { ...s.profile, isCR: false } }));
                                fetch('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isCR: false }) }).catch(() => {});
                              } else { setSwitchCRErr(data.error || 'Failed'); }
                            } catch { setSwitchCRErr('Network error'); }
                            finally { setSwitchCRLoading(false); }
                          }}
                          disabled={switchCRLoading}
                          className="px-3 py-1.5 rounded-lg bg-qsis text-white text-[0.72rem] font-semibold cursor-pointer hover:opacity-90 border-none disabled:opacity-50"
                        >
                          {switchCRLoading ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-exchange-alt mr-1"></i>Transfer</>}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[0.78rem] text-dark-text3 text-center py-3">No other students found in your section.</p>
                )}
                <div className="flex gap-2">
                  <button onClick={() => {
                    setFetchingPeers(true);
                    fetch(`/api/admin/users?search=${profile.section || ''}`).then(r => r.json()).then(data => {
                      setSectionPeers((data.users || []).filter((u: any) => u.department === profile.department && u.semester === profile.semester && u.section === profile.section && u.email !== email && !u.isCR && u.role !== 'admin'));
                    }).catch(() => setSectionPeers([])).finally(() => setFetchingPeers(false));
                  }} disabled={fetchingPeers} className="px-3 py-1.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.75rem] font-semibold cursor-pointer hover:border-qsis transition-all disabled:opacity-50">
                    <i className="fas fa-search mr-1"></i>Find Students
                  </button>
                  <button onClick={() => { setSwitchCRMode(false); setSectionPeers([]); setSwitchCRErr(''); setSwitchCRMsg(''); }} className="px-3 py-1.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.75rem] font-semibold cursor-pointer hover:border-qsis transition-all">Cancel</button>
                </div>
              </div>
            )}
          </div>
        );

      case 'admin-panel':
        return <AdminPanelView activeTab={adminTab as any} setActiveTab={setAdminTabWithUrl as any} showSidebar={false} />;

      default:
        return null;
    }
  }

  return (
    <section className="mb-5">
      {/* Mobile header */}
      <div className="flex items-center justify-between mb-4 md:hidden">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSidebarOpen(true)}
            className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.9rem]"
            aria-label="Open dashboard menu"
          >
            <i className="fas fa-bars"></i>
          </button>
          <h3 className="text-base font-semibold flex items-center gap-2"><i className="fas fa-th-large"></i> Dashboard</h3>
        </div>
        <button className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold" onClick={() => router.push('/')}>
          <i className="fas fa-arrow-left"></i> Back
        </button>
      </div>

      {/* Desktop header */}
      <div className="hidden md:flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2">
            <i className="fas fa-th-large text-qsis"></i> Dashboard
          </h3>
          <p className="text-[0.75rem] text-dark-text3 mt-0.5">Welcome back, {displayName}</p>
        </div>
        <button className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold hover:border-qsis transition-all" onClick={() => router.push('/')}>
          <i className="fas fa-arrow-left"></i> Back to Browse
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <DashboardSidebar
          activeSection={activeSection}
          onNavigate={setSectionWithUrl}
          effectiveRole={effectiveRole}
          isCR={!!profile.isCR}
          hasAdminAccess={hasAdminAccess}
          isTeacherUser={isTeacherUser || showTeacherSection}
          profile={profile}
          mobileOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          adminItems={adminMenuItems}
          activeAdminTab={adminTab}
          onAdminNavigate={handleAdminNavigate}
        />
        <div className="flex-1 min-w-0">
          {renderContent()}
        </div>
      </div>

      {showTokenModal && (
        <div className="modal active" onClick={() => setShowTokenModal(false)}>
          <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border">
              <h2 className="text-base font-semibold"><i className="fas fa-key mr-2"></i>Connect with PAT</h2>
              <button className="text-dark-text2 cursor-pointer bg-transparent border-none" onClick={() => setShowTokenModal(false)}><i className="fas fa-times"></i></button>
            </div>
            <div className="p-5">
              <div className="bg-qsis/5 border border-qsis/20 rounded-xl p-3 mb-4">
                <p className="text-[0.78rem] text-qsis font-semibold"><i className="fas fa-star mr-1.5"></i>Why connect?</p>
                <p className="text-[0.72rem] text-dark-text2 mt-1">Once connected, your name and profile will appear in our <strong>Contributors</strong> list.</p>
              </div>
              <a href="https://github.com/settings/tokens/new?scopes=repo,user:follow&description=IIUC-ARMS" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-lg border border-qsis/30 bg-qsis/5 text-qsis text-[0.82rem] font-semibold hover:bg-qsis/10 transition-all mb-4 no-underline">
                <i className="fas fa-external-link-alt"></i> Open GitHub Token Page
              </a>
              <label className="text-[0.78rem] text-dark-text2 block mb-1.5">Paste your token here:</label>
              <input type="password" className="w-full px-3 py-2.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors mb-4" placeholder="ghp_xxxxxxxxxxxx" value={patInput} onChange={e => setPatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handlePastePAT()} />
              <button className="w-full py-2.5 rounded-lg bg-qsis text-white text-[0.82rem] font-semibold cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50" onClick={handlePastePAT} disabled={!patInput.trim() || patLoading}>
                {patLoading ? <><i className="fas fa-spinner fa-spin mr-2"></i>Validating...</> : <><i className="fas fa-check mr-2"></i>Connect</>}
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmDialog}
    </section>
  );
}
