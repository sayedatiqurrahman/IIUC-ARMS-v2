export interface UserRecord {
  email: string;
  name: string;
  role: string | null;
  title?: string;
  isBanned?: boolean;
  banReason?: string | null;
  bannedBy?: string | null;
  isCR?: boolean;
  isACR?: boolean;
  githubLogin?: string;
  githubAvatar?: string;
  image?: string;
  universityId?: string;
  semester?: string;
  section?: string;
  lastSignIn?: string;
  department?: string;
  batch?: string;
  phone?: string;
  telegramId?: string;
  telegramChatId?: string;
  batchId?: number;
  providers?: string[];
  hasProfile?: boolean;
  customPermissions?: Record<string, boolean>;
  createdAt?: string;
  accountStatus?: string;
}

export interface ActivityLog {
  id: string;
  action: string;
  details: string;
  userId: string;
  userName: string | null;
  createdAt: string;
}

export interface AdminStats {
  total: number;
  admins: number;
  managers: number;
  teachers: number;
  students: number;
  users: number;
  banned: number;
  githubConnected: number;
}

export type Tab = 'overview' | 'users' | 'activity' | 'faculty' | 'facultyDept' | 'courses' | 'permissions' | 'rooms' | 'batches' | 'telegram' | 'contributors';
export type UserSubTab = 'all' | 'admin' | 'manager' | 'teacher' | 'student' | 'external' | 'pending';

export interface ContributorSettings {
  hiddenLogins: string[];
  sortBy: 'contributions' | 'name' | 'commits' | 'prs';
  viewMode: 'sectioned' | 'grid';
  sectionCount: 2 | 3;
  showRanks: boolean;
  showStats: boolean;
  showDeptFilter: boolean;
  showSearch: boolean;
  showOnlyCommitters: boolean;
  allowUserToggle: boolean;
}

export interface ContributorItem {
  login: string;
  name: string;
  title: string;
  avatar_url: string;
  html_url: string;
  contributions: number;
  v2Contributions: number;
  dataContributions: number;
  issueContributions: number;
  prCount: number;
  role: string;
  roleType: string;
  department: string;
  source: string;
}
