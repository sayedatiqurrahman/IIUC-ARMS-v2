'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import { useAppStore } from '@/lib/store';
import { config } from '@/lib/config';
import { getFileIconByType, showToast, timeAgo } from '@/lib/utils';

export default function DashboardView() {
  const router = useRouter();
  const { data: session } = useSession();
  const profile = useAppStore(s => s.profile);
  const updateProfile = useAppStore(s => s.updateProfile);
  const recentReads = useAppStore(s => s.recentReads);
  const openRecentFile = useAppStore(s => s.openRecentFile);
  const setUploadOpen = useAppStore(s => s.setUploadOpen);
  const navigateToRoutine = useAppStore(s => s.navigateToRoutine);
  const navigateToHistory = useAppStore(s => s.navigateToHistory);
  const navigateToContributors = useAppStore(s => s.navigateToContributors);

  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ universityId: '', name: '', whatsapp: '', semester: '' });

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
            <Image src={(session as any)?.user?.image || profile.image || ''} alt="" width={64} height={64} className="w-16 h-16 rounded-full border-2 border-qsis" />
            <div>
              <h4 className="text-[1.1rem] font-bold">{(session as any)?.user?.name || profile.name || 'User'}</h4>
              <p className="text-[0.82rem] text-dark-text2">{session?.user?.email || profile.email || ''}</p>
            </div>
          </div>
          {!editingProfile && (
            <button className="px-3 py-1.5 rounded-lg border border-dark-border bg-dark-bg3 text-dark-text text-[0.75rem] font-semibold cursor-pointer hover:border-qsis transition-all" onClick={() => {
              setProfileForm({ universityId: profile.universityId, name: profile.name || (session as any)?.user?.name || '', whatsapp: profile.whatsapp, semester: profile.semester });
              setEditingProfile(true);
            }}>
              <i className="fas fa-pen mr-1"></i> Edit Profile
            </button>
          )}
        </div>

        {/* Profile Completion */}
        {(() => {
          const filled = [profile.universityId, profile.name || (session as any)?.user?.name, profile.whatsapp, profile.semester].filter(Boolean).length;
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
                <label className="text-[0.72rem] text-dark-text2 block mb-1">University ID *</label>
                <input type="text" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" placeholder="e.g. Q233099" value={profileForm.universityId} onChange={e => setProfileForm(p => ({ ...p, universityId: e.target.value }))} />
              </div>
              <div>
                <label className="text-[0.72rem] text-dark-text2 block mb-1">Full Name *</label>
                <input type="text" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" placeholder="e.g. Sayed Atiqur Rahman" value={profileForm.name} onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))} />
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-dark-bg3 border border-dark-border">
              <span className="text-[0.7rem] text-dark-text2 block mb-1">University ID</span>
              <span className={`text-[0.85rem] font-semibold ${profile.universityId ? 'text-qsis' : 'text-dark-text2'}`}>{profile.universityId || 'Not set'}</span>
            </div>
            <div className="p-3 rounded-lg bg-dark-bg3 border border-dark-border">
              <span className="text-[0.7rem] text-dark-text2 block mb-1">Department</span>
              <span className="text-[0.85rem] font-semibold">Qur&apos;anic Sciences &amp; Islamic Studies</span>
            </div>
            <div className="p-3 rounded-lg bg-dark-bg3 border border-dark-border">
              <span className="text-[0.7rem] text-dark-text2 block mb-1">WhatsApp</span>
              <span className={`text-[0.85rem] font-semibold ${profile.whatsapp ? '' : 'text-dark-text2'}`}>{profile.whatsapp || 'Not set'}</span>
            </div>
            <div className="p-3 rounded-lg bg-dark-bg3 border border-dark-border">
              <span className="text-[0.7rem] text-dark-text2 block mb-1">Semester</span>
              <span className={`text-[0.85rem] font-semibold ${profile.semester ? '' : 'text-dark-text2'}`}>{profile.semester ? config.semesters.find(s => s.id === profile.semester)?.label || profile.semester : 'Not set'}</span>
            </div>
          </div>
        )}
      </div>

      {/* GitHub Connection */}
      <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5 mb-4">
        <h4 className="text-[0.95rem] font-semibold mb-3 flex items-center gap-2">
          <i className="fab fa-github"></i> GitHub Connection
        </h4>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-dark-bg3 border border-dark-border">
          <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
            <i className="fas fa-check-circle text-green-500"></i>
          </div>
          <div className="flex-1">
            <span className="text-[0.85rem] font-semibold block">Connected</span>
            <span className="text-[0.72rem] text-dark-text2">You can upload and create PRs</span>
          </div>
          <button className="px-3 py-1.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.75rem] font-semibold cursor-pointer hover:border-qsis transition-all">
            Manage
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
