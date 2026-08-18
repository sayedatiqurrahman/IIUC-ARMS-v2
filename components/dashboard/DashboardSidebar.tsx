'use client';

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
  isTeacherUser: boolean;
  profile: any;
  unreadCount?: number;
  mobileOpen?: boolean;
  onClose?: () => void;
  adminItems?: { id: string; label: string; icon: string; color?: string }[];
  activeAdminTab?: string;
  onAdminNavigate?: (tab: string) => void;
}

const baseMenu: MenuItem[] = [
  { id: 'overview', label: 'Overview', icon: 'fas fa-th-large' },
  { id: 'profile', label: 'Edit Profile', icon: 'fas fa-user-edit' },
  { id: 'activity', label: 'My Activity', icon: 'fas fa-history' },
  { id: 'github', label: 'Connections', icon: 'fas fa-link' },
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

export default function DashboardSidebar({
  activeSection, onNavigate, effectiveRole, isCR, hasAdminAccess, isTeacherUser, profile, unreadCount,
  mobileOpen, onClose, adminItems = [], activeAdminTab = '', onAdminNavigate,
}: DashboardSidebarProps) {
  const isStudent = effectiveRole === 'student';

  const menuItems: MenuItem[] = [
    ...baseMenu,
    ...(isStudent ? studentMenu : []),
    ...(isCR ? crMenu : []),
    ...(isTeacherUser ? teacherMenu : []),
  ];

  const itemClass = (active: boolean) =>
    active
      ? 'bg-qsis/10 text-qsis border border-qsis/20'
      : 'text-dark-text2 hover:text-dark-text hover:bg-dark-bg3 border border-transparent';

  const navContent = (
    <nav className="space-y-0.5">
      {menuItems.map(item => (
        <button
          key={item.id}
          onClick={() => { onNavigate(item.id); onClose?.(); }}
          className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[0.8rem] font-medium transition-all text-left ${itemClass(activeSection === item.id)}`}
        >
          <i className={`${item.icon} ${item.color || ''} w-4 text-center`}></i>
          <span className="flex-1">{item.label}</span>
          {item.id === 'activity' && unreadCount ? (
            <span className="px-1.5 py-0.5 rounded-full bg-qsis/20 text-qsis text-[0.6rem]">{unreadCount}</span>
          ) : null}
        </button>
      ))}
    </nav>
  );

  const adminGroup = adminItems.length > 0 ? (
    <div className="mt-4">
      <div className="mb-2 px-2">
        <p className="text-[0.65rem] text-dark-text3 uppercase tracking-wider font-semibold flex items-center gap-1.5">
          <i className="fas fa-shield-alt text-qsis"></i>Admin
        </p>
      </div>
      <nav className="space-y-0.5">
        {adminItems.map(item => (
          <button
            key={item.id}
            onClick={() => { onAdminNavigate?.(item.id); onClose?.(); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[0.8rem] font-medium transition-all text-left ${itemClass(activeAdminTab === item.id && activeSection === 'admin-panel')}`}
          >
            <i className={`fas ${item.icon} ${item.color || ''} w-4 text-center`}></i>
            <span className="flex-1">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  ) : null;

  const roleBadge = (
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
  );

  return (
    <div className="w-full md:w-56 flex-shrink-0">
      {/* Mobile: slide-in drawer opened by the hamburger in the dashboard header */}
      <div className={`md:hidden fixed inset-0 z-[95] ${mobileOpen ? '' : 'invisible pointer-events-none'}`}>
        <div
          className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${mobileOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={onClose}
        ></div>
        <div className={`absolute top-0 left-0 bottom-0 w-64 max-w-[80vw] bg-dark-bg2 border-r border-dark-border p-3 flex flex-col shadow-2xl transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex items-center justify-between px-2 pb-3 mb-2 border-b border-dark-border">
            <div>
              <p className="text-[0.82rem] font-bold text-dark-text flex items-center gap-2"><i className="fas fa-th-large text-qsis"></i>Dashboard</p>
              <p className="text-[0.62rem] text-dark-text3 mt-0.5">Menu</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-dark-bg3 flex items-center justify-center text-dark-text2 border-none cursor-pointer">
              <i className="fas fa-times text-sm"></i>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {navContent}
            {adminGroup}
          </div>
          {roleBadge}
        </div>
      </div>

      {/* Desktop: vertical sidebar */}
      <div className="hidden md:block bg-dark-bg2 border border-dark-border rounded-2xl p-3 sticky top-20">
        <div className="mb-3 px-2">
          <p className="text-[0.65rem] text-dark-text3 uppercase tracking-wider font-semibold">Dashboard</p>
        </div>
        {navContent}
        {adminGroup}
        {roleBadge}
      </div>
    </div>
  );
}
