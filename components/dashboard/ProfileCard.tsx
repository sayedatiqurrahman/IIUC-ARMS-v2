'use client';

import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { FACULTIES } from '@/lib/departments';
import { config } from '@/lib/config';
import CustomSelect from '@/components/CustomSelect';
import BatchSelector from './BatchSelector';
import SocialLinks from './SocialLinks';

function extractUniversityId(email: string): string {
  const match = email.match(/^(q\d+)/i);
  return match ? match[1].toUpperCase() : '';
}

interface ProfileCardProps {
  profile: any;
  displayImage: string;
  displayName: string;
  displayEmail: string;
  hasGitHub: boolean;
  ghUser: any;
  isStudent: boolean;
  isTeacherOrAbove: boolean;
  editingProfile: boolean;
  editingSocials: boolean;
  profileForm: any;
  setProfileForm: React.Dispatch<React.SetStateAction<any>>;
  setEditingProfile: (v: boolean) => void;
  setEditingSocials: (v: boolean) => void;
  updateProfile: (data: any) => void;
  socialLinks: { icon: string; label: string; url: string }[];
  uploadingAvatar: boolean;
  avatarInputRef: React.RefObject<HTMLInputElement | null>;
  handleAvatarUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function ProfileCard({
  profile, displayImage, displayName, displayEmail,
  hasGitHub, ghUser, isStudent, isTeacherOrAbove,
  editingProfile, editingSocials,
  profileForm, setProfileForm, setEditingProfile, setEditingSocials,
  updateProfile, socialLinks,
  uploadingAvatar, avatarInputRef, handleAvatarUpload,
}: ProfileCardProps) {
  const { data: session } = useSession();

  return (
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
              showInContributors: (profile as any).showInContributors !== false,
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
            {/* Contact Info */}
            <div>
              <label className="text-[0.72rem] text-dark-text2 block mb-1"><i className="fab fa-whatsapp mr-1"></i>WhatsApp</label>
              <input type="tel" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" placeholder="e.g. +8801XXXXXXXXX" value={profileForm.whatsapp} onChange={e => setProfileForm(p => ({ ...p, whatsapp: e.target.value }))} />
            </div>
            <div>
              <label className="text-[0.72rem] text-dark-text2 block mb-1"><i className="fas fa-envelope mr-1"></i>Public Email <span className="text-dark-text3">(shown on profile)</span></label>
              <input type="email" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" placeholder="e.g. yourmail@gmail.com" value={profileForm.publicEmail} onChange={e => setProfileForm(p => ({ ...p, publicEmail: e.target.value }))} />
              <p className="text-[0.65rem] text-dark-text3 mt-0.5">Leave empty to use login email</p>
            </div>
            <div>
              <label className="text-[0.72rem] text-dark-text2 block mb-1"><i className="fab fa-telegram mr-1"></i>Telegram Username / Number</label>
              <input type="text" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" placeholder="e.g. @username or +8801XXXXXXXXX" value={profileForm.telegramId} onChange={e => setProfileForm(p => ({ ...p, telegramId: e.target.value }))} />
              {profile.telegramChatId ? (
                <p className="text-[0.65rem] text-green-400 mt-0.5"><i className="fas fa-check-circle mr-0.5"></i>Connected</p>
              ) : (
                <p className="text-[0.65rem] text-dark-text3 mt-0.5">
                  Open <a href="https://t.me/iiuc_arms_bot" target="_blank" rel="noopener" className="text-qsis underline">@iiuc_arms_bot</a> and send{' '}
                  <code className="bg-dark-bg px-1 rounded text-qsis">/connect {profile.email || (session as any)?.user?.email || '...'}</code>
                </p>
              )}
            </div>
            {isStudent && (
              <div>
                <label className="text-[0.72rem] text-dark-text2 block mb-1">University ID</label>
                <input type="text" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" placeholder="e.g. Q233099" value={profileForm.universityId} onChange={e => setProfileForm(p => ({ ...p, universityId: e.target.value }))} />
              </div>
            )}
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
            <div className="border-t border-dark-border my-2"></div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={profileForm.showInContributors} onChange={e => setProfileForm(p => ({ ...p, showInContributors: e.target.checked }))} className="accent-qsis" />
              <span className="text-[0.78rem] text-dark-text">Show me on Contributors page</span>
            </label>
          </div>

          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-xl bg-gradient-to-br from-qsis to-qsis-dark text-white border-none font-semibold text-[0.8rem] cursor-pointer hover:opacity-90 transition-opacity" onClick={() => {
              updateProfile(profileForm);
              setEditingProfile(false);
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
            <div className="p-3 rounded-lg bg-dark-bg3 border border-dark-border">
              <span className="text-[0.7rem] text-dark-text2 block mb-1"><i className="fab fa-telegram mr-1 text-blue-400"></i>Telegram</span>
              <span className={`text-[0.85rem] font-semibold ${profile.telegramId ? '' : 'text-dark-text2'}`}>
                {profile.telegramId || 'Not set'}
              </span>
              {profile.telegramChatId ? (
                <p className="text-[0.6rem] text-green-400 mt-0.5"><i className="fas fa-check-circle mr-0.5"></i>Connected! You&apos;ll receive routine updates</p>
              ) : (
                <div className="mt-1">
                  {profile.telegramId && (
                    <p className="text-[0.6rem] text-yellow-400"><i className="fas fa-link mr-0.5"></i>Pending connection</p>
                  )}
                  <p className="text-[0.6rem] text-dark-text3 mt-0.5">
                    Open <a href="https://t.me/iiuc_arms_bot" target="_blank" rel="noopener" className="text-qsis underline">@iiuc_arms_bot</a> and send:<br/>
                    <code className="bg-dark-bg px-1 rounded text-qsis text-[0.6rem]">/connect {profile.email || (session as any)?.user?.email || 'youremail@example.com'}</code>
                  </p>
                </div>
              )}
            </div>
            <div className="p-3 rounded-lg bg-dark-bg3 border border-dark-border">
              <span className="text-[0.7rem] text-dark-text2 block mb-1"><i className="fas fa-envelope mr-1 text-blue-400"></i>Public Email</span>
              <span className={`text-[0.85rem] font-semibold ${profile.publicEmail ? '' : 'text-dark-text2'}`}>
                {profile.publicEmail || profile.email || 'Not set'}
              </span>
              <p className="text-[0.6rem] text-dark-text3 mt-0.5">Shown on public contributors profile</p>
            </div>
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
          <SocialLinks
            profile={profile}
            profileForm={profileForm}
            setProfileForm={setProfileForm}
            editingSocials={editingSocials}
            setEditingSocials={setEditingSocials}
            updateProfile={updateProfile}
          />
        </>
      )}
    </div>
  );
}
