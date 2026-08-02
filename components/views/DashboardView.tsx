'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import { useAppStore } from '@/lib/store';
import { config } from '@/lib/config';
import { getFileIconByType, showToast, timeAgo } from '@/lib/utils';
import { updateUserProfile } from '@/lib/firebase';
import { installGitHubApp } from '@/lib/github-install';
import { FACULTIES, TEACHER_TITLES } from '@/lib/departments';
import CustomSelect from '@/components/CustomSelect';
import { useConfirm } from '@/components/ConfirmModal';

function extractUniversityId(email: string): string {
  const match = email.match(/^(q\d+)/i);
  return match ? match[1].toUpperCase() : '';
}

/* ═══════ BATCH SELECTOR ═══════ */
function BatchSelector({ department, value, onChange }: { department: string; value: string; onChange: (v: string) => void }) {
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!department) return;
    setLoading(true);
    fetch(`/api/batches?department=${department}`).then(r => r.json()).then(data => {
      setBatches(data.batches || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [department]);

  if (loading) {
    return (
      <div>
        <label className="text-[0.72rem] text-dark-text2 block mb-1"><i className="fas fa-layer-group mr-1"></i>Batch</label>
        <div className="px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text3 text-[0.82rem]"><i className="fas fa-spinner fa-spin mr-1"></i>Loading...</div>
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <div>
        <label className="text-[0.72rem] text-dark-text2 block mb-1"><i className="fas fa-layer-group mr-1"></i>Batch</label>
        <div className="px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-[0.78rem]">
          <p className="text-dark-text3">No batches for this department.</p>
          <p className="text-[0.65rem] text-dark-text3 mt-0.5">Contact your <span className="text-qsis font-semibold">manager</span> or <span className="text-qsis font-semibold">teacher</span> (who can make a CR) to create a batch.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="text-[0.72rem] text-dark-text2 block mb-1"><i className="fas fa-layer-group mr-1"></i>Batch</label>
      <CustomSelect
        value={value}
        onChange={onChange}
        placeholder="Select batch..."
        options={[
          { value: '', label: 'None', icon: 'fa-times' },
          ...batches.map(b => ({
            value: b.id,
            label: `${b.name} — ${b.session}`,
            icon: b.isActive ? 'fa-check-circle' : 'fa-times-circle',
          })),
        ]}
      />
    </div>
  );
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
  const loadProfile = useAppStore(s => s.loadProfile);
  const setGithubToken = useAppStore(s => s.setGithubToken);

  const [editingProfile, setEditingProfile] = useState(false);
  const [editingSocials, setEditingSocials] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [profileForm, setProfileForm] = useState({
    universityId: '', name: '', whatsapp: '', phone: '', telegramId: '', semester: '', section: '', department: '', batchId: '',
    facebook: '', twitter: '', linkedin: '', website: '',
    company: '', companyUrl: '', publicEmail: '',
    hideWhatsapp: false, hideUniversityId: false, hideSemester: false, hideEmail: false, hideCompany: false,
  });

  // Switch CR state
  const [switchCRMode, setSwitchCRMode] = useState(false);
  const [switchCRLoading, setSwitchCRLoading] = useState(false);
  const [switchCRMsg, setSwitchCRMsg] = useState('');
  const [switchCRErr, setSwitchCRErr] = useState('');
  const [sectionPeers, setSectionPeers] = useState<any[]>([]);
  const [fetchingPeers, setFetchingPeers] = useState(false);

  const hasGitHub = !!(session as any)?.accessToken || !!profile.githubLogin || !!profile.githubToken;
  const email = (session as any)?.user?.email || profile.email || '';
  const effectiveRole = config.getEffectiveRole(email, profile.role);
  const isStudent = effectiveRole === 'student';
  const isTeacherOrAbove = effectiveRole === 'admin' || effectiveRole === 'manager' || effectiveRole === 'teacher';
  const isTeacherEmail = /@iiuc\.ac\.bd$/i.test(email) && !/@ugrad\.iiuc\.ac\.bd$/i.test(email);
  const [ghUser, setGhUser] = useState<any>(null);
  const [ghStats, setGhStats] = useState<any>(null);
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

  // Load profile from DB on mount — ensures GitHub connection persists across reloads
  useEffect(() => {
    loadProfile();
  }, []);

  // Validate PAT on load — if expired show reconnect
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

  // Check TOTP status on mount
  useEffect(() => {
    const user = (session as any)?.user;
    if (!user?.email) return;
    fetch('/api/auth/totp/check')
      .then(r => r.json())
      .then(d => { if (d.totpEnabled) setTotpEnabled(true); if (d.totpMethods) setTotpMethods(d.totpMethods); })
      .catch(() => {});
  }, [session]);

  // Auto-extract university ID from email if not set
  useEffect(() => {
    const email = profile.email || (session as any)?.user?.email || '';
    if (email && !profile.universityId) {
      const extracted = extractUniversityId(email);
      if (extracted) {
        updateProfile({ universityId: extracted });
      }
    }
  }, [profile.email, profile.universityId]);

  // Primary info: profile DB > session (Firebase/Google)
  const displayName = profile.name || (session as any)?.user?.name || 'User';
  const displayEmail = profile.publicEmail || profile.email || session?.user?.email || '';
  const displayImage = profile.image || (session as any)?.user?.image || '';

  // Pick up GitHub token from URL after install redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ghToken = params.get('gh_token');
    const ghLogin = params.get('gh_login');
    const ghInstall = params.get('gh_install');
    const ghError = params.get('error');
    if (ghToken && ghLogin) {
      // Save to store
      useAppStore.setState(s => ({
        profile: { ...s.profile, githubLogin: ghLogin, githubToken: ghToken, githubInstallationId: ghInstall || '' },
        githubToken: ghToken,
      }));
      // Save to DB
      fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ githubLogin: ghLogin, githubToken: ghToken, githubInstallationId: ghInstall || '' }),
      }).catch(() => {});
      showToast(`Connected as @${ghLogin}!`, 'success');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (ghError) {
      showToast(`GitHub Error: ${ghError}`, 'error');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!profile.githubToken || !hasGitHub) return;

    // Build ghUser from saved profile data as primary source (no API call needed)
    if (profile.githubLogin) {
      setGhUser({
        login: profile.githubLogin,
        name: profile.githubLogin,
        avatar_url: profile.githubAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.githubLogin)}&background=333&color=fff&bold=true&size=80`,
      });
    }

    // Also try to fetch live stats from GitHub API (best-effort)
    const ghHeaders = { Authorization: `token ${profile.githubToken}`, Accept: 'application/vnd.github.v3+json' };
    fetch('https://api.github.com/user', { headers: ghHeaders })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          // Update ghUser with live data if available
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
      showToast('GitHub disconnected', 'success');
    } catch {
      showToast('Disconnect failed. Please try again.', 'error');
    }
  }

  async function handleInstallGitHub() {
    showToast('Opening GitHub...', 'info');
    const result = await installGitHubApp();
    if (result.error || !result.token) {
      showToast(result.error || 'GitHub connection cancelled', 'error');
      return;
    }
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          githubLogin: result.login,
          githubToken: result.token,
          githubInstallationId: result.installationId,
          githubAvatar: result.avatarUrl,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      useAppStore.setState(s => ({
        profile: {
          ...s.profile,
          githubLogin: result.login,
          githubToken: result.token,
          githubInstallationId: result.installationId,
          githubAvatar: result.avatarUrl,
        },
        githubToken: result.token,
      }));
      setGhUser({ login: result.login, name: result.login, avatar_url: result.avatarUrl });
      showToast(`Connected as @${result.login}!`, 'success');
    } catch {
      showToast('Failed to save. Please try again.', 'error');
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
        body: JSON.stringify({
          githubLogin: ghUser.login,
          githubToken: token,
          githubAvatar: ghUser.avatar_url,
        }),
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
      // Auto-star both repos
      for (const { owner, repo } of config.githubStarRepos) {
        fetch(`https://api.github.com/user/starred/${owner}/${repo}`, {
          method: 'PUT',
          headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Length': '0' },
        }).catch(() => {});
      }
    } catch {
      showToast('Failed to connect. Please try again.', 'error');
    } finally {
      setPatLoading(false);
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Image must be under 2MB.');
      return;
    }

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

  // Build social links array (website first, then others)
  const socialLinks = [
    profile.website && { icon: 'fas fa-globe', label: 'Website', url: profile.website },
    profile.facebook && { icon: 'fab fa-facebook', label: 'Facebook', url: profile.facebook },
    profile.twitter && { icon: 'fab fa-twitter', label: 'Twitter', url: profile.twitter },
    profile.linkedin && { icon: 'fab fa-linkedin', label: 'LinkedIn', url: profile.linkedin },
  ].filter(Boolean) as { icon: string; label: string; url: string }[];

  // ─── TOTP / 2FA handlers ───
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

  return (
    <section className="mb-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold flex items-center gap-2"><i className="fas fa-th-large"></i> Dashboard</h3>
        <button className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold" onClick={() => router.push('/')}>
          <i className="fas fa-arrow-left"></i> Back
        </button>
      </div>

      {/* ═══════════════ UNIFIED PROFILE CARD ═══════════════ */}
      <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5 mb-4">

        {/* Top row: Avatar + Name + Role + GitHub badge + Edit */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="relative group cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
              <Image src={displayImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=22c55e&color=fff&bold=true&size=200`} alt="" width={64} height={64} className="w-16 h-16 rounded-full border-2 border-qsis object-cover" />
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {uploadingAvatar ? <i className="fas fa-spinner fa-spin text-white text-sm"></i> : <i className="fas fa-camera text-white text-sm"></i>}
              </div>
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-[1.1rem] font-bold">{displayName}</h4>
                {hasGitHub && ghUser && (
                  <a href={`https://github.com/${ghUser.login}`} target="_blank" rel="noopener noreferrer" className="text-[0.7rem] text-dark-text2 hover:text-qsis transition-colors flex items-center gap-1">
                    <i className="fab fa-github"></i> @{ghUser.login}
                  </a>
                )}
              </div>
              <p className="text-[0.82rem] text-dark-text2">{displayEmail}</p>
              {profile.company && (
                <p className="text-[0.72rem] text-dark-text2 mt-0.5">
                  <i className="fas fa-building mr-1"></i>
                  {profile.companyUrl ? (
                    <a href={profile.companyUrl} target="_blank" rel="noopener noreferrer" className="hover:text-qsis transition-colors">{profile.company}</a>
                  ) : profile.company}
                </p>
              )}
              {/* Social icons row */}
              {socialLinks.length > 0 && (
                <div className="flex items-center gap-2 mt-1.5">
                  {socialLinks.map((s, i) => (
                    <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" title={s.label} className="w-7 h-7 rounded-full bg-dark-bg3 border border-dark-border flex items-center justify-center text-dark-text2 hover:text-qsis hover:border-qsis transition-all">
                      <i className={`${s.icon} text-[0.7rem]`}></i>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
          {!editingProfile && (
            <button className="px-3 py-1.5 rounded-lg border border-dark-border bg-dark-bg3 text-dark-text text-[0.75rem] font-semibold cursor-pointer hover:border-qsis transition-all" onClick={() => {
              const email = profile.email || (session as any)?.user?.email || '';
              const autoId = profile.universityId || extractUniversityId(email);
              setProfileForm({
                universityId: autoId,
                name: profile.name || '',
                whatsapp: profile.whatsapp,
                phone: profile.phone || '',
                telegramId: profile.telegramId || '',
                semester: profile.semester,
                section: profile.section || '',
                department: profile.department || '',
                batchId: (profile as any).batchId || '',
                facebook: profile.facebook,
                twitter: profile.twitter,
                linkedin: profile.linkedin,
                website: profile.website,
                company: profile.company,
                companyUrl: profile.companyUrl,
                publicEmail: profile.publicEmail,
                hideWhatsapp: profile.hideWhatsapp,
                hideUniversityId: profile.hideUniversityId,
                hideSemester: profile.hideSemester,
                hideEmail: profile.hideEmail,
                hideCompany: (profile as any).hideCompany || false,
              });
              setEditingProfile(true);
            }}>
              <i className="fas fa-pen mr-1"></i> Edit Profile
            </button>
          )}
        </div>

        {/* Profile Completion */}
        {(() => {
          const studentFields = [profile.name, profile.universityId, profile.whatsapp, profile.semester, profile.section];
          const teacherFields = [profile.name, profile.whatsapp];
          const fields = isStudent ? studentFields : teacherFields;
          const filled = fields.filter(Boolean).length;
          const pct = Math.round((filled / fields.length) * 100);
          return (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[0.78rem] text-dark-text2">Profile Completion</span>
                <span className="text-[0.78rem] font-semibold text-qsis">{pct}%</span>
              </div>
              <div className="w-full h-2 bg-dark-bg3 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-qsis to-accent rounded-full transition-all" style={{ width: `${pct}%` }}></div>
              </div>
            </div>
          );
        })()}

        {editingProfile ? (
          <div className="bg-dark-bg3 border border-dark-border rounded-xl p-4">
            <h5 className="text-[0.85rem] font-semibold mb-3"><i className="fas fa-user-edit text-qsis mr-2"></i>Edit Profile</h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              {/* Academic Info — First */}
              <div>
                <label className="text-[0.72rem] text-dark-text2 block mb-1"><i className="fas fa-building mr-1"></i>Department</label>
                <CustomSelect
                  value={profileForm.department}
                  onChange={value => setProfileForm(p => ({ ...p, department: value }))}
                  placeholder="Select department..."
                  options={FACULTIES.flatMap(f => f.departments.map(d => ({ value: d.id, label: `${d.shortName} — ${d.name}`, icon: 'fa-building', group: `${f.shortName} — ${f.name}` })))}
                />
              </div>
              <div>
                <label className="text-[0.72rem] text-dark-text2 block mb-1"><i className="fas fa-calendar mr-1"></i>Current Semester</label>
                <CustomSelect
                  value={profileForm.semester}
                  onChange={value => setProfileForm(p => ({ ...p, semester: value }))}
                  placeholder="Select semester..."
                  options={[
                    ...config.semesters.map(s => ({ value: s.id, label: s.label, icon: 'fa-calendar' })),
                    { value: 'graduated', label: '🎓 Graduated', icon: 'fa-graduation-cap' },
                  ]}
                />
              </div>
              {/* Batch — students only */}
              {isStudent && profileForm.department && (
                <BatchSelector
                  department={profileForm.department}
                  value={profileForm.batchId}
                  onChange={batchId => setProfileForm(p => ({ ...p, batchId }))}
                />
              )}

              {/* Personal Info */}
              <div>
                <label className="text-[0.72rem] text-dark-text2 block mb-1">Full Name</label>
                <input type="text" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" placeholder="e.g. Sayed Atiqur Rahman" value={profileForm.name} onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              {isStudent && (
                <div>
                  <label className="text-[0.72rem] text-dark-text2 block mb-1">University ID</label>
                  <input type="text" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" placeholder="e.g. Q233099" value={profileForm.universityId} onChange={e => setProfileForm(p => ({ ...p, universityId: e.target.value }))} />
                </div>
              )}

              {/* Contact Info */}
              <div>
                <label className="text-[0.72rem] text-dark-text2 block mb-1"><i className="fab fa-whatsapp mr-1"></i>WhatsApp</label>
                <input type="tel" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" placeholder="e.g. +8801XXXXXXXXX" value={profileForm.whatsapp} onChange={e => setProfileForm(p => ({ ...p, whatsapp: e.target.value }))} />
              </div>
              <div>
                <label className="text-[0.72rem] text-dark-text2 block mb-1"><i className="fas fa-phone mr-1"></i>Phone Number <span className="text-qsis text-[0.65rem]">(for notifications)</span></label>
                <input type="tel" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" placeholder="e.g. +8801XXXXXXXXX" value={profileForm.phone} onChange={e => setProfileForm(p => ({ ...p, phone: e.target.value }))} />
              </div>
              <div>
                <label className="text-[0.72rem] text-dark-text2 block mb-1"><i className="fab fa-telegram mr-1"></i>Telegram ID / Username</label>
                <input type="text" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" placeholder="e.g. @username or 123456789" value={profileForm.telegramId} onChange={e => setProfileForm(p => ({ ...p, telegramId: e.target.value }))} />
                <p className="text-[0.65rem] text-dark-text3 mt-0.5">Receive department routines & room updates via Telegram</p>
              </div>
              {isStudent && (
                <div>
                  <label className="text-[0.72rem] text-dark-text2 block mb-1">Section</label>
                  <input type="text" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" placeholder="e.g. A, B, C" value={profileForm.section} onChange={e => setProfileForm(p => ({ ...p, section: e.target.value }))} />
                </div>
              )}
            </div>

            {/* Company / Organization */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[0.72rem] text-dark-text2 block mb-1"><i className="fas fa-building mr-1"></i>Company / Organization</label>
                <input type="text" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" placeholder="e.g. Programming Light" value={profileForm.company} onChange={e => setProfileForm(p => ({ ...p, company: e.target.value }))} />
              </div>
              <div>
                <label className="text-[0.72rem] text-dark-text2 block mb-1"><i className="fas fa-link mr-1"></i>Company URL</label>
                <input type="url" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" placeholder="https://..." value={profileForm.companyUrl} onChange={e => setProfileForm(p => ({ ...p, companyUrl: e.target.value }))} />
              </div>
            </div>

            {/* Public Email */}
            <div className="mb-3">
              <label className="text-[0.72rem] text-dark-text2 block mb-1"><i className="fas fa-envelope mr-1"></i>Public Email <span className="text-dark-text3">(shown on your public profile)</span></label>
              <input type="email" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" placeholder="e.g. yourmail@gmail.com" value={profileForm.publicEmail} onChange={e => setProfileForm(p => ({ ...p, publicEmail: e.target.value }))} />
              <p className="text-[0.65rem] text-dark-text3 mt-1">Leave empty to use your login email. Set a custom email to control what the public sees.</p>
            </div>

            {/* Privacy Toggles */}
            <div className="mb-3 p-3 rounded-lg bg-dark-bg border border-dark-border">
              <p className="text-[0.72rem] text-dark-text2 mb-2"><i className="fas fa-eye-slash mr-1"></i>Privacy Settings</p>
              {isStudent && (
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <input type="checkbox" checked={profileForm.hideUniversityId} onChange={e => setProfileForm(p => ({ ...p, hideUniversityId: e.target.checked }))} className="accent-qsis" />
                  <span className="text-[0.78rem] text-dark-text">Hide University ID from public profile</span>
                </label>
              )}
              <label className="flex items-center gap-2 cursor-pointer mb-2">
                <input type="checkbox" checked={profileForm.hideWhatsapp} onChange={e => setProfileForm(p => ({ ...p, hideWhatsapp: e.target.checked }))} className="accent-qsis" />
                <span className="text-[0.78rem] text-dark-text">Hide WhatsApp from public profile</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer mb-2">
                <input type="checkbox" checked={profileForm.hideSemester} onChange={e => setProfileForm(p => ({ ...p, hideSemester: e.target.checked }))} className="accent-qsis" />
                <span className="text-[0.78rem] text-dark-text">Hide Semester from public profile</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={profileForm.hideEmail} onChange={e => setProfileForm(p => ({ ...p, hideEmail: e.target.checked }))} className="accent-qsis" />
                <span className="text-[0.78rem] text-dark-text">Hide Email from public profile</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={profileForm.hideCompany} onChange={e => setProfileForm(p => ({ ...p, hideCompany: e.target.checked }))} className="accent-qsis" />
                <span className="text-[0.78rem] text-dark-text">Hide Company from public profile</span>
              </label>
            </div>

            <div className="flex gap-2">
              <button className="px-4 py-2 rounded-xl bg-gradient-to-br from-qsis to-qsis-dark text-white border-none font-semibold text-[0.8rem] cursor-pointer hover:opacity-90 transition-opacity" onClick={() => {
                updateProfile(profileForm);
                setEditingProfile(false);
                showToast('Profile saved!', 'success');
              }}>
                <i className="fas fa-save mr-1"></i> Save Profile
              </button>
              <button className="px-4 py-2 rounded-xl border border-dark-border bg-dark-bg text-dark-text font-semibold text-[0.8rem] cursor-pointer hover:border-qsis transition-all" onClick={() => setEditingProfile(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              {isStudent && (
                <div className="p-3 rounded-lg bg-dark-bg3 border border-dark-border">
                  <span className="text-[0.7rem] text-dark-text2 block mb-1">University ID</span>
                  <span className={`text-[0.85rem] font-semibold ${profile.universityId ? 'text-qsis' : 'text-dark-text2'}`}>
                    {profile.universityId || 'Not set'}
                  </span>
                </div>
              )}
              {profile.department && (
                <div className="p-3 rounded-lg bg-dark-bg3 border border-dark-border">
                  <span className="text-[0.7rem] text-dark-text2 block mb-1">Department</span>
                  <span className="text-[0.85rem] font-semibold">{(() => {
                    const found = FACULTIES.flatMap(f => f.departments.map(d => ({ ...d, faculty: f.shortName }))).find(d => d.id === profile.department);
                    return found ? `${found.shortName} — ${found.faculty}` : profile.department;
                  })()}</span>
                </div>
              )}
              {profile.shortForm && (
                <div className="p-3 rounded-lg bg-dark-bg3 border border-dark-border">
                  <span className="text-[0.7rem] text-dark-text2 block mb-1">Short Form</span>
                  <span className="text-[0.85rem] font-semibold text-qsis">{profile.shortForm}</span>
                </div>
              )}
              {isTeacherOrAbove && profile.title && (
                <div className="p-3 rounded-lg bg-dark-bg3 border border-dark-border">
                  <span className="text-[0.7rem] text-dark-text2 block mb-1">Designation</span>
                  <span className="text-[0.85rem] font-semibold text-qsis">{profile.title}</span>
                </div>
              )}
              <div className="p-3 rounded-lg bg-dark-bg3 border border-dark-border">
                <span className="text-[0.7rem] text-dark-text2 block mb-1">WhatsApp</span>
                <span className={`text-[0.85rem] font-semibold ${profile.whatsapp ? '' : 'text-dark-text2'}`}>
                  {profile.whatsapp || 'Not set'}
                </span>
              </div>
              {isStudent && (
                <>
                  <div className="p-3 rounded-lg bg-dark-bg3 border border-dark-border">
                    <span className="text-[0.7rem] text-dark-text2 block mb-1"><i className="fas fa-phone mr-1 text-qsis"></i>Phone</span>
                    <span className={`text-[0.85rem] font-semibold ${profile.phone ? '' : 'text-dark-text2'}`}>
                      {profile.phone || 'Not set'}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-dark-bg3 border border-dark-border">
                    <span className="text-[0.7rem] text-dark-text2 block mb-1"><i className="fab fa-telegram mr-1 text-blue-400"></i>Telegram ID</span>
                    <span className={`text-[0.85rem] font-semibold ${profile.telegramId ? '' : 'text-dark-text2'}`}>
                      {profile.telegramId || 'Not set'}
                    </span>
                    {profile.telegramId && <p className="text-[0.6rem] text-green-400 mt-0.5"><i className="fas fa-check-circle mr-0.5"></i>You&apos;ll receive department routines & room updates</p>}
                  </div>
                </>
              )}
              {profile.semester && (
                <div className="p-3 rounded-lg bg-dark-bg3 border border-dark-border">
                  <span className="text-[0.7rem] text-dark-text2 block mb-1">Semester</span>
                  <span className="text-[0.85rem] font-semibold">{profile.semester === 'graduated' ? '🎓 Graduated' : config.semesters.find(s => s.id === profile.semester)?.label || profile.semester}</span>
                </div>
              )}
              {profile.section && isStudent && (
                <div className="p-3 rounded-lg bg-dark-bg3 border border-dark-border">
                  <span className="text-[0.7rem] text-dark-text2 block mb-1">Section</span>
                  <span className="text-[0.85rem] font-semibold">{profile.section}</span>
                </div>
              )}
            </div>

            {/* Edit Social Links */}
            {editingSocials ? (
              <div className="bg-dark-bg3 border border-dark-border rounded-xl p-4">
                <h5 className="text-[0.85rem] font-semibold mb-3"><i className="fas fa-share-alt text-qsis mr-2"></i>Social Links</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="text-[0.72rem] text-dark-text2 block mb-1"><i className="fas fa-globe mr-1"></i>Website URL</label>
                    <input type="url" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" placeholder="https://..." value={profileForm.website} onChange={e => setProfileForm(p => ({ ...p, website: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-[0.72rem] text-dark-text2 block mb-1"><i className="fab fa-facebook mr-1"></i>Facebook URL</label>
                    <input type="url" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" placeholder="https://facebook.com/..." value={profileForm.facebook} onChange={e => setProfileForm(p => ({ ...p, facebook: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-[0.72rem] text-dark-text2 block mb-1"><i className="fab fa-twitter mr-1"></i>Twitter URL</label>
                    <input type="url" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" placeholder="https://twitter.com/..." value={profileForm.twitter} onChange={e => setProfileForm(p => ({ ...p, twitter: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-[0.72rem] text-dark-text2 block mb-1"><i className="fab fa-linkedin mr-1"></i>LinkedIn URL</label>
                    <input type="url" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" placeholder="https://linkedin.com/in/..." value={profileForm.linkedin} onChange={e => setProfileForm(p => ({ ...p, linkedin: e.target.value }))} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="px-4 py-2 rounded-xl bg-gradient-to-br from-qsis to-qsis-dark text-white border-none font-semibold text-[0.8rem] cursor-pointer hover:opacity-90 transition-opacity" onClick={() => {
                    updateProfile(profileForm);
                    setEditingSocials(false);
                    showToast('Social links saved!', 'success');
                  }}>
                    <i className="fas fa-save mr-1"></i> Save
                  </button>
                  <button className="px-4 py-2 rounded-xl border border-dark-border bg-dark-bg text-dark-text font-semibold text-[0.8rem] cursor-pointer hover:border-qsis transition-all" onClick={() => setEditingSocials(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button className="text-[0.75rem] text-dark-text2 hover:text-qsis bg-transparent border-none cursor-pointer hover:underline" onClick={() => {
                setProfileForm(p => ({ ...p, facebook: profile.facebook, twitter: profile.twitter, linkedin: profile.linkedin, website: profile.website }));
                setEditingSocials(true);
              }}>
                <i className="fas fa-share-alt mr-1"></i> Edit Social Links
              </button>
            )}
          </>
        )}
      </div>

      {/* ═══════════════ TEACHER INFO ═══════════════ */}
      {isTeacherEmail && (
        <TeacherInfoSection email={email} profile={profile} />
      )}

      {/* ═══════════════ GITHUB CONNECTION ═══════════════ */}
      <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5 mb-4">
        <h4 className="text-[0.95rem] font-semibold mb-3 flex items-center gap-2">
          <i className="fab fa-github"></i> GitHub Connection
        </h4>

        {hasGitHub && ghUser ? (
          <div className="bg-dark-bg3 border border-dark-border rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <img src={ghUser.avatar_url} alt="" className="w-12 h-12 rounded-full border-2 border-dark-border" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[0.9rem] font-bold">{ghUser.name || ghUser.login}</span>
                  {profile.title ? (
                    <span className="text-[0.72rem] text-qsis font-medium">{profile.title}</span>
                  ) : (
                    <span className="text-[0.72rem] text-dark-text2">@{ghUser.login}</span>
                  )}
                </div>
                {ghUser.bio && <p className="text-[0.72rem] text-dark-text2 truncate mt-0.5">{ghUser.bio}</p>}
                <div className="flex items-center gap-1.5 mt-1">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <span className="text-[0.68rem] text-green-400">
                    {profile.githubToken?.startsWith('ghp_') || profile.githubToken?.startsWith('github_pat_')
                      ? 'Connected via Personal Access Token'
                      : 'Connected via GitHub App'}
                  </span>
                </div>
              </div>
            </div>

            {/* PAT Recommendation for GitHub App users */}
            {!(profile.githubToken?.startsWith('ghp_') || profile.githubToken?.startsWith('github_pat_')) && (
              <div className="mb-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-start gap-2.5">
                  <i className="fas fa-exclamation-triangle text-amber-400 text-[0.8rem] mt-0.5"></i>
                  <div className="flex-1">
                    <p className="text-[0.78rem] font-semibold text-amber-400 mb-1">Want to appear in Contributors?</p>
                    <p className="text-[0.7rem] text-dark-text2 leading-relaxed">
                      Connected via <strong>GitHub App</strong> — your uploads are committed as <strong>qsis-arms[bot]</strong>, not your account. Switch to a <strong>Personal Access Token</strong> so your uploads credit you and you appear in the Contributors list.
                    </p>
                    <button
                      onClick={() => setShowTokenModal(true)}
                      className="mt-2 px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-400 text-[0.72rem] font-semibold cursor-pointer hover:bg-amber-500/30 border-none transition-all"
                    >
                      <i className="fas fa-key mr-1"></i>Switch to PAT
                    </button>
                  </div>
                </div>
              </div>
            )}

            {ghStats && (
              <div className="flex gap-2 flex-wrap mb-3">
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-dark-bg border border-dark-border">
                  <i className="fas fa-book text-qsis text-[0.6rem]"></i>
                  <span className="text-[0.72rem] font-semibold">{ghStats.public_repos}</span>
                  <span className="text-[0.6rem] text-dark-text2">repos</span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-dark-bg border border-dark-border">
                  <i className="fas fa-users text-accent text-[0.6rem]"></i>
                  <span className="text-[0.72rem] font-semibold">{ghStats.followers}</span>
                  <span className="text-[0.6rem] text-dark-text2">followers</span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-dark-bg border border-dark-border">
                  <i className="fas fa-user-friends text-green-400 text-[0.6rem]"></i>
                  <span className="text-[0.72rem] font-semibold">{ghStats.following}</span>
                  <span className="text-[0.6rem] text-dark-text2">following</span>
                </div>
                {ghStats.created_at && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-dark-bg border border-dark-border">
                    <i className="fas fa-calendar text-yellow-500 text-[0.6rem]"></i>
                    <span className="text-[0.6rem] text-dark-text2">Joined {new Date(ghStats.created_at).getFullYear()}</span>
                  </div>
                )}
                {ghStats.location && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-dark-bg border border-dark-border">
                    <i className="fas fa-map-marker-alt text-red-400 text-[0.6rem]"></i>
                    <span className="text-[0.6rem] text-dark-text2">{ghStats.location}</span>
                  </div>
                )}
              </div>
            )}

            {/* PAT Section — for contributor visibility */}
            {(!profile.githubToken?.startsWith('ghp_') && !profile.githubToken?.startsWith('github_pat_')) ? (
              <div className="bg-qsis/5 border border-qsis/20 rounded-xl p-3 mb-3">
                <p className="text-[0.78rem] text-qsis font-semibold mb-1"><i className="fas fa-star mr-1"></i>Appear in Contributors List</p>
                <p className="text-[0.72rem] text-dark-text2 mb-2">Add a Personal Access Token to show your name in our Contributors page.</p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.75rem] outline-none focus:border-qsis transition-colors"
                    placeholder="ghp_xxxxxxxxxxxx"
                    value={patInput}
                    onChange={e => setPatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handlePastePAT()}
                  />
                  <button
                    className="px-3 py-1.5 rounded-lg bg-qsis text-white text-[0.72rem] font-semibold cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap"
                    onClick={handlePastePAT}
                    disabled={!patInput.trim() || patLoading}
                  >
                    {patLoading ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-check mr-1"></i>Save</>}
                  </button>
                </div>
                <a href="https://github.com/settings/tokens/new?scopes=repo&description=IIUC-ARMS" target="_blank" rel="noopener noreferrer" className="text-[0.68rem] text-dark-text2 hover:text-qsis mt-2 inline-block no-underline">
                  <i className="fas fa-external-link-alt mr-1"></i>Create new token (No expiry, repo scope)
                </a>
              </div>
            ) : patValid === false ? (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mb-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-amber-400">
                    <i className="fas fa-exclamation-triangle"></i>
                    <span className="text-[0.72rem] font-semibold">PAT expired or invalid — Reconnect to appear in Contributors</span>
                  </div>
                  <button
                    className="px-3 py-1.5 rounded-lg bg-qsis text-white text-[0.72rem] font-semibold cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap"
                    onClick={() => { setPatInput(''); setPatValid(null); }}
                    disabled={patLoading}
                  >
                    <i className="fas fa-redo mr-1"></i>Reconnect
                  </button>
                </div>
              </div>
            ) : (
              patReplacing ? (
                <div className="bg-qsis/5 border border-qsis/20 rounded-xl p-3 mb-3">
                  <div className="flex items-center gap-1.5 text-[0.72rem] text-qsis font-semibold mb-2">
                    <i className="fas fa-key"></i>
                    <span>Paste your new Personal Access Token</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      className="flex-1 px-3 py-1.5 rounded-lg bg-dark-bg border border-dark-border text-dark-text text-[0.72rem] font-mono focus:outline-none focus:border-qsis"
                      placeholder="ghp_xxxxxxxxxxxx"
                      value={patInput}
                      onChange={e => setPatInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handlePastePAT()}
                      autoFocus
                    />
                    <button
                      className="px-3 py-1.5 rounded-lg bg-qsis text-white text-[0.72rem] font-semibold cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap"
                      onClick={handlePastePAT}
                      disabled={!patInput.trim() || patLoading}
                    >
                      {patLoading ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-check mr-1"></i>Confirm</>}
                    </button>
                    <button
                      className="px-3 py-1.5 rounded-lg bg-dark-border text-dark-text2 text-[0.72rem] font-semibold cursor-pointer hover:text-dark-text transition-colors whitespace-nowrap"
                      onClick={() => { setPatReplacing(false); setPatInput(''); }}
                    >
                      Cancel
                    </button>
                  </div>
                  <a href="https://github.com/settings/tokens/new?scopes=repo&description=IIUC-ARMS" target="_blank" rel="noopener noreferrer" className="text-[0.68rem] text-dark-text2 hover:text-qsis mt-2 inline-block no-underline">
                    <i className="fas fa-external-link-alt mr-1"></i>Create new token (No expiry, repo scope)
                  </a>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 text-[0.72rem] text-qsis mb-3 bg-qsis/5 border border-qsis/20 rounded-xl p-3">
                  <div className="flex items-center gap-1.5">
                    <i className="fas fa-check-circle"></i>
                    <span className="font-semibold">PAT saved — visible in Contributors list</span>
                  </div>
                  <button
                    className="text-[0.68rem] text-dark-text2 hover:text-qsis bg-transparent border-none cursor-pointer underline"
                    onClick={() => { setPatReplacing(true); setPatInput(''); }}
                  >
                    Replace
                  </button>
                </div>
              )
            )}

            <div className="flex gap-2 flex-wrap">
              <a href={`https://github.com/${ghUser.login}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.72rem] font-semibold cursor-pointer hover:border-qsis hover:text-qsis transition-all no-underline">
                <i className="fab fa-github"></i> View Profile
              </a>
              <button className="px-3 py-1.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.72rem] font-semibold cursor-pointer hover:border-qsis transition-all" onClick={handleInstallGitHub}>
                <i className="fab fa-github mr-1"></i> Reinstall
              </button>
              <button className="px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-[0.72rem] font-semibold cursor-pointer hover:bg-red-500/20 transition-all" onClick={handleDisconnect}>
                <i className="fas fa-unlink mr-1"></i> Disconnect
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-dark-bg3 border border-dark-border">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <i className="fas fa-unlink text-red-500"></i>
              </div>
              <div className="flex-1">
                <span className="text-[0.85rem] font-semibold block">Not Connected</span>
                <span className="text-[0.72rem] text-dark-text2">Connect GitHub to upload files and appear in Contributors</span>
              </div>
            </div>
            <button className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-gradient-to-br from-qsis to-qsis-dark text-white text-[0.85rem] font-bold cursor-pointer hover:opacity-90 transition-all shadow-lg shadow-qsis/20" onClick={() => setShowTokenModal(true)}>
              <i className="fas fa-key"></i> Connect with Personal Access Token
              <span className="text-[0.65rem] bg-white/20 px-2 py-0.5 rounded-full ml-1">Recommended</span>
            </button>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dark-border bg-dark-bg3">
              <button className="flex items-center gap-2 bg-transparent border-none text-dark-text2 text-[0.78rem] font-semibold cursor-pointer hover:text-qsis transition-colors" onClick={handleInstallGitHub}>
                <i className="fab fa-github"></i> Or connect with GitHub App
              </button>
            </div>
            <div className="p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/15">
              <p className="text-[0.68rem] text-amber-400 text-center leading-relaxed">
                <i className="fas fa-info-circle mr-1"></i>
                <strong>PAT</strong> = your uploads credited to you, you appear in Contributors.
                <br/>
                <strong>GitHub App</strong> = uploads as bot, you won&apos;t appear in Contributors. Optional.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════ SECURITY / 2FA ═══════════════ */}
      <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5 mb-4">
        <h4 className="text-[0.95rem] font-semibold mb-3"><i className="fas fa-shield-alt"></i> Security</h4>

        {totpMsg && (
          <div className="mb-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-[0.8rem]">
            <i className="fas fa-check-circle mr-2"></i>{totpMsg}
          </div>
        )}
        {totpErrMsg && (
          <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[0.8rem]">
            <i className="fas fa-exclamation-circle mr-2"></i>{totpErrMsg}
          </div>
        )}

        <div className="flex items-center gap-3 p-3 rounded-lg bg-dark-bg3 border border-dark-border mb-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${totpEnabled ? 'bg-green-500/20' : 'bg-dark-bg'}`}>
            <i className={`fas ${totpEnabled ? 'fa-check-circle text-green-500' : 'fa-shield-alt text-dark-text2'}`}></i>
          </div>
          <div className="flex-1">
            <span className="text-[0.85rem] font-semibold block">Two-Factor Authentication (TOTP)</span>
            <span className="text-[0.72rem] text-dark-text2">
              {totpEnabled ? 'Enabled — your account is protected with an authenticator app' : 'Not enabled — add an extra layer of security to your account'}
            </span>
          </div>
          <span className={`text-[0.7rem] font-bold px-2 py-1 rounded-full ${totpEnabled ? 'bg-green-500/20 text-green-400' : 'bg-dark-bg text-dark-text2'}`}>
            {totpEnabled ? 'ON' : 'OFF'}
          </span>
        </div>

        {!totpEnabled && !totpSetupMode && (
          <button onClick={handleTotpSetup} disabled={totpLoading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-qsis text-qsis bg-transparent text-[0.82rem] font-semibold cursor-pointer hover:bg-qsis/10 transition-colors disabled:opacity-50">
            {totpLoading ? <><i className="fas fa-spinner fa-spin"></i> Loading...</> : <><i className="fas fa-lock"></i> Set Up Authenticator</>}
          </button>
        )}

        {totpSetupMode && (
          <div className="mt-2">
            <p className="text-[0.78rem] text-dark-text2 mb-3">
              <strong>Step 1:</strong> Open Google Authenticator (or any TOTP app) and scan this QR code.
            </p>
            {totpQR && (
              <div className="flex justify-center mb-3">
                <img src={totpQR} alt="TOTP QR Code" className="rounded-xl border border-dark-border" style={{ width: 200, height: 200 }} />
              </div>
            )}
            <div className="mb-3 p-2 rounded-lg bg-dark-bg3 border border-dark-border">
              <p className="text-[0.72rem] text-dark-text2 mb-1">Manual key (if you can&apos;t scan):</p>
              <code className="text-[0.82rem] text-qsis font-mono break-all">{totpSecret}</code>
            </div>
            <p className="text-[0.78rem] text-dark-text2 mb-2">
              <strong>Step 2:</strong> Enter the 6-digit code from your authenticator app.
            </p>
            <div className="flex gap-2 items-center">
              <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={totpCode}
                onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000" autoFocus
                className="px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[1.1rem] tracking-[0.3em] text-center outline-none focus:border-qsis transition-colors font-mono" style={{ width: 130 }} />
              <button onClick={handleTotpVerify} disabled={totpLoading || totpCode.length !== 6}
                className="px-4 py-2 rounded-xl bg-gradient-to-br from-qsis to-qsis-dark text-white text-[0.82rem] font-semibold border-none cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed">
                {totpLoading ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-check mr-1"></i> Verify & Enable</>}
              </button>
              <button onClick={() => { setTotpSetupMode(false); setTotpQR(''); setTotpSecret(''); setTotpCode(''); setTotpErrMsg(''); }}
                className="px-3 py-2 rounded-xl border border-dark-border bg-transparent text-dark-text2 text-[0.78rem] font-semibold cursor-pointer hover:text-dark-text transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {totpEnabled && !totpDisableMode && (
          <>
            <div className="mt-3 mb-3 p-3 rounded-lg bg-dark-bg3 border border-dark-border">
              <p className="text-[0.78rem] font-semibold text-dark-text mb-2">
                <i className="fas fa-list-check mr-1.5 text-qsis"></i>Require 2FA for these login methods:
              </p>
              <label className="flex items-center gap-2.5 mb-2 cursor-not-allowed opacity-70">
                <input type="checkbox" checked disabled className="accent-qsis" />
                <i className="fas fa-envelope text-qsis text-[0.7rem] w-4 text-center"></i>
                <span className="text-[0.78rem] text-dark-text">Email + Password</span>
                <span className="text-[0.6rem] text-dark-text3 bg-dark-bg px-1.5 py-0.5 rounded ml-auto">always required</span>
              </label>
              <label className="flex items-center gap-2.5 mb-2 cursor-pointer">
                <input type="checkbox" checked={totpMethods.includes('google')} disabled={totpMethodsLoading}
                  onChange={e => {
                    const next = e.target.checked ? [...totpMethods, 'google'] : totpMethods.filter(m => m !== 'google');
                    setTotpMethods(next);
                    handleTotpMethodsSave(next);
                  }}
                  className="accent-qsis" />
                <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                <span className="text-[0.78rem] text-dark-text">Continue with Google</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={totpMethods.includes('magiclink')} disabled={totpMethodsLoading}
                  onChange={e => {
                    const next = e.target.checked ? [...totpMethods, 'magiclink'] : totpMethods.filter(m => m !== 'magiclink');
                    setTotpMethods(next);
                    handleTotpMethodsSave(next);
                  }}
                  className="accent-qsis" />
                <i className="fas fa-link text-accent text-[0.7rem] w-4 text-center"></i>
                <span className="text-[0.78rem] text-dark-text">Magic Link</span>
              </label>
            </div>
            <button onClick={() => setTotpDisableMode(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/40 text-red-400 bg-transparent text-[0.82rem] font-semibold cursor-pointer hover:bg-red-500/10 transition-colors">
              <i className="fas fa-unlock"></i> Disable Two-Factor Auth
            </button>
          </>
        )}

        {totpDisableMode && (
          <div className="mt-2">
            <p className="text-[0.78rem] text-dark-text2 mb-2">Enter your authenticator code to disable 2FA:</p>
            <div className="flex gap-2 items-center">
              <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={totpDisableCode}
                onChange={e => setTotpDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000" autoFocus
                className="px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[1.1rem] tracking-[0.3em] text-center outline-none focus:border-qsis transition-colors font-mono" style={{ width: 130 }} />
              <button onClick={handleTotpDisable} disabled={totpLoading || totpDisableCode.length !== 6}
                className="px-4 py-2 rounded-xl bg-red-500 text-white text-[0.82rem] font-semibold border-none cursor-pointer hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {totpLoading ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-times mr-1"></i> Disable</>}
              </button>
              <button onClick={() => { setTotpDisableMode(false); setTotpDisableCode(''); setTotpErrMsg(''); }}
                className="px-3 py-2 rounded-xl border border-dark-border bg-transparent text-dark-text2 text-[0.78rem] font-semibold cursor-pointer hover:text-dark-text transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════ QUICK ACTIONS ═══════════════ */}
      <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5 mb-4">
        <h4 className="text-[0.95rem] font-semibold mb-3"><i className="fas fa-bolt"></i> Quick Actions</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button className="flex flex-col items-center gap-2 p-4 rounded-xl border border-dark-border bg-dark-bg3 hover:border-qsis hover:bg-qsis/5 transition-all cursor-pointer" onClick={() => setUploadOpen(true)}>
            <i className="fas fa-upload text-[1.2rem] text-qsis"></i>
            <span className="text-[0.75rem] font-semibold">Upload Files</span>
          </button>
          <button className="flex flex-col items-center gap-2 p-4 rounded-xl border border-dark-border bg-dark-bg3 hover:border-qsis hover:bg-qsis/5 transition-all cursor-pointer" onClick={() => router.push('/routine')}>
            <i className="fas fa-calendar-alt text-[1.2rem] text-accent"></i>
            <span className="text-[0.75rem] font-semibold">View Routine</span>
          </button>
          <button className="flex flex-col items-center gap-2 p-4 rounded-xl border border-dark-border bg-dark-bg3 hover:border-qsis hover:bg-qsis/5 transition-all cursor-pointer" onClick={() => router.push('/history')}>
            <i className="fas fa-history text-[1.2rem] text-yellow-500"></i>
            <span className="text-[0.75rem] font-semibold">My History</span>
          </button>
          <button className="flex flex-col items-center gap-2 p-4 rounded-xl border border-dark-border bg-dark-bg3 hover:border-qsis hover:bg-qsis/5 transition-all cursor-pointer" onClick={() => router.push('/contributors')}>
            <i className="fas fa-users text-[1.2rem] text-blue-500"></i>
            <span className="text-[0.75rem] font-semibold">Team</span>
          </button>
        </div>
      </div>

      {/* ═══════════════ SWITCH CR ═══════════════ */}
      {profile.isCR && profile.department && profile.semester && profile.section && (
        <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[0.95rem] font-semibold flex items-center gap-2">
              <i className="fas fa-exchange-alt text-qsis"></i> Switch CR Role
            </h4>
            {!switchCRMode && (
              <button onClick={() => setSwitchCRMode(true)} className="px-3 py-1.5 rounded-lg border border-dark-border bg-dark-bg3 text-dark-text text-[0.72rem] font-semibold cursor-pointer hover:border-qsis transition-all">
                <i className="fas fa-exchange-alt mr-1"></i> Transfer CR
              </button>
            )}
          </div>
          <p className="text-[0.78rem] text-dark-text2 mb-3">
            Transfer your CR role to another student in your section ({profile.section}). You will lose CR privileges.
          </p>

          {switchCRMsg && (
            <div className="mb-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-[0.8rem]">
              <i className="fas fa-check-circle mr-2"></i>{switchCRMsg}
            </div>
          )}
          {switchCRErr && (
            <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[0.8rem]">
              <i className="fas fa-exclamation-circle mr-2"></i>{switchCRErr}
            </div>
          )}

          {switchCRMode && (
            <div className="bg-dark-bg3 border border-dark-border rounded-xl p-4">
              <p className="text-[0.78rem] text-dark-text2 mb-2">
                <i className="fas fa-info-circle text-qsis mr-1"></i>
                Select a student from <strong>{profile.semester} — Section {profile.section}</strong> to become the new CR.
              </p>
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
                          setSwitchCRLoading(true);
                          setSwitchCRMsg('');
                          setSwitchCRErr('');
                          try {
                            const res = await fetch('/api/cr/switch', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ targetEmail: p.userId }),
                            });
                            const data = await res.json();
                            if (data.success) {
                              setSwitchCRMsg(data.message);
                              setSwitchCRMode(false);
                              setSectionPeers([]);
                              // Update local profile
                              useAppStore.setState(s => ({
                                profile: { ...s.profile, isCR: false },
                              }));
                              fetch('/api/profile', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ isCR: false }),
                              }).catch(() => {});
                            } else {
                              setSwitchCRErr(data.error || 'Failed');
                            }
                          } catch {
                            setSwitchCRErr('Network error');
                          } finally {
                            setSwitchCRLoading(false);
                          }
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
                  fetch(`/api/admin/users?search=${profile.section || ''}`)
                    .then(r => r.json())
                    .then(data => {
                      const peers = (data.users || []).filter((u: any) =>
                        u.department === profile.department &&
                        u.semester === profile.semester &&
                        u.section === profile.section &&
                        u.email !== email &&
                        !u.isCR &&
                        u.role !== 'admin'
                      );
                      setSectionPeers(peers);
                    })
                    .catch(() => setSectionPeers([]))
                    .finally(() => setFetchingPeers(false));
                }} disabled={fetchingPeers} className="px-3 py-1.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.75rem] font-semibold cursor-pointer hover:border-qsis transition-all disabled:opacity-50">
                  <i className="fas fa-search mr-1"></i>Find Students
                </button>
                <button onClick={() => { setSwitchCRMode(false); setSectionPeers([]); setSwitchCRErr(''); setSwitchCRMsg(''); }} className="px-3 py-1.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.75rem] font-semibold cursor-pointer hover:border-qsis transition-all">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ ACTIVITY ═══════════════ */}
      <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5">
        <h4 className="text-[0.95rem] font-semibold mb-3"><i className="fas fa-chart-line"></i> Recent Activity</h4>
        {recentReads.length === 0 ? (
          <div className="text-center py-6 text-dark-text2">
            <i className="fas fa-clock text-2xl mb-2 block opacity-30"></i>
            <p className="text-[0.82rem]">No activity yet. Start browsing files!</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {recentReads.slice(0, 5).map((item: any) => (
              <div key={item.path} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-dark-bg3 transition-colors cursor-pointer" onClick={() => openRecentFile(item)}>
                <div className="text-[1.1rem]">{getFileIconByType(item.mimeType)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[0.82rem] font-semibold truncate">{item.name}</div>
                  <div className="text-[0.68rem] text-dark-text2">{item.lastRead ? timeAgo(item.lastRead) : ''}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PAT Modal */}
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
                <p className="text-[0.72rem] text-dark-text2 mt-1">Once connected, your name and profile will appear in our <strong>Contributors</strong> list. You can also upload files directly from this app.</p>
              </div>
              <div className="bg-dark-bg3 border border-dark-border rounded-xl p-3 mb-4">
                <p className="text-[0.78rem] font-semibold mb-2"><i className="fas fa-list-ol text-qsis mr-2"></i>Steps:</p>
                <ol className="text-[0.72rem] text-dark-text2 space-y-1.5 ml-4 list-decimal">
                  <li>Click the button below to open GitHub</li>
                  <li><strong>Expiration:</strong> click dropdown → select <span className="text-qsis font-bold">&quot;No expiration&quot;</span></li>
                  <li>Click <strong>Generate token</strong></li>
                  <li>Copy the token → paste below</li>
                </ol>
              </div>
              <a href="https://github.com/settings/tokens/new?scopes=repo&description=IIUC-ARMS" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-lg border border-qsis/30 bg-qsis/5 text-qsis text-[0.82rem] font-semibold hover:bg-qsis/10 transition-all mb-4 no-underline">
                <i className="fas fa-external-link-alt"></i> Open GitHub Token Page
              </a>
              <label className="text-[0.78rem] text-dark-text2 block mb-1.5">Paste your token here:</label>
              <input
                type="password"
                className="w-full px-3 py-2.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors mb-4"
                placeholder="ghp_xxxxxxxxxxxx"
                value={patInput}
                onChange={e => setPatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handlePastePAT()}
              />
              <button
                className="w-full py-2.5 rounded-lg bg-qsis text-white text-[0.82rem] font-semibold cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50"
                onClick={handlePastePAT}
                disabled={!patInput.trim() || patLoading}
              >
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

/* ─── Teacher Management Section (for admin/teacher/manager) ─── */
function TeacherInfoSection({ email, profile }: { email: string; profile: any }) {
  const { confirm, confirmDialog } = useConfirm();
  const effectiveRole = config.getEffectiveRole(email, profile.role);
  const isAdmin = effectiveRole === 'admin';
  const myDept = profile.department || '';

  const [myEntry, setMyEntry] = useState<any>(null);
  const [myEntryChecked, setMyEntryChecked] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({ department: myDept, name: profile.name || '', title: profile.title || '', shortForm: profile.shortForm || '', email: email, phone: '' });
  const [saving, setSaving] = useState(false);

  // Search state
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ department: '', name: '', title: '', shortForm: '', email: '', phone: '' });

  // Check if teacher has entry
  useEffect(() => {
    fetch('/api/faculty')
      .then(r => r.json())
      .then(data => {
        const entries = data.members || [];
        const mine = entries.find((m: any) => m.email?.toLowerCase() === email.toLowerCase());
        setMyEntry(mine || null);
        setMyEntryChecked(true);
        if (!mine) {
          setForm({ department: myDept, name: profile.name || '', title: profile.title || '', shortForm: profile.shortForm || '', email: email, phone: '' });
          setShowAddForm(true);
        }
      })
      .catch(() => setMyEntryChecked(true));
  }, [email]);

  const handleAdd = async () => {
    if (!form.department || !form.name) { showToast('Department and name required', 'error'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/faculty', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (data.success) { showToast('Your info added to directory!', 'success'); setMyEntry(data.member); setShowAddForm(false); }
      else showToast(data.error || 'Failed', 'error');
    } catch { showToast('Failed', 'error'); }
    finally { setSaving(false); }
  };

  const handleSearch = async () => {
    if (!search.trim()) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const params = new URLSearchParams({ search: search.trim() });
      const res = await fetch(`/api/faculty?${params}`);
      const data = await res.json();
      setSearchResults(data.members || []);
    } catch { setSearchResults([]); }
    finally { setSearching(false); }
  };

  const handleEditSave = async (id: string) => {
    if (!editForm.department || !editForm.name) { showToast('Department and name required', 'error'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/faculty', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...editForm }) });
      const data = await res.json();
      if (data.success) {
        showToast('Updated', 'success');
        setEditingId(null);
        // Refresh myEntry if it was the one edited
        if (myEntry?.id === id) setMyEntry(data.member);
        // Refresh search results
        if (searchResults) handleSearch();
      } else showToast(data.error || 'Failed', 'error');
    } catch { showToast('Failed', 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!await confirm({ message: `Remove ${name} from faculty directory?`, danger: true, title: 'Remove Faculty' })) return;
    try {
      const res = await fetch(`/api/faculty?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast(`${name} removed`, 'success');
        if (myEntry?.id === id) setMyEntry(null);
        if (searchResults) handleSearch();
      } else showToast(data.error || 'Failed', 'error');
    } catch { showToast('Failed', 'error'); }
  };

  const getDeptLabel = (deptId: string) => {
    const found = FACULTIES.flatMap(f => f.departments.map(d => ({ ...d, faculty: f.shortName }))).find(d => d.id === deptId);
    return found ? `${found.shortName} — ${found.faculty}` : deptId;
  };

  const canManage = (m: any) => {
    if (isAdmin) return true;
    if (myDept && m.department === myDept) return true;
    return false;
  };

  if (!myEntryChecked) {
    return (
      <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5 mb-4">
        <div className="text-center py-4"><i className="fas fa-spinner fa-spin text-xl text-qsis"></i></div>
      </div>
    );
  }

  return (
    <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5 mb-4">
      <h4 className="text-[0.95rem] font-semibold flex items-center gap-2 mb-4">
        <i className="fas fa-chalkboard-teacher text-qsis"></i> Teacher Directory
      </h4>

      {/* ─── PROMPT: No entry → Add Your Info ─── */}
      {!myEntry && showAddForm && (
        <div className="bg-gradient-to-br from-qsis/5 to-accent/5 border border-qsis/20 rounded-xl p-4 mb-4">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-qsis/15 flex items-center justify-center flex-shrink-0">
              <i className="fas fa-user-plus text-qsis text-sm"></i>
            </div>
            <div>
              <h5 className="text-[0.85rem] font-semibold text-dark-text">Complete Your Teacher Profile</h5>
              <p className="text-[0.75rem] text-dark-text2 mt-0.5">You are not in the faculty directory yet. Add your info so students and colleagues can find you.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-[0.7rem] text-dark-text2 block mb-1">Department *</label>
              <CustomSelect
                value={form.department}
                onChange={value => setForm(f => ({ ...f, department: value }))}
                placeholder="Select department..."
                options={FACULTIES.flatMap(f => f.departments.map(d => ({ value: d.id, label: `${d.shortName} — ${d.name}`, icon: 'fa-building', group: `${f.shortName} — ${f.name}` })))}
              />
            </div>
            <div>
              <label className="text-[0.7rem] text-dark-text2 block mb-1">Full Name *</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" />
            </div>
            <div>
              <label className="text-[0.7rem] text-dark-text2 block mb-1">Designation</label>
              <CustomSelect
                value={TEACHER_TITLES.includes(form.title) ? form.title : form.title ? '__custom' : ''}
                onChange={value => setForm(f => ({ ...f, title: value === '__custom' ? '' : value }))}
                placeholder="Select designation..."
                options={[...TEACHER_TITLES.map(t => ({ value: t, label: t, icon: 'fa-chalkboard-teacher' })), { value: '__custom', label: 'Other (type below)', icon: 'fa-chalkboard-teacher' }]}
              />
              {!TEACHER_TITLES.includes(form.title) && form.title !== '' && (
                <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Type designation" className="w-full mt-1 px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" />
              )}
            </div>
            <div>
              <label className="text-[0.7rem] text-dark-text2 block mb-1">Short Form</label>
              <input type="text" value={form.shortForm} onChange={e => setForm(f => ({ ...f, shortForm: e.target.value.toUpperCase() }))} placeholder="e.g. GH" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" />
            </div>
            <div>
              <label className="text-[0.7rem] text-dark-text2 block mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" />
            </div>
            <div>
              <label className="text-[0.7rem] text-dark-text2 block mb-1">Phone</label>
              <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+8801XXXXXXXXX" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={saving || !form.department || !form.name} className="px-4 py-2 rounded-lg bg-qsis text-white text-[0.78rem] font-semibold cursor-pointer hover:opacity-90 border-none disabled:opacity-50">
              {saving ? <><i className="fas fa-spinner fa-spin mr-1"></i>Saving...</> : <><i className="fas fa-plus mr-1"></i>Add My Info</>}
            </button>
            <button onClick={() => setShowAddForm(false)} className="px-4 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.78rem] cursor-pointer hover:border-qsis">Skip</button>
          </div>
        </div>
      )}

      {/* ─── MY CARD: Entry found → Show card ─── */}
      {myEntry && (
        <div className="bg-gradient-to-br from-qsis/5 to-accent/5 border border-qsis/20 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-qsis/20 to-accent/20 border border-dark-border flex items-center justify-center flex-shrink-0">
              <span className="text-[0.78rem] font-bold text-qsis">{myEntry.shortForm || myEntry.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[0.9rem] font-bold text-dark-text">{myEntry.name}</span>
                <span className="px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 text-[0.6rem] font-semibold">In Directory</span>
              </div>
              {myEntry.title && <p className="text-[0.75rem] text-qsis font-medium">{myEntry.title}</p>}
              <p className="text-[0.72rem] text-dark-text3">{getDeptLabel(myEntry.department)}{myEntry.email ? ` · ${myEntry.email}` : ''}{myEntry.phone ? ` · ${myEntry.phone}` : ''}</p>
            </div>
          </div>
        </div>
      )}

      {/* ─── SEARCH: Find any teacher ─── */}
      <div className="mb-4">
        <label className="text-[0.72rem] text-dark-text2 block mb-1"><i className="fas fa-search mr-1"></i>Search Teachers</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); if (!e.target.value) setSearchResults(null); }}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search by name, email, or short form..."
            className="flex-1 px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors"
          />
          <button onClick={handleSearch} disabled={searching || !search.trim()} className="px-4 py-2 rounded-lg bg-qsis text-white text-[0.78rem] font-semibold cursor-pointer hover:opacity-90 border-none disabled:opacity-50">
            {searching ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-search"></i>}
          </button>
        </div>
      </div>

      {/* ─── SEARCH RESULTS ─── */}
      {searchResults !== null && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[0.78rem] text-dark-text2">{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</span>
            <button onClick={() => { setSearchResults(null); setSearch(''); }} className="text-[0.72rem] text-dark-text3 hover:text-qsis bg-transparent border-none cursor-pointer"><i className="fas fa-times mr-1"></i>Clear</button>
          </div>
          {searchResults.length === 0 ? (
            <p className="text-[0.78rem] text-dark-text3 text-center py-4">No teachers found</p>
          ) : (
            <div className="space-y-2">
              {searchResults.map(m => (
                <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg bg-dark-bg3 border border-dark-border hover:border-qsis/30 transition-all group">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-qsis/20 to-accent/20 border border-dark-border flex items-center justify-center flex-shrink-0">
                    <span className="text-[0.68rem] font-bold text-qsis">{m.shortForm || m.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}</span>
                  </div>
                  {editingId === m.id ? (
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input type="text" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="px-2 py-1 rounded border border-qsis/50 bg-dark-bg text-dark-text text-[0.75rem] outline-none" placeholder="Name" />
                      <input type="text" value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} className="px-2 py-1 rounded border border-qsis/50 bg-dark-bg text-dark-text text-[0.75rem] outline-none" placeholder="Designation" />
                      <input type="text" value={editForm.shortForm} onChange={e => setEditForm(f => ({ ...f, shortForm: e.target.value.toUpperCase() }))} className="px-2 py-1 rounded border border-qsis/50 bg-dark-bg text-dark-text text-[0.75rem] outline-none" placeholder="Short Form" />
                      <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} className="px-2 py-1 rounded border border-qsis/50 bg-dark-bg text-dark-text text-[0.75rem] outline-none" placeholder="Email" />
                      <input type="tel" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} className="px-2 py-1 rounded border border-qsis/50 bg-dark-bg text-dark-text text-[0.75rem] outline-none" placeholder="Phone" />
                      <div className="flex gap-1">
                        <button onClick={() => handleEditSave(m.id)} disabled={saving} className="px-2 py-1 rounded bg-qsis text-white text-[0.68rem] cursor-pointer border-none disabled:opacity-50"><i className="fas fa-check"></i></button>
                        <button onClick={() => setEditingId(null)} className="px-2 py-1 rounded border border-dark-border text-dark-text2 text-[0.68rem] cursor-pointer bg-dark-bg">X</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[0.82rem] font-medium text-dark-text truncate">{m.name}</span>
                          {m.title && <span className="text-[0.65rem] text-qsis italic">{m.title}</span>}
                          {m.email?.toLowerCase() === email.toLowerCase() && <span className="text-[0.55rem] text-green-400 font-semibold">(You)</span>}
                        </div>
                        <p className="text-[0.7rem] text-dark-text3">{getDeptLabel(m.department)}{m.email ? ` · ${m.email}` : ''}{m.phone ? ` · ${m.phone}` : ''}</p>
                      </div>
                      {canManage(m) && (
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                          <button onClick={() => { setEditingId(m.id); setEditForm({ department: m.department, name: m.name, title: m.title || '', shortForm: m.shortForm || '', email: m.email || '', phone: m.phone || '' }); }} className="px-2 py-1 rounded bg-dark-bg border border-dark-border text-dark-text2 hover:text-qsis text-[0.65rem] cursor-pointer transition-all" title="Edit">
                            <i className="fas fa-pen"></i>
                          </button>
                          <button onClick={() => handleDelete(m.id, m.name)} className="px-2 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 text-[0.65rem] cursor-pointer transition-all border-none" title="Delete">
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Hint ─── */}
      {!myEntry && !showAddForm && (
        <button onClick={() => setShowAddForm(true)} className="w-full py-3 rounded-lg border border-dashed border-dark-border text-dark-text2 hover:text-qsis hover:border-qsis/50 text-[0.82rem] cursor-pointer bg-transparent transition-all">
          <i className="fas fa-plus-circle mr-2"></i>Add Your Teacher Info
        </button>
      )}
      {confirmDialog}
    </div>
  );
}
