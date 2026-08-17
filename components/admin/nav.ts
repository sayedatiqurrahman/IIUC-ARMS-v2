import { type Tab } from './types';

/**
 * Single source of truth for admin panel navigation.
 * Used by the standalone admin page sidebar (components/admin/AdminSidebar)
 * and the dashboard's admin menu (components/dashboard/DashboardView), so the
 * tab list and its role/permission gating are never duplicated.
 */

export interface AdminNavContext {
  isAdmin: boolean;
  isManager: boolean;
  isOwner: boolean;
  effectiveRole: string;
  profileIsCR: boolean;
  canManageFacultyDepts: boolean;
  isTeacherUser: boolean;
  hasCoursePerms: boolean;
  has: (action: string) => boolean;
}

export interface AdminNavItem {
  key: Tab;
  label: string;
  icon: string;
  color: string;
  show: (ctx: AdminNavContext) => boolean;
}

export interface AdminNavGroup {
  title: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    title: 'Overview',
    items: [
      { key: 'overview', label: 'Overview', icon: 'fa-chart-pie', color: 'text-qsis', show: ctx => ctx.isAdmin || ctx.isManager },
    ],
  },
  {
    title: 'Users',
    items: [
      { key: 'users', label: 'All Users', icon: 'fa-users', color: 'text-blue-400', show: ctx => ctx.isAdmin || ctx.isManager },
    ],
  },
  {
    title: 'Academic',
    items: [
      { key: 'faculty', label: 'Faculty Members', icon: 'fa-chalkboard-teacher', color: 'text-teal-400', show: ctx => ctx.isAdmin || ctx.isManager || ctx.isTeacherUser || ctx.has('manageFaculty') },
      { key: 'facultyDept', label: 'Faculties & Depts', icon: 'fa-building', color: 'text-purple-400', show: ctx => ctx.canManageFacultyDepts },
    ],
  },
  {
    title: 'Content',
    items: [
      { key: 'courses', label: 'Courses', icon: 'fa-book', color: 'text-indigo-400', show: ctx => ctx.isAdmin || ctx.isManager || ctx.isTeacherUser || ctx.profileIsCR || ctx.hasCoursePerms },
      { key: 'rooms', label: 'Rooms', icon: 'fa-door-open', color: 'text-cyan-400', show: ctx => ctx.isAdmin || ctx.isManager || ctx.isTeacherUser || ctx.has('manageRooms') },
      { key: 'batches', label: 'Batches', icon: 'fa-layer-group', color: 'text-purple-400', show: ctx => ctx.isAdmin || ctx.isManager || ctx.isTeacherUser || ctx.profileIsCR || ctx.has('manageBatches') },
      { key: 'notices', label: 'Notice Board', icon: 'fa-bullhorn', color: 'text-amber-400', show: ctx => ctx.isAdmin || ctx.isManager || ctx.isTeacherUser || ctx.has('publishNotice') },
    ],
  },
  {
    title: 'System',
    items: [
      { key: 'permissions', label: 'Permissions', icon: 'fa-key', color: 'text-amber-400', show: ctx => ctx.isAdmin },
      { key: 'roles', label: 'Roles', icon: 'fa-user-tag', color: 'text-blue-400', show: ctx => ctx.isAdmin },
      { key: 'contributors', label: 'Contributors', icon: 'fa-users', color: 'text-teal-400', show: ctx => ctx.isAdmin },
    ],
  },
  {
    title: 'Other',
    items: [
      { key: 'telegram', label: 'Telegram', icon: 'fa-paper-plane', color: 'text-cyan-400', show: ctx => ctx.isOwner },
      { key: 'activity', label: 'Activity Log', icon: 'fa-history', color: 'text-yellow-400', show: ctx => ctx.isAdmin || ctx.isManager },
    ],
  },
];

export function filterAdminNav(ctx: AdminNavContext): AdminNavGroup[] {
  return ADMIN_NAV_GROUPS
    .map(group => ({ title: group.title, items: group.items.filter(item => item.show(ctx)) }))
    .filter(group => group.items.length > 0);
}
