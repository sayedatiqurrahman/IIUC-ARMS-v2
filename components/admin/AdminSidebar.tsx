'use client';

import { useState } from 'react';
import { type Tab } from './types';

interface AdminSidebarProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  isAdmin: boolean;
  isManager: boolean;
  isOwner: boolean;
  effectiveRole: string;
  profileIsCR?: boolean;
  canManageFacultyDepts?: boolean;
}

export default function AdminSidebar({
  activeTab,
  setActiveTab,
  isAdmin,
  isManager,
  isOwner,
  effectiveRole,
  profileIsCR,
  canManageFacultyDepts,
}: AdminSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  const btn = (tab: Tab, icon: string, color: string, label: string) => (
    <button
      onClick={() => setActiveTab(tab)}
      title={collapsed ? label : undefined}
      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[0.8rem] font-medium transition-all cursor-pointer border-none text-left ${
        activeTab === tab
          ? 'bg-qsis text-white shadow-lg shadow-qsis/20'
          : 'text-dark-text2 hover:text-dark-text hover:bg-dark-bg3'
      }`}
    >
      <i className={`fas ${icon} w-5 text-center text-[0.85rem] ${activeTab === tab ? 'text-white' : color}`}></i>
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
    </button>
  );

  const section = (title: string, children: React.ReactNode) => (
    <div className="mb-1">
      {!collapsed && (
        <p className="text-[0.6rem] uppercase tracking-wider text-dark-text3 px-3 mb-1.5 font-semibold">{title}</p>
      )}
      {collapsed && <div className="mx-3 mb-1.5 border-t border-dark-border"></div>}
      <div className="space-y-0.5">{children}</div>
    </div>
  );

  return (
    <div className={`${collapsed ? 'w-[60px]' : 'w-56'} flex-shrink-0 transition-all duration-300 hidden md:block`}>
      <div className="bg-dark-bg2 border border-dark-border rounded-2xl sticky top-20 overflow-hidden">
        {/* Header */}
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-3 py-3 border-b border-dark-border`}>
          {!collapsed && (
            <span className="text-[0.7rem] uppercase tracking-wider text-dark-text3 font-bold">Admin</span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-7 h-7 rounded-lg bg-dark-bg3 border border-dark-border flex items-center justify-center text-dark-text2 hover:text-qsis hover:border-qsis/30 transition-all cursor-pointer"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <i className={`fas ${collapsed ? 'fa-angles-right' : 'fa-angles-left'} text-[0.65rem]`}></i>
          </button>
        </div>

        {/* Nav */}
        <nav className="p-2 max-h-[calc(100vh-180px)] overflow-y-auto scrollbar-thin">
          {(isAdmin || isManager) && section('Overview', btn('overview', 'fa-chart-pie', 'text-qsis', 'Overview'))}

          {(isAdmin || isManager) && section('Users', btn('users', 'fa-users', 'text-blue-400', 'All Users'))}

          {isAdmin || isManager || canManageFacultyDepts ? section('Academic', (
            <>
              {(isAdmin || isManager) && btn('faculty', 'fa-chalkboard-teacher', 'text-teal-400', 'Faculty Members')}
              {canManageFacultyDepts && btn('facultyDept', 'fa-building', 'text-purple-400', 'Faculties & Depts')}
            </>
          )) : null}

          {(isAdmin || isManager || effectiveRole === 'teacher' || !!profileIsCR) && section('Content', (
            <>
              {(isAdmin || isManager || effectiveRole === 'teacher' || !!profileIsCR) && btn('courses', 'fa-book', 'text-indigo-400', 'Courses')}
              {(isAdmin || isManager || effectiveRole === 'teacher') && btn('rooms', 'fa-door-open', 'text-cyan-400', 'Rooms')}
              {(isAdmin || isManager || effectiveRole === 'teacher' || !!profileIsCR) && btn('batches', 'fa-layer-group', 'text-purple-400', 'Batches')}
            </>
          ))}

          {isAdmin && section('System', (
            <>
              {btn('permissions', 'fa-key', 'text-amber-400', 'Permissions')}
              {btn('contributors', 'fa-users', 'text-teal-400', 'Contributors')}
            </>
          ))}

          {(isAdmin || isManager || isOwner) && section('Other', (
            <>
              {isOwner && btn('telegram', 'fa-paper-plane', 'text-cyan-400', 'Telegram')}
              {(isAdmin || isManager) && btn('activity', 'fa-history', 'text-yellow-400', 'Activity Log')}
            </>
          ))}
        </nav>
      </div>
    </div>
  );
}
