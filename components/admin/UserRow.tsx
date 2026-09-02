'use client';

import { useState } from 'react';
import { config } from '@/lib/config';
import CustomSelect from '@/components/CustomSelect';
import { type UserRecord } from './types';

function InfoField({ label, value, icon, link }: { label: string; value: string; icon?: string; link?: string }) {
  return (
    <div className="bg-dark-bg3 rounded-lg p-2">
      <p className="text-[0.55rem] text-dark-text3 uppercase tracking-wider mb-0.5">{label}</p>
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" className="text-[0.7rem] text-qsis hover:underline flex items-center gap-1">
          {icon && <i className={`${icon} text-[0.5rem]`}></i>}
          {value}
        </a>
      ) : (
        <p className="text-[0.7rem] text-dark-text flex items-center gap-1">
          {icon && <i className={`${icon} text-dark-text3 text-[0.5rem]`}></i>}
          {value}
        </p>
      )}
    </div>
  );
}

function getRoleBadge(role: string | null, customRoles: { key: string; label: string; icon: string; color: string }[] = []) {
  switch (role) {
    case 'admin': return <span className="px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 text-[0.65rem] font-semibold">Admin</span>;
    case 'manager': return <span className="px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 text-[0.65rem] font-semibold">Manager</span>;
    case 'teacher': return <span className="px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 text-[0.65rem] font-semibold">Teacher</span>;
    case 'student': return <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 text-[0.65rem] font-semibold">Student</span>;
    default: {
      const cr = customRoles.find(r => r.key === role);
      if (cr) return <span className={`px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-[0.65rem] font-semibold`}><i className={`fas ${cr.icon} mr-0.5 ${cr.color}`}></i>{cr.label}</span>;
      return <span className="px-2 py-0.5 rounded-full bg-gray-500/15 text-gray-400 text-[0.65rem] font-semibold">User</span>;
    }
  }
}

