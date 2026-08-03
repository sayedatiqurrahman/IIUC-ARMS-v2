'use client';

import { type UserRecord, type ActivityLog, type AdminStats } from './types';

function getRoleBadge(role: string | null) {
  switch (role) {
    case 'admin': return <span className="px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 text-[0.65rem] font-semibold">Admin</span>;
    case 'manager': return <span className="px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 text-[0.65rem] font-semibold">Manager</span>;
    case 'teacher': return <span className="px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 text-[0.65rem] font-semibold">Teacher</span>;
    case 'student': return <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 text-[0.65rem] font-semibold">Student</span>;
    case 'external': return <span className="px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 text-[0.65rem] font-semibold"><i className="fas fa-globe mr-0.5"></i>External</span>;
    default: return <span className="px-2 py-0.5 rounded-full bg-gray-500/15 text-gray-400 text-[0.65rem] font-semibold">User</span>;
  }
}

function formatDate(d: string) {
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatAction(action: string) {
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
}

interface OverviewTabProps {
  stats: AdminStats;
  activities: ActivityLog[];
  overviewFacultyCount: number;
  recentLogins: UserRecord[];
  setActiveTab: (tab: any) => void;
  setUserSubTab: (tab: any) => void;
}

export default function OverviewTab({
  stats,
  activities,
  overviewFacultyCount,
  recentLogins,
  setActiveTab,
  setUserSubTab,
}: OverviewTabProps) {
  return (
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
          { label: 'Managers', value: stats.managers || 0, icon: 'fa-user-shield', color: 'text-orange-400' },
          { label: 'External', value: (stats as any).external || 0, icon: 'fa-globe', color: 'text-purple-400' },
          { label: 'Banned', value: stats.banned, icon: 'fa-ban', color: 'text-red-400' },
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
  );
}
