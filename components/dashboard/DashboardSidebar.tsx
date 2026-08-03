'use client';

import { config } from '@/lib/config';

interface MenuItem {
  id: string;
  label: string;
  icon: string;
  color?: string;
  badge?: string;
  admin?: boolean;
}

interface DashboardSidebarProps {
  activeSection: string;
  onNavigate: (section: string) => void;
  effectiveRole: string;
  isCR: boolean;
  hasAdminAccess: boolean;
  profile: any;
  unreadCount?: number;
}

const baseMenu: MenuItem[] = [
  { id: 'overview', label: 'Overview', icon: 'fas fa-th-large' },
  { id: 'profile', label: 'Edit Profile', icon: 'fas fa-user-edit' },
  { id: 'activity', label: 'My Activity', icon: 'fas fa-history' },
  { id: 'github', label: 'GitHub', icon: 'fab fa-github' },
  { id: 'security', label: 'Security', icon: 'fas fa-shield-alt' },
];

const studentMenu: MenuItem[] = [
  { id: 'batch', label: 'My Batch', icon: 'fas fa-layer-group' },
];

const crMenu: MenuItem[] = [
  { id: 'cr-tools', label: 'CR Tools', icon: 'fas fa-user-tie', color: 'text-qsis' },
];

const teacherMenu: MenuItem[] = [
  { id: 'teacher-info', label: 'Faculty Info', icon: 'fas fa-chalkboard-teacher', color: 'text-teal-400' },
];

const adminMenu: MenuItem[] = [
  { id: 'admin-panel', label: 'Admin Panel', icon: 'fas fa-cog', color: 'text-amber-400', admin: true },
];

export default function DashboardSidebar({
  activeSection, onNavigate, effectiveRole, isCR, hasAdminAccess, profile, unreadCount,
}: DashboardSidebarProps) {
  const isStudent = effectiveRole === 'student';
  const isTeacher = effectiveRole === 'teacher';
  const isExternal = effectiveRole === 'external';

  const menuItems: MenuItem[] = [
    ...baseMenu,
    ...(isStudent ? studentMenu : []),
    ...(isCR ? crMenu : []),
    ...(isTeacher ? teacherMenu : []),
    ...(hasAdminAccess ? adminMenu : []),
  ];

  return (
    <div className="w-full md:w-56 flex-shrink-0">
      {/* Mobile: horizontal scroll */}
      <div className="md:hidden flex gap-1.5 overflow-x-auto pb-2 mb-4 -mx-1 px-1 scrollbar-hide">
        {menuItems.map(item => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[0.75rem] font-semibold whitespace-nowrap transition-all border ${
              activeSection === item.id
                ? 'bg-qsis/10 border-qsis/30 text-qsis'
                : 'bg-dark-bg3 border-dark-border text-dark-text2 hover:text-dark-text hover:border-dark-border'
            }`}
          >
            <i className={`${item.icon} ${item.color || ''}`}></i>
            {item.label}
            {item.id === 'activity' && unreadCount ? (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-qsis/20 text-qsis text-[0.6rem]">{unreadCount}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Desktop: vertical sidebar */}
      <div className="hidden md:block bg-dark-bg2 border border-dark-border rounded-2xl p-3 sticky top-20">
        <div className="mb-3 px-2">
          <p className="text-[0.65rem] text-dark-text3 uppercase tracking-wider font-semibold">Dashboard</p>
        </div>
        <nav className="space-y-0.5">
          {menuItems.map(item => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[0.8rem] font-medium transition-all text-left ${
                activeSection === item.id
                  ? 'bg-qsis/10 text-qsis border border-qsis/20'
                  : 'text-dark-text2 hover:text-dark-text hover:bg-dark-bg3 border border-transparent'
              }`}
            >
              <i className={`${item.icon} ${item.color || ''} w-4 text-center`}></i>
              <span className="flex-1">{item.label}</span>
              {item.id === 'activity' && unreadCount ? (
                <span className="px-1.5 py-0.5 rounded-full bg-qsis/20 text-qsis text-[0.6rem]">{unreadCount}</span>
              ) : null}
              {item.admin && (
                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[0.55rem] font-bold">ADMIN</span>
              )}
            </button>
          ))}
        </nav>

        {/* Role Badge */}
        <div className="mt-4 px-2 pt-3 border-t border-dark-border">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              effectiveRole === 'admin' ? 'bg-red-500' :
              effectiveRole === 'manager' ? 'bg-amber-500' :
              effectiveRole === 'teacher' ? 'bg-teal-500' :
              effectiveRole === 'student' ? 'bg-blue-500' :
              effectiveRole === 'external' ? 'bg-purple-500' : 'bg-gray-500'
            }`}></div>
            <span className="text-[0.7rem] text-dark-text3 capitalize font-medium">{effectiveRole}</span>
            {isCR && <span className="px-1.5 py-0.5 rounded bg-qsis/10 text-qsis text-[0.55rem] font-bold">CR</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
