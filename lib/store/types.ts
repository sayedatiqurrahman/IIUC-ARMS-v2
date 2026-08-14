import type { UserRole } from '../config';
import type { OnboardingData } from '@/lib/onboarding-storage';

export type View = 'departments' | 'semesters' | 'categories' | 'courses' | 'files' | 'history' | 'contributors' | 'routine' | 'dashboard' | 'search';

export interface Breadcrumb {
  label: string;
  icon?: string;
  onClick?: () => void;
}

export interface ViewerItem {
  path: string;
  name: string;
  mimeType: string;
  rawUrl: string;
}

export interface Semester {
  id: string;
  label: string;
  files: number;
  courses: number;
  isRelated?: boolean;
}

export interface Category {
  cat: string;
  count: number;
  folders: string[];
}

export interface Profile {
  universityId: string;
  name: string;
  title: string;
  shortForm: string;
  department: string;
  section: string;
  isCR: boolean;
  isACR: boolean;
  email: string;
  whatsapp: string;
  phone: string;
  telegramId: string;
  telegramChatId: string;
  semester: string;
  image: string;
  role: UserRole;
  isBanned: boolean;
  githubLogin: string;
  githubToken: string;
  githubInstallationId: string;
  githubAvatar: string;
  facebook: string;
  twitter: string;
  linkedin: string;
  website: string;
  company: string;
  companyUrl: string;
  publicEmail: string;
  hideWhatsapp: boolean;
  hideUniversityId: boolean;
  hideSemester: boolean;
  hideEmail: boolean;
  hideCompany: boolean;
  batchId: string;
  session: string;
  customPermissions: Record<string, boolean>;
  linkedEmails: string[];
  showInContributors: boolean;
  profileType: string;
}

export const defaultProfile: Profile = {
  universityId: '', name: '', title: '', shortForm: '', department: '', section: '', isCR: false, isACR: false, email: '', whatsapp: '', phone: '', telegramId: '', telegramChatId: '', semester: '', image: '',
  role: 'user',
  isBanned: false,
  githubLogin: '', githubToken: '', githubInstallationId: '', githubAvatar: '',
  facebook: '', twitter: '', linkedin: '', website: '',
  company: '', companyUrl: '', publicEmail: '',
  batchId: '',
  session: '',
  customPermissions: {},
  linkedEmails: [],
  showInContributors: true,
  profileType: '',
  hideWhatsapp: false, hideUniversityId: false, hideSemester: false, hideEmail: false, hideCompany: false,
};

export interface AppState {
  tree: any[];
  loading: boolean;
  error: string;

  view: View;
  currentDept: string;
  currentSem: string;
  currentCat: string;
  currentCourseCode: string;
  currentCourseTitle: string;
  currentMidFinal: string;
  breadcrumbs: Breadcrumb[];

  searchQuery: string;
  fileTypeFilter: string;
  searchSemester: string;
  searchYear: string;

  viewerOpen: boolean;
  viewerItem: ViewerItem | null;

  uploadOpen: boolean;
  recentReads: any[];

  imgZoom: number;
  imgRotation: number;

  contributors: any[];
  contributorsLoading: boolean;

  dbCourses: { id: string; department: string; semester: string; code: string; title: string; addedBy: string | null }[];
  loadCourses: () => Promise<void>;
  invalidateCoursesCache: () => void;
  addCourse: (dept: string, sem: string, code: string, title: string) => Promise<{ success: boolean; error?: string; alreadyExisted?: boolean; course?: any }>;
  editCourse: (id: string, title: string) => Promise<{ success: boolean; error?: string }>;
  deleteCourse: (id: string) => Promise<{ success: boolean; error?: string }>;

  operationLabel: string;
  setOperationLabel: (label: string) => void;

  routineData: any[];
  routineLoading: boolean;

  profile: Profile;
  profileLoaded: boolean;
  updateProfile: (p: Partial<Profile>) => Promise<void>;
  loadProfile: () => Promise<void>;
  githubToken: string;
  setGithubToken: (token: string) => void;

  loadTree: (token?: string) => Promise<void>;
  invalidateTreeCache: () => void;
  isTreeCacheStale: () => boolean;

  navigateToDepartment: (deptId: string) => void;
  navigateToSemester: (semId: string) => void;
  navigateToCourse: (courseCode: string, courseTitle: string) => void;
  navigateToMidFinal: (midFinal: string) => void;
  navigateToCategory: (catKey: string) => void;
  navigateToHistory: () => void;
  navigateToContributors: () => void;
  navigateToRoutine: () => void;
  navigateToDashboard: () => void;
  goBack: () => void;
  goHome: () => void;

  setSearchQuery: (q: string) => void;
  setFileTypeFilter: (f: string) => void;
  setSearchSemester: (s: string) => void;
  setSearchYear: (y: string) => void;
  resetFilters: () => void;

  openFile: (item: any) => void;
  openRecentFile: (item: any) => void;
  closeViewer: () => void;

  setUploadOpen: (open: boolean) => void;
  loadRecentReads: () => void;
  addHistory: (item: any) => void;

  setImgZoom: (z: number) => void;
  setImgRotation: (r: number) => void;
  resetImageViewer: () => void;

  loadContributors: () => Promise<void>;
  loadRoutine: () => Promise<void>;

  onboardingData: OnboardingData | null;
  setOnboardingData: (data: OnboardingData) => void;
  loadOnboarding: () => void;
  clearOnboarding: () => void;

  getUploadTree: () => any[];
  getUploadDepartments: () => { id: string; name: string; shortName: string; icon: string; facultyName: string; facultyShortName: string; facultyIcon: string; files: number; semesters: number }[];
  getSemesters: (departmentId?: string | null) => Semester[];
  getSemesterCourses: (semId: string, departmentId?: string | null) => { code: string; title: string; folderPath: string; categories: { key: string; label: string; icon: string; count: number }[]; totalFiles: number; hasMidFinal: boolean }[];
  getCourseCategories: (semId: string, courseCode: string, departmentId?: string | null, midFinal?: string | null) => { key: string; label: string; icon: string; count: number; files: any[] }[];
  getCourseMidFinal: (semId: string, courseCode: string, departmentId?: string | null) => { mid: number; final: number; root: number };
  getCategories: (semId: string, departmentId?: string | null) => Category[];
  getCourses: (semId: string, catKey: string, departmentId?: string | null) => [string, any[]][];
  getSearchResults: (query: string, typeFilter: string, yearFilter: string, semFilter: string, departmentId?: string | null) => { files: any[]; folders: any[] };
  getAvailableYears: () => string[];
}
