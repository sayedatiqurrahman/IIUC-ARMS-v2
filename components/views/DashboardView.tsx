'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import { useAppStore } from '@/lib/store';
import { config } from '@/lib/config';
import { getFileIconByType, showToast, timeAgo } from '@/lib/utils';
import { updateUserProfile } from '@/lib/firebase';
import { connectGitHubPopup } from '@/lib/github-connect';

function extractUniversityId(email: string): string {
  const match = email.match(/^(q\d+)/i);
  return match ? match[1].toUpperCase() : '';
}

export default function DashboardView() {
  const router = useRouter();
  const { data: session } = useSession();
  const profile = useAppStore(s => s.profile);
  const updateProfile = useAppStore(s => s.updateProfile);
  const recentReads = useAppStore(s => s.recentReads);
  const openRecentFile = useAppStore(s => s.openRecentFile);
  const setUploadOpen = useAppStore(s => s.setUploadOpen);
  const loadProfile = useAppStore(s => s.loadProfile);

  const [editingProfile, setEditingProfile] = useState(false);
  const [editingSocials, setEditingSocials] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [profileForm, setProfileForm] = useState({
    universityId: '', name: '', whatsapp: '', semester: '',
    facebook: '', twitter: '', linkedin: '', website: '',
    hideWhatsapp: false, hideUniversityId: false,
  });

  const hasGitHub = !!(session as any)?.accessToken || !!profile.githubLogin;

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
  const displayEmail = profile.email || session?.user?.email || '';
  const displayImage = profile.image || (session as any)?.user?.image || '';

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

      // Save to our DB
      await updateProfile({ image: base64 });

      // Also update Firebase Auth profile
      try {
        await updateUserProfile(undefined, base64);
      } catch {}

      showToast('Profile picture updated!', 'success');
    } catch {
      showToast('Failed to update picture', 'error');
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  }

  return (
    <section className="mb-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold flex items-center gap-2"><i className="fas fa-th-large"></i> Dashboard</h3>
        <button className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold" onClick={() => router.push('/')}>
          <i className="fas fa-arrow-left"></i> Back
        </button>
      </div>

      {/* Profile Card */}
      <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            {/* Avatar with upload */}
            <div className="relative group cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
              <Image src={displayImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=22c55e&color=fff&bold=true&size=200`} alt="" width={64} height={64} className="w-16 h-16 rounded-full border-2 border-qsis object-cover" />
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {uploadingAvatar ? (
                  <i className="fas fa-spinner fa-spin text-white text-sm"></i>
                ) : (
                  <i className="fas fa-camera text-white text-sm"></i>
                )}
              </div>
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            </div>
            <div>
              <h4 className="text-[1.1rem] font-bold">{displayName}</h4>
              <p className="text-[0.82rem] text-dark-text2">{displayEmail}</p>
              {profile.githubLogin && (
                <p className="text-[0.72rem] text-dark-text2"><i className="fab fa-github mr-1"></i>@{profile.githubLogin}</p>
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
                semester: profile.semester,
                facebook: profile.facebook,
                twitter: profile.twitter,
                linkedin: profile.linkedin,
                website: profile.website,
                hideWhatsapp: profile.hideWhatsapp,
                hideUniversityId: profile.hideUniversityId,
              });
              setEditingProfile(true);
            }}>
              <i className="fas fa-pen mr-1"></i> Edit Profile
            </button>
          )}
        </div>

        {/* Profile Completion */}
        {(() => {
          const filled = [profile.universityId, profile.name, profile.whatsapp, profile.semester].filter(Boolean).length;
          const pct = Math.round((filled / 4) * 100);
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
              <div>
                <label className="text-[0.72rem] text-dark-text2 block mb-1">Full Name</label>
                <input type="text" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" placeholder="e.g. Sayed Atiqur Rahman" value={profileForm.name} onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label className="text-[0.72rem] text-dark-text2 block mb-1">University ID</label>
                <input type="text" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" placeholder="e.g. Q233099" value={profileForm.universityId} onChange={e => setProfileForm(p => ({ ...p, universityId: e.target.value }))} />
              </div>
              <div>
                <label className="text-[0.72rem] text-dark-text2 block mb-1">WhatsApp</label>
                <input type="tel" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" placeholder="e.g. +8801XXXXXXXXX" value={profileForm.whatsapp} onChange={e => setProfileForm(p => ({ ...p, whatsapp: e.target.value }))} />
              </div>
              <div>
                <label className="text-[0.72rem] text-dark-text2 block mb-1">Current Semester</label>
                <select className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" value={profileForm.semester} onChange={e => setProfileForm(p => ({ ...p, semester: e.target.value }))}>
                  <option value="">Select semester...</option>
                  {config.semesters.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
            </div>

            {/* Privacy Toggles */}
            <div className="mb-3 p-3 rounded-lg bg-dark-bg border border-dark-border">
              <p className="text-[0.72rem] text-dark-text2 mb-2"><i className="fas fa-eye-slash mr-1"></i>Privacy Settings</p>
              <label className="flex items-center gap-2 cursor-pointer mb-2">
                <input type="checkbox" checked={profileForm.hideUniversityId} onChange={e => setProfileForm(p => ({ ...p, hideUniversityId: e.target.checked }))} className="accent-qsis" />
                <span className="text-[0.78rem] text-dark-text">Hide University ID from public profile</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={profileForm.hideWhatsapp} onChange={e => setProfileForm(p => ({ ...p, hideWhatsapp: e.target.checked }))} className="accent-qsis" />
                <span className="text-[0.78rem] text-dark-text">Hide WhatsApp from public profile</span>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div className="p-3 rounded-lg bg-dark-bg3 border border-dark-border">
                <span className="text-[0.7rem] text-dark-text2 block mb-1">University ID</span>
                <span className={`text-[0.85rem] font-semibold ${profile.universityId ? 'text-qsis' : 'text-dark-text2'}`}>
                  {profile.universityId ? (profile.hideUniversityId ? '***' : profile.universityId) : 'Not set'}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-dark-bg3 border border-dark-border">
                <span className="text-[0.7rem] text-dark-text2 block mb-1">Department</span>
                <span className="text-[0.85rem] font-semibold">Qur&apos;anic Sciences &amp; Islamic Studies</span>
              </div>
              <div className="p-3 rounded-lg bg-dark-bg3 border border-dark-border">
                <span className="text-[0.7rem] text-dark-text2 block mb-1">WhatsApp</span>
                <span className={`text-[0.85rem] font-semibold ${profile.whatsapp ? '' : 'text-dark-text2'}`}>
                  {profile.whatsapp ? (profile.hideWhatsapp ? '***' : profile.whatsapp) : 'Not set'}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-dark-bg3 border border-dark-border">
                <span className="text-[0.7rem] text-dark-text2 block mb-1">Semester</span>
                <span className={`text-[0.85rem] font-semibold ${profile.semester ? '' : 'text-dark-text2'}`}>{profile.semester ? config.semesters.find(s => s.id === profile.semester)?.label || profile.semester : 'Not set'}</span>
              </div>
            </div>

            {/* Social Links */}
            {(profile.facebook || profile.twitter || profile.linkedin || profile.website) && (
              <div className="flex flex-wrap gap-2 mt-2">
                {profile.facebook && <a href={profile.facebook} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-dark-bg3 border border-dark-border text-[0.72rem] text-dark-text2 hover:text-qsis hover:border-qsis transition-all"><i className="fab fa-facebook"></i> Facebook</a>}
                {profile.twitter && <a href={profile.twitter} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-dark-bg3 border border-dark-border text-[0.72rem] text-dark-text2 hover:text-qsis hover:border-qsis transition-all"><i className="fab fa-twitter"></i> Twitter</a>}
                {profile.linkedin && <a href={profile.linkedin} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-dark-bg3 border border-dark-border text-[0.72rem] text-dark-text2 hover:text-qsis hover:border-qsis transition-all"><i className="fab fa-linkedin"></i> LinkedIn</a>}
                {profile.website && <a href={profile.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-dark-bg3 border border-dark-border text-[0.72rem] text-dark-text2 hover:text-qsis hover:border-qsis transition-all"><i className="fas fa-globe"></i> Website</a>}
              </div>
            )}
          </>
        )}

        {/* Edit Social Links */}
        {!editingProfile && (
          <div className="mt-3">
            {editingSocials ? (
              <div className="bg-dark-bg3 border border-dark-border rounded-xl p-4">
                <h5 className="text-[0.85rem] font-semibold mb-3"><i className="fas fa-share-alt text-qsis mr-2"></i>Social Links</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
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
                  <div>
                    <label className="text-[0.72rem] text-dark-text2 block mb-1"><i className="fas fa-globe mr-1"></i>Website URL</label>
                    <input type="url" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" placeholder="https://..." value={profileForm.website} onChange={e => setProfileForm(p => ({ ...p, website: e.target.value }))} />
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
          </div>
        )}
      </div>

      {/* GitHub Connection */}
      <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5 mb-4">
        <h4 className="text-[0.95rem] font-semibold mb-3 flex items-center gap-2">
          <i className="fab fa-github"></i> GitHub Connection
        </h4>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-dark-bg3 border border-dark-border">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${hasGitHub ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
            <i className={`fas ${hasGitHub ? 'fa-check-circle text-green-500' : 'fa-times-circle text-red-500'}`}></i>
          </div>
          <div className="flex-1">
            <span className="text-[0.85rem] font-semibold block">{hasGitHub ? 'Connected' : 'Not Connected'}</span>
            <span className="text-[0.72rem] text-dark-text2">{hasGitHub ? 'You can upload and create PRs' : 'Connect GitHub to upload files'}</span>
          </div>
          <button className="px-3 py-1.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.75rem] font-semibold cursor-pointer hover:border-qsis transition-all" onClick={async () => {
            const email = profile.email || session?.user?.email || '';
            if (!email) { showToast('Please save your profile first', 'error'); return; }
            showToast('Opening GitHub...', 'info');
            const connected = await connectGitHubPopup(email);
            if (connected) {
              await loadProfile();
              showToast('GitHub connected!', 'success');
            } else {
              showToast('GitHub connection cancelled or failed', 'error');
            }
          }}>
            {hasGitHub ? 'Reconnect' : 'Connect'}
          </button>
        </div>
      </div>

      {/* Quick Actions */}
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

      {/* Activity */}
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
    </section>
  );
}
