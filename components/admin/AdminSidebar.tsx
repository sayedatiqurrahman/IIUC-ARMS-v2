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
  mobileOpen?: boolean;
  onClose?: () => void;
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
  mobileOpen,
  onClose,
}: AdminSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  const btn = (tab: Tab, icon: string, color: string, label: string, isCollapsed: boolean) => (
    <button
      onClick={() => { setActiveTab(tab); onClose?.(); }}
      title={isCollapsed ? label : undefined}
      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[0.8rem] font-medium transition-all cursor-pointer border-none text-left ${
        activeTab === tab
          ? 'bg-qsis text-white shadow-lg shadow-qsis/20'
          : 'text-dark-text2 hover:text-dark-text hover:bg-dark-bg3'
      }`}
    >
      <i className={`fas ${icon} w-5 text-center text-[0.85rem] ${activeTab === tab ? 'text-white' : color}`}></i>
      {!isCollapsed && <span className="flex-1 truncate">{label}</span>}
    </button>
  );

  const section = (title: string, children: React.ReactNode, isCollapsed: boolean) => (
    <div className="mb-1">
      {!isCollapsed && (
        <p className="text-[0.6rem] uppercase tracking-wider text-dark-text3 px-3 mb-1.5 font-semibold">{title}</p>
      )}
      {isCollapsed && <div className="mx-3 mb-1.5 border-t border-dark-border"></div>}
      <div className="space-y-0.5">{children}</div>
    </div>
  );

  const navContent = (isCollapsed: boolean) => (
    <nav className="p-2 max-h-[calc(100vh-180px)] overflow-y-auto scrollbar-thin">
      {(isAdmin || isManager) && section('Overview', btn('overview', 'fa-chart-pie', 'text-qsis', 'Overview', isCollapsed), isCollapsed)}

      {(isAdmin || isManager) && section('Users', btn('users', 'fa-users', 'text-blue-400', 'All Users', isCollapsed), isCollapsed)}

      {isAdmin || isManager || canManageFacultyDepts ? section('Academic', (
        <>
          {(isAdmin || isManager) && btn('faculty', 'fa-chalkboard-teacher', 'text-teal-400', 'Faculty Members', isCollapsed)}
          {canManageFacultyDepts && btn('facultyDept', 'fa-building', 'text-purple-400', 'Faculties & Depts', isCollapsed)}
        </>
      ), isCollapsed) : null}

      {(isAdmin || isManager || effectiveRole === 'teacher' || !!profileIsCR) && section('Content', (
        <>
          {(isAdmin || isManager || effectiveRole === 'teacher' || !!profileIsCR) && btn('courses', 'fa-book', 'text-indigo-400', 'Courses', isCollapsed)}
          {(isAdmin || isManager || effectiveRole === 'teacher') && btn('rooms', 'fa-door-open', 'text-cyan-400', 'Rooms', isCollapsed)}
          {(isAdmin || isManager || effectiveRole === 'teacher' || !!profileIsCR) && btn('batches', 'fa-layer-group', 'text-purple-400', 'Batches', isCollapsed)}
        </>
      ), isCollapsed)}

      {isAdmin && section('System', (
        <>
          {btn('permissions', 'fa-key', 'text-amber-400', 'Permissions', isCollapsed)}
          {btn('contributors', 'fa-users', 'text-teal-400', 'Contributors', isCollapsed)}
        </>
      ), isCollapsed)}

      {(isAdmin || isManager || isOwner) && section('Other', (
        <>
          {isOwner && btn('telegram', 'fa-paper-plane', 'text-cyan-400', 'Telegram', isCollapsed)}
          {(isAdmin || isManager) && btn('activity', 'fa-history', 'text-yellow-400', 'Activity Log', isCollapsed)}
        </>
      ), isCollapsed)}
    </nav>
  );

  return (
    <>
      {/* Mobile: slide-in drawer opened by the hamburger in the admin header */}
      <div className={`md:hidden fixed inset-0 z-[95] ${mobileOpen ? '' : 'invisible pointer-events-none'}`}>
        <div
          className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${mobileOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={onClose}
        ></div>
        <div className={`absolute top-0 left-0 bottom-0 w-64 max-w-[80vw] bg-dark-bg2 border-r border-dark-border flex flex-col shadow-2xl transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex items-center justify-between px-2 pb-3 mb-2 border-b border-dark-border">
            <div>
              <p className="text-[0.82rem] font-bold text-dark-text flex items-center gap-2"><i className="fas fa-shield-alt text-qsis"></i>Admin Panel</p>
              <p className="text-[0.62rem] text-dark-text3 mt-0.5">Menu</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-dark-bg3 flex items-center justify-center text-dark-text2 border-none cursor-pointer">
              <i className="fas fa-times text-sm"></i>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {navContent(false)}
          </div>
        </div>
      </div>

      {/* Desktop: vertical sidebar */}
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

          {navContent(collapsed)}
        </div>
      </div>
    </>
  );
}
