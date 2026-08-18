import { ContributorSettings } from './types';

export const ALL_ROLES = [
  { key: 'admin', label: 'Admin', icon: 'fa-crown', color: 'text-red-400' },
  { key: 'manager', label: 'Manager', icon: 'fa-user-shield', color: 'text-orange-400' },
  { key: 'teacher', label: 'Teacher', icon: 'fa-chalkboard-teacher', color: 'text-green-400' },
  { key: 'cr', label: 'CR', icon: 'fa-user-check', color: 'text-blue-400' },
  { key: 'student', label: 'Student', icon: 'fa-user-graduate', color: 'text-cyan-400' },
  { key: 'user', label: 'User', icon: 'fa-user', color: 'text-dark-text2' },
];

export const PERMISSION_GROUPS = [
  {
    key: 'courses',
    label: 'Course Management',
    icon: 'fa-book',
    color: 'text-indigo-400',
    actions: [
      { key: 'addCourse', label: 'Add Course', desc: 'Create new course codes', icon: 'fa-book-medical', color: 'text-indigo-400' },
      { key: 'addToAnySemester', label: 'Add to Any Semester', desc: 'Add courses & files to any semester', icon: 'fa-calendar-plus', color: 'text-purple-400' },
      { key: 'editCourse', label: 'Edit Course', desc: 'Edit course titles', icon: 'fa-edit', color: 'text-blue-400' },
      { key: 'deleteCourse', label: 'Delete Course', desc: 'Remove courses', icon: 'fa-trash', color: 'text-red-400' },
      { key: 'saveCourseToGitHub', label: 'Save to GitHub', desc: 'Push courses to repo', icon: 'fab fa-github', color: 'text-purple-400' },
    ],
  },
  {
    key: 'files',
    label: 'File Management',
    icon: 'fa-folder',
    color: 'text-green-400',
    actions: [
      { key: 'uploadFile', label: 'Upload Files', desc: 'Upload notes, sheets, questions', icon: 'fa-cloud-upload-alt', color: 'text-green-400' },
      { key: 'uploadAnySemester', label: 'Upload Any Semester', desc: 'Upload to any semester in own department', icon: 'fa-calendar-arrow-up', color: 'text-emerald-400' },
      { key: 'uploadAnyDepartment', label: 'Upload Any Dept', desc: 'Upload to any department, any semester', icon: 'fa-globe', color: 'text-teal-400' },
      { key: 'createFolder', label: 'Create Folders', desc: 'Create new folders in browse view', icon: 'fa-folder-plus', color: 'text-green-400' },
      { key: 'requireGithubForUpload', label: 'Require GitHub for Upload', desc: 'Uploads require a connected GitHub account', icon: 'fab fa-github', color: 'text-purple-400' },
      { key: 'moveFile', label: 'Move Files', desc: 'Move files & folders', icon: 'fa-arrows-alt', color: 'text-cyan-400' },
      { key: 'copyFile', label: 'Copy Files', desc: 'Copy to other locations', icon: 'fa-copy', color: 'text-teal-400' },
      { key: 'renameFile', label: 'Rename Files', desc: 'Rename files & folders', icon: 'fa-i-cursor', color: 'text-amber-400' },
      { key: 'deleteFile', label: 'Delete Files', desc: 'Permanent deletion', icon: 'fa-times-circle', color: 'text-red-500' },
      { key: 'editLinks', label: 'Edit Links', desc: 'Manage shared links', icon: 'fa-link', color: 'text-pink-400' },
    ],
  },
  {
    key: 'routine',
    label: 'Routine & Rooms',
    icon: 'fa-calendar',
    color: 'text-purple-400',
    actions: [
      { key: 'publishRoutine', label: 'Publish Routine', desc: 'Publish class/exam routines', icon: 'fa-calendar-check', color: 'text-purple-400' },
      { key: 'manageRooms', label: 'Manage Rooms', desc: 'Add/edit/delete rooms', icon: 'fa-door-open', color: 'text-cyan-400' },
    ],
  },
  {
    key: 'people',
    label: 'People & Batches',
    icon: 'fa-users',
    color: 'text-orange-400',
    actions: [
      { key: 'manageFaculty', label: 'Manage Faculty', desc: 'Add/edit faculty & staff', icon: 'fa-building', color: 'text-teal-400' },
      { key: 'manageFacultyDepts', label: 'Faculties & Depts', desc: 'Manage faculties & departments', icon: 'fa-school', color: 'text-purple-400' },
      { key: 'manageBatches', label: 'Manage Batches', desc: 'Student batch management', icon: 'fa-layer-group', color: 'text-indigo-400' },
      { key: 'manageUsers', label: 'Manage Users', desc: 'Ban, promote, change roles', icon: 'fa-users-cog', color: 'text-orange-400' },
      { key: 'viewExternalUsers', label: 'View External Users', desc: 'See non-university accounts', icon: 'fa-globe', color: 'text-purple-400' },
    ],
  },
  {
    key: 'notices',
    label: 'Notice Board',
    icon: 'fa-bullhorn',
    color: 'text-amber-400',
    actions: [
      { key: 'publishNotice', label: 'Publish Notices', desc: 'Post notices, calendars, bus schedules', icon: 'fa-bullhorn', color: 'text-amber-400' },
    ],
  },
  {
    key: 'admin',
    label: 'Administration',
    icon: 'fa-cog',
    color: 'text-yellow-400',
    actions: [
      { key: 'manageSettings', label: 'Manage Settings', desc: 'Change site settings', icon: 'fa-cog', color: 'text-yellow-400' },
      { key: 'manageCronJobs', label: 'Manage Cron Jobs', desc: 'View, run & schedule automated tasks', icon: 'fa-clock', color: 'text-orange-400' },
    ],
  },
];

export const ALL_PERMISSION_ACTIONS = PERMISSION_GROUPS.flatMap(g => g.actions);

export const DEFAULT_SETTINGS: ContributorSettings = {
  hiddenLogins: [],
  sortBy: 'contributions',
  viewMode: 'sectioned',
  sectionCount: 3,
  showRanks: true,
  showStats: true,
  showDeptFilter: true,
  showSearch: true,
  showOnlyCommitters: true,
  allowUserToggle: true,
};