function formatDate(d: string) {
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

interface UserRowProps {
  u: UserRecord;
  email: string;
  isAdmin: boolean;
  isManager: boolean;
  isSuperAdmin: boolean;
  canApprovePending?: boolean;
  actionLoading: string;
  isPendingTab?: boolean;
  handleToggleCR: (email: string, current: boolean) => void;
  handleToggleACR: (email: string, current: boolean) => void;
  handleSetRole: (email: string, role: string) => void;
  handleBan: (email: string, isBanned: boolean) => void;
  customRoles?: { key: string; label: string; icon: string; color: string }[];
  handleToggleManager: (email: string, currentRole: string) => void;
  handleApprove?: (email: string) => void;
  handleReject?: (email: string) => void;
  handleDeleteUser?: (email: string) => void;
  handleSendToPending?: (email: string) => void;
  handleEmail?: (u: UserRecord) => void;
  handleLinkEmail?: (u: UserRecord) => void;
}

export default function UserRow({
  u,
  email,
  isAdmin,
  isManager,
  isSuperAdmin,
  canApprovePending = false,
  actionLoading,
  isPendingTab,
  handleToggleCR,
  handleToggleACR,
  handleSetRole,
  handleBan,
  customRoles = [],
  handleToggleManager,
  handleApprove,
  handleReject,
  handleDeleteUser,
  handleSendToPending,
  handleEmail,
  handleLinkEmail,
}: UserRowProps) {
  const isSelf = u.email === email;
  const uRole = u.role || 'user';
  const isOwnerUser = config.ownerEmails.includes(u.email.toLowerCase());
  const isUniversityEmail = /@iiuc\.ac\.bd$/i.test(u.email);
  const isPendingRow = isPendingTab || u.accountStatus === 'pending';
  const canSendToPending = isAdmin && !isSelf && !isOwnerUser && !isUniversityEmail && u.accountStatus === 'active' && !isPendingTab;
  const canEmail = (isAdmin || isManager) && !isSelf && !isOwnerUser && !isUniversityEmail;
  const canEditRole = !isSelf && !isOwnerUser && (isAdmin || (isManager && uRole !== 'admin' && uRole !== 'manager'));
  const canBan = !isSelf && !isOwnerUser && uRole !== 'admin' && (isAdmin || isManager);
  const canToggleCR = !isSelf && (isAdmin || isManager);
  const canToggleACR = !isSelf && (isAdmin || isManager);
  const canPromoteManager = isAdmin && !isSelf && !isOwnerUser;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`bg-dark-bg2 border rounded-xl p-3 sm:p-4 transition-all hover:border-qsis/30 ${u.isBanned ? 'border-red-500/30 opacity-60' : 'border-dark-border'}`}>
      {/* Row 1: Avatar + Name + Badges + Expand */}
      <div className="flex items-center gap-2.5">
        <div className="relative flex-shrink-0">
          <img src={u.githubAvatar || u.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name || u.email)}&background=6366f1&color=fff&bold=true&size=48`} alt="" className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border-2 border-dark-border object-cover" />
          {u.isBanned && <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center"><i className="fas fa-ban text-white text-[0.45rem]"></i></div>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[0.82rem] sm:text-[0.85rem] font-semibold text-dark-text truncate">{u.name || u.email.split('@')[0]}</span>
            {(uRole === 'user' || uRole === 'external') && (
              <span className="px-1.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 text-[0.6rem] font-semibold" title="Not a real role — external is the grouping for non-university emails. Assign a role to move this account to the matching list.">No role</span>
            )}
            {uRole !== 'user' && uRole !== 'external' && getRoleBadge(u.role, customRoles)}
            {u.isCR && <span className="px-1.5 py-0.5 rounded-md bg-purple-500/15 text-purple-400 text-[0.6rem] font-bold">CR</span>}
            {u.isACR && <span className="px-1.5 py-0.5 rounded-md bg-indigo-500/15 text-indigo-400 text-[0.6rem] font-bold">ACR</span>}
            {isOwnerUser && <span className="px-1.5 py-0.5 rounded-md bg-yellow-500/15 text-yellow-400 text-[0.6rem] font-bold"><i className="fas fa-star mr-0.5"></i>Owner</span>}
            {u.gender && isPendingRow && (
              <span className={`px-1.5 py-0.5 rounded-full text-[0.6rem] font-semibold ${
                u.gender === 'male' ? 'bg-blue-500/15 text-blue-400' : 'bg-pink-500/15 text-pink-400'
              }`}>
                <i className={`fas ${u.gender === 'male' ? 'fa-mars' : 'fa-venus'} mr-0.5`}></i>{u.gender === 'male' ? 'M' : 'F'}
              </span>
            )}
            {u.source === 'firebase' && <span className="px-1.5 py-0.5 rounded-md bg-cyan-500/15 text-cyan-400 text-[0.6rem] font-bold" title="Exists in Firebase — shown from the auth accounts"><i className="fas fa-cloud mr-0.5"></i>Firebase</span>}
            {u.githubLogin && <a href={`https://github.com/${u.githubLogin}`} target="_blank" rel="noopener noreferrer" className="text-dark-text3 hover:text-dark-text hidden sm:inline"><i className="fab fa-github text-[0.7rem]"></i></a>}
            {(isAdmin || isManager) && (
              <button onClick={() => setExpanded(!expanded)} className="ml-auto px-1.5 py-0.5 rounded-lg text-[0.6rem] font-semibold cursor-pointer border bg-dark-bg3 text-dark-text2 border-dark-border hover:text-qsis hover:border-qsis/30 transition-all" title="View profile details">
                <i className={`fas fa-chevron-${expanded ? 'up' : 'down'}`}></i>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Email + Meta */}
      <div className="mt-1.5 ml-[50px] sm:ml-[54px]">
        <p className="text-[0.7rem] sm:text-[0.72rem] text-dark-text3 truncate">{u.email}{u.universityId ? ` (${u.universityId})` : ''}{u.semester ? ` — ${u.semester}` : ''}</p>
        {u.isBanned && u.banReason && (
          <div className="mt-1.5 p-1.5 rounded bg-red-500/10 border border-red-500/20">
            <p className="text-[0.62rem] text-red-400"><i className="fas fa-info-circle mr-1"></i>{u.banReason}</p>
            {u.bannedBy && <p className="text-[0.58rem] text-dark-text3 mt-0.5">Banned by: {u.bannedBy}</p>}
          </div>
        )}
        {u.lastSignIn && <p className="text-[0.6rem] sm:text-[0.62rem] text-dark-text3 mt-0.5"><i className="fas fa-clock mr-0.5"></i>{formatDate(u.lastSignIn)}</p>}
      </div>

      {/* Row 3: Actions */}
      <div className="mt-2 ml-[50px] sm:ml-[54px] flex items-center gap-1.5 flex-wrap">
        {u.githubLogin && <a href={`https://github.com/${u.githubLogin}`} target="_blank" rel="noopener noreferrer" className="sm:hidden text-dark-text3 hover:text-dark-text px-1"><i className="fab fa-github text-[0.7rem]"></i></a>}
        {canToggleCR && (
          <button onClick={() => handleToggleCR(u.email, !!u.isCR)} disabled={actionLoading === u.email + 'cr'}
            className={`px-2 py-1 rounded-lg text-[0.63rem] sm:text-[0.65rem] font-semibold cursor-pointer border transition-all disabled:opacity-50 ${
              u.isCR ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' : 'bg-dark-bg3 text-dark-text2 border-dark-border hover:text-purple-400 hover:border-purple-500/30'
            }`} title={u.isCR ? 'Remove CR' : 'Make CR'}>
            {actionLoading === u.email + 'cr' ? <i className="fas fa-spinner fa-spin"></i> : 'CR'}
          </button>
        )}
        {canToggleACR && (
          <button onClick={() => handleToggleACR(u.email, !!u.isACR)} disabled={actionLoading === u.email + 'acr'}
            className={`px-2 py-1 rounded-lg text-[0.63rem] sm:text-[0.65rem] font-semibold cursor-pointer border transition-all disabled:opacity-50 ${
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
              { value: 'student', label: 'Student', icon: 'fa-user-graduate' },
              { value: 'teacher', label: 'Teacher', icon: 'fa-chalkboard-teacher' },
              ...(isAdmin ? [{ value: 'manager', label: 'Manager', icon: 'fa-user-shield' }] : []),
              ...(isSuperAdmin ? [{ value: 'admin', label: 'Admin', icon: 'fa-crown' }] : []),
              ...(isAdmin ? customRoles.map(r => ({ value: r.key, label: r.label, icon: r.icon })) : []),
            ]}
            className="min-w-[90px] sm:min-w-[120px]"
          />
        )}
        {canPromoteManager && (
          <button onClick={() => handleToggleManager(u.email, uRole)} disabled={actionLoading === u.email + 'manager'}
            className={`px-2 py-1 rounded-lg text-[0.63rem] sm:text-[0.65rem] font-semibold cursor-pointer border transition-all disabled:opacity-50 ${
              uRole === 'manager' ? 'bg-orange-500/20 text-orange-300 border-orange-500/30' : 'bg-dark-bg3 text-dark-text2 border-dark-border hover:text-orange-400 hover:border-orange-500/30'
            }`} title={uRole === 'manager' ? 'Remove Manager' : 'Make Manager'}>
            {actionLoading === u.email + 'manager' ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-user-shield"></i>}
          </button>
        )}
        {canBan && (
          u.isBanned ? (
            <button onClick={() => handleBan(u.email, true)} disabled={actionLoading === u.email + 'unban'}
              className="px-2 sm:px-2.5 py-1 rounded-lg bg-green-500/15 text-green-400 text-[0.65rem] sm:text-[0.68rem] font-semibold cursor-pointer hover:bg-green-500/25 border border-green-500/20 disabled:opacity-50">
              {actionLoading === u.email + 'unban' ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-check mr-0.5"></i><span className="hidden xs:inline">Un</span>Unban</>}
            </button>
          ) : (
            <button onClick={() => handleBan(u.email, false)} disabled={actionLoading === u.email + 'ban'}
              className="px-2 sm:px-2.5 py-1 rounded-lg bg-red-500/15 text-red-400 text-[0.65rem] sm:text-[0.68rem] font-semibold cursor-pointer hover:bg-red-500/25 border border-red-500/20 disabled:opacity-50">
              {actionLoading === u.email + 'ban' ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-ban mr-0.5"></i>Ban</>}
            </button>
          )
        )}
        {canEmail && handleEmail && (
          <button onClick={() => handleEmail(u)} disabled={actionLoading === u.email + 'email'}
            className="px-2 sm:px-2.5 py-1 rounded-lg bg-cyan-500/10 text-cyan-400 text-[0.65rem] sm:text-[0.68rem] font-semibold cursor-pointer hover:bg-cyan-500/20 border border-cyan-500/20 disabled:opacity-50"
            title="Open email composer: themed message asking for their university ID and suggesting university-email login">
            {actionLoading === u.email + 'email' ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-envelope mr-0.5"></i>Email</>}
          </button>
        )}
        {isAdmin && !isSelf && !isOwnerUser && handleLinkEmail && (
          <button onClick={() => handleLinkEmail(u)} disabled={actionLoading === u.email + 'link'}
            className="px-2 sm:px-2.5 py-1 rounded-lg bg-teal-500/10 text-teal-400 text-[0.65rem] sm:text-[0.68rem] font-semibold cursor-pointer hover:bg-teal-500/20 border border-teal-500/20 disabled:opacity-50"
            title="Link a personal email to this profile (e.g. when the user's university email no longer works)">
            {actionLoading === u.email + 'link' ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-link mr-0.5"></i>Link Email</>}
          </button>
        )}
        {isPendingRow && u.accountStatus === 'pending' && handleApprove && (isAdmin || canApprovePending) && (
          <button onClick={() => handleApprove(u.email)} disabled={actionLoading === u.email + 'approve'}
            className="px-2 sm:px-2.5 py-1 rounded-lg bg-green-500/15 text-green-400 text-[0.65rem] sm:text-[0.68rem] font-semibold cursor-pointer hover:bg-green-500/25 border border-green-500/20 disabled:opacity-50">
            {actionLoading === u.email + 'approve' ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-check mr-0.5"></i>Approve</>}
          </button>
        )}
        {isPendingRow && handleReject && (isAdmin || canApprovePending) && (
          <button onClick={() => handleReject(u.email)} disabled={actionLoading === u.email + 'reject'}
            className="px-2 sm:px-2.5 py-1 rounded-lg bg-red-500/15 text-red-400 text-[0.65rem] sm:text-[0.68rem] font-semibold cursor-pointer hover:bg-red-500/25 border border-red-500/20 disabled:opacity-50">
            {actionLoading === u.email + 'reject' ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-times mr-0.5"></i>Reject</>}
          </button>
        )}
        {canSendToPending && handleSendToPending && (
          <button onClick={() => handleSendToPending(u.email)} disabled={actionLoading === u.email + 'pending'}
            className="px-2 sm:px-2.5 py-1 rounded-lg bg-yellow-500/15 text-yellow-400 text-[0.65rem] sm:text-[0.68rem] font-semibold cursor-pointer hover:bg-yellow-500/25 border border-yellow-500/20 disabled:opacity-50"
            title="Remove access — moves this external account back to pending approval">
            {actionLoading === u.email + 'pending' ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-clock mr-0.5"></i>Pending</>}
          </button>
        )}
        {isAdmin && !isSelf && !isOwnerUser && handleDeleteUser && (
          <button onClick={() => handleDeleteUser(u.email)} disabled={actionLoading === u.email + 'delete'}
            className="px-2 sm:px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 text-[0.65rem] sm:text-[0.68rem] font-semibold cursor-pointer hover:bg-red-500/20 border border-red-500/20 disabled:opacity-50"
            title="Delete user from Firebase and database">
            {actionLoading === u.email + 'delete' ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-trash mr-0.5"></i>Delete</>}
          </button>
        )}
      </div>
      {/* Expanded Profile Details */}
      {(isAdmin || isManager) && expanded && (
        <div className="mt-3 pt-3 border-t border-dark-border">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {u.name && <InfoField label="Full Name" value={u.name} />}
            {u.universityId && <InfoField label="University ID" value={u.universityId} />}
            {u.whatsapp && <InfoField label="WhatsApp / Telegram" value={u.whatsapp} />}
            {u.gender && <InfoField label="Gender" value={u.gender === 'male' ? 'Male' : 'Female'} icon={u.gender === 'male' ? 'fas fa-mars' : 'fas fa-venus'} />}
            {u.semester && <InfoField label="Semester" value={u.semester} />}
            {u.department && <InfoField label="Department" value={u.department} />}
            {u.batch && <InfoField label="Batch" value={u.batch} />}
            {u.telegramId && <InfoField label="Telegram" value={u.telegramId} icon="fab fa-telegram" />}
            {u.telegramChatId && <InfoField label="Telegram Chat" value={u.telegramChatId} icon="fa-comments" />}
            {u.batchId && <InfoField label="Batch ID" value={String(u.batchId)} />}
            {u.githubLogin && <InfoField label="GitHub" value={u.githubLogin} icon="fab fa-github" link={`https://github.com/${u.githubLogin}`} />}
            {u.email && <InfoField label="Email" value={u.email} icon="fa-envelope" />}
            {u.website && <InfoField label="Website" value={u.website} icon="fas fa-globe" link={u.website} />}
            {u.facebook && <InfoField label="Facebook" value={u.facebook} icon="fab fa-facebook" link={u.facebook} />}
            {u.twitter && <InfoField label="Twitter / X" value={u.twitter} icon="fab fa-twitter" link={u.twitter} />}
            {u.linkedin && <InfoField label="LinkedIn" value={u.linkedin} icon="fab fa-linkedin" link={u.linkedin} />}
            {u.company && <InfoField label="Company" value={u.company} icon="fas fa-briefcase" link={u.companyUrl || undefined} />}
            {u.lastSignIn && <InfoField label="Last Sign In" value={formatDate(u.lastSignIn)} icon="fa-clock" />}
            {u.createdAt && <InfoField label="Created" value={formatDate(u.createdAt)} icon="fa-calendar" />}
            {u.customPermissions && Object.keys(u.customPermissions).length > 0 && (
              <div className="col-span-full">
                <p className="text-[0.6rem] text-dark-text3 uppercase tracking-wider mb-1">Custom Permissions</p>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(u.customPermissions).filter(([,v]) => v).map(([k]) => (
                    <span key={k} className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[0.55rem] font-mono">{k}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
