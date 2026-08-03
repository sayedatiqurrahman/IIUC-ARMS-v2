'use client';

import { type ActivityLog } from './types';

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

function formatDate(d: string) {
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

interface ActivityLogTabProps {
  activities: ActivityLog[];
}

export default function ActivityLogTab({ activities }: ActivityLogTabProps) {
  return (
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
  );
}
