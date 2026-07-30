import { create } from 'zustand';
import { config, UserRole } from './config';
import { FACULTIES, getFacultyIdForDepartment, getAllFacultyIds } from './departments';
import { extractYear } from './utils';
import { getOnboardingData, setOnboardingData as saveOnboarding, clearOnboardingData as clearOnboardingStorage, type OnboardingData } from '@/components/OnboardingModal';

/* ─── types ─── */
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

import { getRawUrl, getMimeFromExt } from './utils';

function detectCategory(name: string) {
  const l = name.toLowerCase();
  if (config.relatedKitabsCategories[l]) return l;
  if (l === 'sheet') return 'sheet';
  if (l === 'notes' || l === 'note') return 'notes';
  if (l === 'previous questions' || l.includes('previous question')) return 'questions';
  if (l === 'syllabus') return 'syllabus';
  if (l === 'related sources' || l === 'related-sources') return 'related-sources';
  return 'other';
}

const COURSE_FOLDER_RE = /^([A-Z]{2,5}-\d{3,4})\s*-\s*(.+)$/i;
const LEGACY_CODE_RE = /^([A-Z]{2,5})-?(\d{3,4})$/i;
const SHEET_CODE_RE = /^([A-Z]{2,5})-?(\d{3,4})/i;

function matchCourseFolder(name: string): { code: string; title: string } | null {
  const m = name.match(COURSE_FOLDER_RE);
  return m ? { code: m[1].toUpperCase(), title: m[2].trim() } : null;
}

function detectMidFinalFromPath(path: string): string | null {
  const l = path.toLowerCase();
  if (l.includes('/mid/') || l.includes('mid ') || l.endsWith('/mid') || l.includes('mid-term') || l.includes('midterm') || l.includes('mid question') || l.includes('মিড')) return 'Mid';
  if (l.includes('/final/') || l.includes('final ') || l.endsWith('/final') || l.includes('final-term') || l.includes('finalterm') || l.includes('final exam') || l.includes('final note') || l.includes('ফাইনাল')) return 'Final';
  return null;
}

interface ParsedFile {
  code: string;
  title: string;
  category: string;
  midFinal: string | null;
  subPath: string[];
}

function parseCourseFilePath(rel: string): ParsedFile | null {
  const parts = rel.split('/');
  const last = parts[parts.length - 1];
  if (last === '.gitkeep' || last.toLowerCase() === 'readme.md') return null;

  const first = parts[0];

  // ONLY handle proper course folder structure: CODE - Title/...
  const courseMatch = matchCourseFolder(first);
  if (!courseMatch) return null;

  let midFinal = null;
  let catIdx = 1;

  // Check if parts[1] is Mid/Final
  if (parts.length > 2) {
    const mf1 = detectMidFinalFromPath('/' + parts[1] + '/');
    if (mf1) { midFinal = mf1; catIdx = 2; }
  }

  const catFolder = parts[catIdx];
  if (!catFolder) return null;

  return {
    code: courseMatch.code,
    title: courseMatch.title,
    category: detectCategory(catFolder),
    midFinal,
    subPath: parts.slice(catIdx + 1),
  };
}

function getPdfPageKey(filePath: string) {
  return 'pdf-page-' + filePath;
}

/*
  GitHub folder structure (after prefix strip):
    {semester}/{category_folder}/{course_name}/{file}

  Example:
    1st-semister/sheet/SomeCourse/notes.pdf
    parts[0] = '1st-semister'
    parts[1] = 'sheet'
    parts[2] = 'SomeCourse'
    parts[3] = 'notes.pdf'

  getUploadTree() strips 'upload_academic_files/' so paths are relative.
  We only count blobs (files), never trees (directories).
*/

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
}

const defaultProfile: Profile = {
  universityId: '', name: '', title: '', shortForm: '', department: '', section: '', isCR: false, isACR: false, email: '', whatsapp: '', semester: '', image: '',
  role: 'user',
  isBanned: false,
  githubLogin: '', githubToken: '', githubInstallationId: '', githubAvatar: '',
  facebook: '', twitter: '', linkedin: '', website: '',
  company: '', companyUrl: '', publicEmail: '',
  hideWhatsapp: false, hideUniversityId: false, hideSemester: false, hideEmail: false,
};

/* ─── store ─── */
interface AppState {
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
  addCourse: (dept: string, sem: string, code: string, title: string) => Promise<{ success: boolean; error?: string }>;
  editCourse: (id: string, title: string) => Promise<{ success: boolean; error?: string }>;
  deleteCourse: (id: string) => Promise<{ success: boolean; error?: string }>;

  routineData: any[];
  routineLoading: boolean;

  profile: Profile;
  updateProfile: (p: Partial<Profile>) => Promise<void>;
  loadProfile: () => Promise<void>;
  githubToken: string;
  setGithubToken: (token: string) => void;

  loadTree: (token?: string) => Promise<void>;

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
  getSemesterCourses: (semId: string, departmentId?: string | null) => { code: string; title: string; categories: { key: string; label: string; icon: string; count: number }[]; totalFiles: number; hasMidFinal: boolean }[];
  getCourseCategories: (semId: string, courseCode: string, departmentId?: string | null, midFinal?: string | null) => { key: string; label: string; icon: string; count: number; files: any[] }[];
  getCourseMidFinal: (semId: string, courseCode: string, departmentId?: string | null) => { mid: number; final: number; root: number };
  getCategories: (semId: string, departmentId?: string | null) => Category[];
  getCourses: (semId: string, catKey: string, departmentId?: string | null) => [string, any[]][];
  getSearchResults: (query: string, typeFilter: string, yearFilter: string, semFilter: string, departmentId?: string | null) => { files: any[]; folders: any[] };
}

export const useAppStore = create<AppState>((set, get) => ({
  tree: [],
  loading: true,
  error: '',

  view: 'departments',
  currentDept: '',
  currentSem: '',
  currentCat: '',
  currentCourseCode: '',
  currentCourseTitle: '',
  currentMidFinal: '',
  breadcrumbs: [],

  searchQuery: '',
  fileTypeFilter: '',
  searchSemester: '',
  searchYear: '',

  viewerOpen: false,
  viewerItem: null,

  uploadOpen: false,
  recentReads: [],

  onboardingData: typeof window !== 'undefined' ? getOnboardingData() : null,
  setOnboardingData: (data) => {
    saveOnboarding(data);
    set({ onboardingData: data });
  },
  loadOnboarding: () => {
    set({ onboardingData: getOnboardingData() });
  },
  clearOnboarding: () => {
    clearOnboardingStorage();
    set({ onboardingData: null });
  },

  imgZoom: 100,
  imgRotation: 0,

  contributors: [],
  contributorsLoading: false,

  dbCourses: [],
  loadCourses: async () => {
    try {
      const res = await fetch('/api/courses');
      const data = await res.json();
      if (data.success) set({ dbCourses: data.courses });
    } catch {}
  },
  addCourse: async (dept, sem, code, title) => {
    try {
      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ department: dept, semester: sem, code, title }),
      });
      const data = await res.json();
      if (data.success) {
        set(s => ({ dbCourses: [...s.dbCourses, data.course] }));
        return { success: true };
      }
      return { success: false, error: data.error || 'Failed' };
    } catch { return { success: false, error: 'Network error' }; }
  },
  editCourse: async (id, title) => {
    try {
      const res = await fetch('/api/courses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, title }),
      });
      const data = await res.json();
      if (data.success) {
        set(s => ({ dbCourses: s.dbCourses.map(c => c.id === id ? { ...c, title } : c) }));
        return { success: true };
      }
      return { success: false, error: data.error || 'Failed' };
    } catch { return { success: false, error: 'Network error' }; }
  },
  deleteCourse: async (id) => {
    try {
      const res = await fetch(`/api/courses?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        set(s => ({ dbCourses: s.dbCourses.filter(c => c.id !== id) }));
        return { success: true };
      }
      return { success: false, error: data.error || 'Failed' };
    } catch { return { success: false, error: 'Network error' }; }
  },

  routineData: [],
  routineLoading: false,

  profile: { ...defaultProfile },
  loadProfile: async () => {
    try {
      const res = await fetch('/api/profile');
      if (res.ok) {
        const data = await res.json();
        const email = data.email || '';
        const emailRole = email ? config.detectRole(email) : 'user';
        // DB role overrides email-based role (admin set someone as manager via admin panel)
        const role = data.role && data.role !== 'user' ? data.role : emailRole;
        const updates: Record<string, any> = { profile: { ...defaultProfile, ...data, role } };
        if (data.githubToken) updates.githubToken = data.githubToken;
        if (data.githubInstallationId) updates.githubInstallationId = data.githubInstallationId;
        if (data.githubLogin) updates.githubLogin = data.githubLogin;
        if (data.githubAvatar) updates.githubAvatar = data.githubAvatar;
        set(updates);
      } else {
        const err = await res.json().catch(() => ({ error: res.statusText }));
      }
    } catch {
    }
  },
  updateProfile: async (p) => {
    const current = get().profile;
    const snapshot = { ...current };
    const updated = { ...current, ...p };
    set({ profile: updated });
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (res.ok) {
        const data = await res.json();
        set({ profile: { ...defaultProfile, ...data } });
      } else {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        set({ profile: snapshot });
        if (typeof window !== 'undefined') {
          const { showToast } = await import('@/lib/utils');
          showToast(`Failed to save: ${err.error || 'Unknown error'}`, 'error');
        }
      }
    } catch {
      set({ profile: snapshot });
    }
  },

  githubToken: '',
  setGithubToken: (token: string) => set({ githubToken: token }),

  loadTree: async (token?: string) => {
    set({ loading: true, error: '' });
    try {
      const headers: Record<string, string> = {};
      if (token) headers['x-auth-token'] = token;
      const res = await fetch(`/api/github?_t=${Date.now()}`, { headers });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const filtered = (data.tree || []).filter((item: any) => {
        const parts = item.path.split('/');
        const fileName = parts[parts.length - 1];
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        if (item.type === 'blob') {
          if (['README.md', 'LICENSE'].includes(fileName)) return false;
          if (['js', 'json', 'yml', 'yaml', 'css', 'html', 'md', 'lock'].includes(ext)) return false;
          if (!config.academicExtensions.includes(ext) && fileName !== '.gitkeep') return false;
        }
        return true;
      });
      set({ tree: filtered });
    } catch (err: any) {
      set({ error: err.message || 'Failed to load files' });
    }
    set({ loading: false });
  },

  navigateToDepartment: (deptId) => {
    const dept = (() => {
      for (const f of FACULTIES) {
        const d = f.departments.find(dd => dd.id === deptId);
        if (d) return d;
      }
      return null;
    })();
    set({
      currentDept: deptId,
      currentSem: '',
      currentCat: '',
      currentCourseCode: '',
      currentCourseTitle: '',
      view: 'semesters',
      breadcrumbs: [
        { label: 'Departments', icon: 'fa-building', onClick: () => get().goHome() },
        { label: dept?.shortName || deptId, icon: dept?.icon },
      ],
    });
  },

  navigateToSemester: (semId) => {
    const { currentDept } = get();
    const isRelated = semId === config.relatedKitabsFolder;
    const isSources = semId === config.relatedSourcesFolder;
    let label: string;
    if (isRelated) label = 'Related Kitabs';
    else if (isSources) label = 'Related Sources';
    else label = semId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    const dept = (() => {
      if (!currentDept) return null;
      for (const f of FACULTIES) {
        const d = f.departments.find(dd => dd.id === currentDept);
        if (d) return d;
      }
      return null;
    })();

    set({
      currentSem: semId,
      currentCat: '',
      currentCourseCode: '',
      currentCourseTitle: '',
      view: 'courses',
      breadcrumbs: [
        { label: 'Departments', icon: 'fa-building', onClick: () => get().goHome() },
        ...(dept ? [{ label: dept.shortName, icon: dept.icon, onClick: () => get().navigateToDepartment(currentDept) }] : []),
        { label, icon: 'fa-calendar' },
      ],
    });
  },

  navigateToCategory: (catKey) => {
    const { breadcrumbs } = get();
    const catConfig = config.categories[catKey as keyof typeof config.categories];

    set({
      currentCat: catKey,
      view: 'files',
      breadcrumbs: [
        ...breadcrumbs,
        { label: catConfig?.label || catKey, icon: 'fa-folder' },
      ],
    });
  },

  navigateToCourse: (courseCode, courseTitle) => {
    const { breadcrumbs } = get();
    const label = courseTitle ? `${courseCode} - ${courseTitle}` : courseCode;
    set({
      currentCourseCode: courseCode,
      currentCourseTitle: courseTitle,
      currentMidFinal: '',
      view: 'categories',
      breadcrumbs: [
        ...breadcrumbs,
        { label, icon: 'fa-book' },
      ],
    });
  },

  navigateToMidFinal: (midFinal) => {
    const { breadcrumbs } = get();
    set({
      currentMidFinal: midFinal,
      view: 'categories',
      breadcrumbs: [
        ...breadcrumbs,
        { label: midFinal, icon: 'fa-folder' },
      ],
    });
  },

  navigateToHistory: () => {
    set({
      view: 'history',
      breadcrumbs: [
        { label: 'Home', onClick: () => get().goHome() },
        { label: 'History' },
      ],
    });
    get().loadRecentReads();
  },

  navigateToContributors: () => {
    set({
      view: 'contributors',
      breadcrumbs: [
        { label: 'Home', onClick: () => get().goHome() },
        { label: 'Contributors' },
      ],
    });
    get().loadContributors();
  },

  navigateToRoutine: () => {
    set({
      view: 'routine',
      breadcrumbs: [
        { label: 'Home', onClick: () => get().goHome() },
        { label: 'Routine' },
      ],
    });
    get().loadRoutine();
  },

  navigateToDashboard: () => {
    set({
      view: 'dashboard',
      breadcrumbs: [
        { label: 'Home', onClick: () => get().goHome() },
        { label: 'Dashboard' },
      ],
    });
  },

  goBack: () => {
    const { view, currentDept, currentSem, currentCourseCode, currentCourseTitle, currentMidFinal, breadcrumbs } = get();
    if (view === 'files') {
      get().navigateToCourse(currentCourseCode, currentCourseTitle);
    } else if (view === 'categories' && currentMidFinal) {
      set({
        currentMidFinal: '',
        breadcrumbs: breadcrumbs.slice(0, -1),
      });
    } else if (view === 'categories') {
      get().navigateToSemester(currentSem);
    } else if (view === 'courses') {
      if (currentDept) {
        get().navigateToDepartment(currentDept);
      } else {
        get().goHome();
      }
    } else if (view === 'semesters') {
      get().goHome();
    } else {
      get().goHome();
    }
  },

  goHome: () => {
    set({
      view: 'departments',
      currentDept: '',
      currentSem: '',
      currentCat: '',
      currentCourseCode: '',
      currentCourseTitle: '',
      currentMidFinal: '',
      breadcrumbs: [],
      searchQuery: '',
      fileTypeFilter: '',
      searchSemester: '',
      searchYear: '',
    });
    get().loadRecentReads();
  },

  setSearchQuery: (q) => set({ searchQuery: q }),
  setFileTypeFilter: (f) => set({ fileTypeFilter: f }),
  setSearchSemester: (s) => set({ searchSemester: s }),
  setSearchYear: (y) => set({ searchYear: y }),
  resetFilters: () => set({ searchQuery: '', fileTypeFilter: '', searchSemester: '', searchYear: '' }),

  openFile: (item) => {
    const ext = item.path.split('/').pop()?.split('.').pop()?.toLowerCase() || '';
    const mime = getMimeFromExt(ext);
    const githubPath = item.githubPath || (item.department ? item.department + '/' + item.path : item.path);
    const rawUrl = getRawUrl(item.path, githubPath);
    const viewerItem: ViewerItem = {
      path: item.path,
      name: item.path.split('/').pop() || '',
      mimeType: mime,
      rawUrl,
    };
    set({ viewerItem, viewerOpen: true });
    get().addHistory(viewerItem);
    if (mime === 'pdf') {
      try {
        localStorage.setItem('qsis_viewer_state', JSON.stringify({ ...viewerItem, savedAt: Date.now() }));
      } catch {}
    }
  },

  openRecentFile: (item) => {
    set({ viewerItem: item, viewerOpen: true });
    get().addHistory(item);
    if (item.mimeType === 'pdf') {
      try {
        localStorage.setItem('qsis_viewer_state', JSON.stringify({ ...item, savedAt: Date.now() }));
      } catch {}
    }
  },

  closeViewer: () => {
    set({ viewerOpen: false, viewerItem: null });
    try { localStorage.removeItem('qsis_viewer_state'); } catch {}
    if (typeof document !== 'undefined' && document.fullscreenElement) document.exitFullscreen();
  },

  setUploadOpen: (open) => set({ uploadOpen: open }),

  loadRecentReads: () => {
    try {
      const raw = localStorage.getItem('qsis_history');
      const items = raw ? JSON.parse(raw) : [];
      set({ recentReads: items.slice(0, 7) });
    } catch { set({ recentReads: [] }); }
  },

  addHistory: (item) => {
    try {
      let items = JSON.parse(localStorage.getItem('qsis_history') || '[]');
      items = items.filter((i: any) => i.path !== item.path);
      items.unshift({ ...item, lastRead: Date.now() });
      if (items.length > 50) items = items.slice(0, 50);
      localStorage.setItem('qsis_history', JSON.stringify(items));
      get().loadRecentReads();
    } catch {}
  },

  setImgZoom: (z) => set({ imgZoom: z }),
  setImgRotation: (r) => set({ imgRotation: r }),
  resetImageViewer: () => set({ imgZoom: 100, imgRotation: 0 }),

  loadContributors: async () => {
    set({ contributorsLoading: true });
    try {
      const res = await fetch('/api/contributors');
      if (res.ok) {
        const data = await res.json();
        set({ contributors: data });
      } else {
        set({ contributors: [] });
      }
    } catch {
      set({ contributors: [] });
    }
    set({ contributorsLoading: false });
  },

  loadRoutine: async () => {
    set({ routineLoading: true });
    try {
      const res = await fetch('/routine.json');
      if (res.ok) {
        const data = await res.json();
        set({ routineData: data });
      } else {
        set({ routineData: [] });
      }
    } catch {
      set({ routineData: [] });
    }
    set({ routineLoading: false });
  },

  /* ────────────────────────────────────────────────────────────────
     COMPUTED HELPERS
     New structure: upload_academic_files / {dept} / {sem} / {cat_folder} / {course} / {file}
     Legacy (old QSIS): upload_academic_files / {sem} / {cat_folder} / {course} / {file}
     related-kitabs: upload_academic_files / related-kitabs / ...
     After getUploadTree strips prefix, each item gets a `department` field.
     ──────────────────────────────────────────────────────────────── */

  getUploadTree: () => {
    const { tree } = get();
    const facultyIds = getAllFacultyIds();
    return tree
      .filter((item) => item.path.startsWith(config.uploadPath + '/'))
      .map((item) => {
        const rel = item.path.substring(config.uploadPath.length + 1);
        const parts = rel.split('/');
        const first = parts[0];

        // shariah/related-kitabs/* → department: 'shariah', isRelatedKitabs: true
        if (first === config.relatedKitabsParent && parts[1] === config.relatedKitabsFolder) {
          const inner = parts.slice(2).join('/');
          return { ...item, path: config.relatedKitabsFolder + '/' + inner, department: 'shariah', githubPath: rel };
        }

        // Root related-kitabs/* (legacy) → treat as shariah
        if (first === config.relatedKitabsFolder) {
          return { ...item, path: rel, department: 'shariah', githubPath: rel };
        }

        // Faculty-level related-sources: {faculty-id}/related-sources/* → department: faculty-id
        if (facultyIds.includes(first) && parts[1] === config.relatedSourcesFolder) {
          const inner = parts.slice(2).join('/');
          return { ...item, path: config.relatedSourcesFolder + '/' + inner, department: first, githubPath: rel };
        }

        // {dept}/{sem}/{cat}/{course}/{file} or {dept}/related-sources/{file} (legacy per-dept)
        if (config.isDepartmentId(first)) {
          const inner = parts.slice(1).join('/');
          return { ...item, path: inner || rel, department: first, githubPath: rel };
        }

        // Legacy: {sem}/{cat}/{course}/{file} → 'qsis'
        return { ...item, path: rel, department: 'qsis', githubPath: rel };
      });
  },

  // Get all departments — always shows every department even if 0 files
  getUploadDepartments: () => {
    const uploadTree = get().getUploadTree();
    const depts = new Map<string, { files: number; semesters: Set<string> }>();

    // Initialize all departments from FACULTIES so they always appear
    for (const faculty of FACULTIES) {
      for (const dept of faculty.departments) {
        depts.set(dept.id, { files: 0, semesters: new Set() });
      }
    }

    uploadTree.forEach((item: any) => {
      if (!item.department) return;
      const dept = item.department;
      // Only count known department IDs
      if (!depts.has(dept)) return;
      const d = depts.get(dept)!;

      // Only count files inside course folders (not legacy semester-level files)
      if (item.type === 'blob') {
        const parts = item.path.split('/');
        const sem = parts[0];
        const courseFolder = parts[1] || '';
        const isCourseFolder = config.semesters.some(s => s.id === sem) && /^[A-Z]{2,5}-\d{3,4}\s*-\s*.+$/i.test(courseFolder);
        if (isCourseFolder) {
          const fileName = parts[parts.length - 1];
          if (fileName !== '.gitkeep') d.files++;
        }
      }

      const parts = item.path.split('/');
      const sem = parts[0];
      if (sem && config.semesters.some(s => s.id === sem)) d.semesters.add(sem);
    });

    return Array.from(depts.entries()).map(([id, data]) => {
      const found = (() => {
        for (const f of FACULTIES) {
          const dept = f.departments.find(d => d.id === id);
          if (dept) return { faculty: f, department: dept };
        }
        return null;
      })();
      return {
        id,
        name: found?.department.name || id,
        shortName: found?.department.shortName || id.toUpperCase(),
        icon: found?.department.icon || 'fa-building',
        facultyName: found?.faculty.name || '',
        facultyShortName: found?.faculty.shortName || '',
        facultyIcon: found?.faculty.icon || 'fa-graduation-cap',
        files: data.files,
        semesters: data.semesters.size,
      };
    }).sort((a, b) => {
      const aIdx = FACULTIES.findIndex(f => f.departments.some(d => d.id === a.id));
      const bIdx = FACULTIES.findIndex(f => f.departments.some(d => d.id === b.id));
      if (aIdx !== bIdx) return aIdx - bIdx;
      const aFac = FACULTIES[aIdx];
      const bFac = FACULTIES[bIdx];
      const aDeptIdx = aFac?.departments.findIndex(d => d.id === a.id) ?? 0;
      const bDeptIdx = bFac?.departments.findIndex(d => d.id === b.id) ?? 0;
      return aDeptIdx - bDeptIdx;
    });
  },

  getSemesters: (departmentId?: string | null) => {
    const uploadTree = get().getUploadTree();
    const sems = new Map<string, { files: number; courses: Set<string> }>();

    // Initialize from config so all semesters appear even if empty
    config.semesters.forEach((s) => {
      sems.set(s.id, { files: 0, courses: new Set() });
    });

    const facultyId = departmentId ? getFacultyIdForDepartment(departmentId) : null;

    uploadTree.forEach((item: any) => {
      // Filter: match dept directly, or match faculty (for faculty-level related-sources)
      if (departmentId) {
        const matchesDept = item.department === departmentId;
        const matchesFaculty = facultyId && item.department === facultyId;
        if (!matchesDept && !matchesFaculty) return;
      }

      const parts = item.path.split('/');
      const sem = parts[0];
      if (!sem) return;

      // Related Kitabs
      if (sem === config.relatedKitabsFolder) {
        if (!sems.has(config.relatedKitabsFolder)) sems.set(config.relatedKitabsFolder, { files: 0, courses: new Set() });
        const s = sems.get(config.relatedKitabsFolder)!;
        if (item.type === 'blob') {
          const fileName = parts[parts.length - 1];
          if (fileName !== '.gitkeep') s.files++;
        }
        if (parts.length >= 3 && parts[1]) s.courses.add(parts[1]);
        return;
      }

      // Related Sources
      if (sem === config.relatedSourcesFolder) {
        if (!sems.has(config.relatedSourcesFolder)) sems.set(config.relatedSourcesFolder, { files: 0, courses: new Set() });
        const s = sems.get(config.relatedSourcesFolder)!;
        if (item.type === 'blob') {
          const fileName = parts[parts.length - 1];
          if (fileName !== '.gitkeep') s.files++;
        }
        if (parts.length >= 3 && parts[1]) s.courses.add(parts[1]);
        return;
      }

      // Skip invalid semester IDs — only accept config semesters, related kitabs, or related sources
      if (!config.semesters.some(ss => ss.id === sem) && sem !== config.relatedKitabsFolder && sem !== config.relatedSourcesFolder) return;

      if (!sems.has(sem)) sems.set(sem, { files: 0, courses: new Set() });
      const s = sems.get(sem)!;

      // Detect course from new structure: {sem}/{CODE} - {Title}/... (works for both blobs and trees)
      const second = parts[1] || '';
      const dashMatch = second.match(/^([A-Z]{2,5}-\d{3,4})\s*-\s*(.+)$/i);
      if (dashMatch) {
        s.courses.add(dashMatch[1].toUpperCase());
        // Only count files inside course folders (not legacy semester-level files)
        if (item.type === 'blob') {
          const fileName = parts[parts.length - 1];
          if (fileName !== '.gitkeep') s.files++;
        }
      }
    });

    const isShariahDept = !departmentId || departmentId === 'shariah' || ['qsis', 'dawah', 'hadith'].includes(departmentId || '');

    return Array.from(sems.entries())
      .map(([id, data]) => {
        const cfg = config.semesters.find(s => s.id === id);
        const isRelated = id === config.relatedKitabsFolder;
        const isSources = id === config.relatedSourcesFolder;
        let label: string;
        if (isRelated) label = 'Related Kitabs';
        else if (isSources) label = 'Related Sources';
        else label = cfg?.label || id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        return { id, label, files: data.files, courses: data.courses.size, isRelated, isSources };
      })
      .filter((s) => {
        // When viewing a department, always show all 8 semesters (even 0 files)
        if (departmentId) {
          if (s.isRelated && !isShariahDept) return false;
          if (s.isSources && isShariahDept) return false;
          return true;
        }
        // No department selected: only show semesters with files
        if (s.files === 0) return false;
        if (s.isRelated && !isShariahDept) return false;
        if (s.isSources && isShariahDept) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.isRelated) return 1;
        if (b.isRelated) return -1;
        if (a.isSources) return 1;
        if (b.isSources) return -1;
        return a.id.localeCompare(b.id);
      });
  },

  getCategories: (semId, departmentId?: string | null) => {
    const uploadTree = get().getUploadTree();
    const isRelated = semId === config.relatedKitabsFolder;
    const isSources = semId === config.relatedSourcesFolder;
    const prefix = semId + '/';
    const folderCounts: Record<string, number> = {};
    const knownFolders = new Set<string>();
    const facultyId = departmentId ? getFacultyIdForDepartment(departmentId) : null;

    // Check if this semester uses new course-based structure
    let hasCourseFolders = false;

    uploadTree.forEach((item: any) => {
      if (departmentId) {
        const matchesDept = item.department === departmentId;
        const matchesFaculty = facultyId && item.department === facultyId;
        if (!matchesDept && !matchesFaculty) return;
      }

      if (!item.path.startsWith(prefix)) return;
      const rel = item.path.substring(prefix.length);
      const parts = rel.split('/');
      if (parts.length < 2) return;

      const firstFolder = parts[1];
      const dashMatch = firstFolder.match(/^([A-Z]{2,5}-\d{3,4})\s*-\s*(.+)$/i);

      if (dashMatch) {
        hasCourseFolders = true;
      const third = parts[2];
      const isMidFinal = third === 'Mid' || third === 'Final';
      const catFolder = isMidFinal ? parts[3] : third;
        if (catFolder && catFolder !== '.gitkeep') {
          knownFolders.add(catFolder);
          if (item.type === 'blob') {
            const fileName = item.path.split('/').pop();
            if (fileName !== '.gitkeep') {
              folderCounts[catFolder] = (folderCounts[catFolder] || 0) + 1;
            }
          }
        }
      } else {
        const catFolder = firstFolder;
        if (catFolder) {
          knownFolders.add(catFolder);
          if (item.type === 'blob') {
            const fileName = item.path.split('/').pop();
            if (fileName !== '.gitkeep') {
              folderCounts[catFolder] = (folderCounts[catFolder] || 0) + 1;
            }
          }
        }
      }
    });

    const catEntries: Category[] = [];
    knownFolders.forEach((folderName) => {
      const count = folderCounts[folderName] || 0;
      const cat = detectCategory(folderName);
      const existing = catEntries.find((e) => e.cat === cat);
      if (existing) {
        existing.count += count;
        if (!existing.folders.includes(folderName)) existing.folders.push(folderName);
      } else {
        catEntries.push({ cat, count, folders: [folderName] });
      }
    });

    if (isRelated) {
      return catEntries.map(entry => {
        const catCfg = config.relatedKitabsCategories[entry.cat];
        return {
          ...entry,
          label: catCfg?.label || entry.cat,
          icon: catCfg?.icon || 'folder',
          color: catCfg?.color || '#94a3b8',
        };
      });
    }

    if (isSources) {
      return catEntries.map(entry => ({
        ...entry,
        label: 'Related Sources',
        icon: 'book',
        color: '#0ea5e9',
      }));
    }

    return catEntries;
  },

  getCourses: (semId, catKey, departmentId?) => {
    const uploadTree = get().getUploadTree();
    const categories = get().getCategories(semId, departmentId);
    const catEntry = categories.find((c) => c.cat === catKey);
    if (!catEntry || catEntry.folders.length === 0) return [];

    const catFolders = new Set(catEntry.folders);
    const prefix = semId + '/';
    const courses = new Map<string, any[]>();
    const facultyId = departmentId ? getFacultyIdForDepartment(departmentId) : null;

    uploadTree.forEach((item: any) => {
      if (item.type !== 'blob') return;
      const fileName = item.path.split('/').pop();
      if (fileName === '.gitkeep') return;
      if (departmentId) {
        const matchesDept = item.department === departmentId;
        const matchesFaculty = facultyId && item.department === facultyId;
        if (!matchesDept && !matchesFaculty) return;
      }
      if (!item.path.startsWith(prefix)) return;
      const rel = item.path.substring(prefix.length);
      const parts = rel.split('/');
      if (parts.length < 3) return;

      const firstFolder = parts[1];
      const dashMatch = firstFolder.match(/^([A-Z]{2,5}-\d{3,4})\s*-\s*(.+)$/i);
      if (!dashMatch) return;

      const courseName = dashMatch[1].toUpperCase();
      const third = parts[2];
      const isMidFinal = third === 'Mid' || third === 'Final';
      const catFolder = isMidFinal ? parts[3] : third;

      if (!catFolders.has(catFolder)) return;
      if (!courseName) return;

      if (!courses.has(courseName)) courses.set(courseName, []);
      courses.get(courseName)!.push(item);
    });

    return Array.from(courses.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  },

  getSemesterCourses: (semId, departmentId?) => {
    const uploadTree = get().getUploadTree();
    const prefix = semId + '/';
    const courseMap = new Map<string, { title: string; categories: Map<string, number>; totalFiles: number; midCount: number; finalCount: number; rootCount: number }>();
    const facultyId = departmentId ? getFacultyIdForDepartment(departmentId) : null;

    // First pass: detect courses from folder structure (tree items)
    uploadTree.forEach((item: any) => {
      if (departmentId) {
        const matchesDept = item.department === departmentId;
        const matchesFaculty = facultyId && item.department === facultyId;
        if (!matchesDept && !matchesFaculty) return;
      }
      if (!item.path.startsWith(prefix)) return;
      const rel = item.path.substring(prefix.length);
      const parts = rel.split('/');

      // Detect course folder: CODE - Title
      const first = parts[0] || '';
      const dashMatch = first.match(/^([A-Z]{2,5}-\d{3,4})\s*-\s*(.+)$/i);
      if (dashMatch) {
        const code = dashMatch[1].toUpperCase();
        const title = dashMatch[2].trim();
        if (!courseMap.has(code)) {
          courseMap.set(code, { title, categories: new Map(), totalFiles: 0, midCount: 0, finalCount: 0, rootCount: 0 });
        } else {
          const c = courseMap.get(code)!;
          if (title !== code && c.title === code) c.title = title;
        }
      }
    });

    // Second pass: count files and categories (blobs only)
    uploadTree.forEach((item: any) => {
      if (item.type !== 'blob') return;
      const fileName = item.path.split('/').pop();
      if (fileName === '.gitkeep') return;
      if (departmentId) {
        const matchesDept = item.department === departmentId;
        const matchesFaculty = facultyId && item.department === facultyId;
        if (!matchesDept && !matchesFaculty) return;
      }
      if (!item.path.startsWith(prefix)) return;
      const rel = item.path.substring(prefix.length);

      const parsed = parseCourseFilePath(rel);
      if (!parsed) return;

      const { code, title, category, midFinal } = parsed;

      if (!courseMap.has(code)) {
        courseMap.set(code, { title: code, categories: new Map(), totalFiles: 0, midCount: 0, finalCount: 0, rootCount: 0 });
      }
      const c = courseMap.get(code)!;
      if (title !== code && c.title === code) c.title = title;
      c.totalFiles++;
      if (midFinal === 'Mid') c.midCount++;
      else if (midFinal === 'Final') c.finalCount++;
      else c.rootCount++;

      c.categories.set(category, (c.categories.get(category) || 0) + 1);
    });

    return Array.from(courseMap.entries())
      .map(([code, data]) => ({
        code,
        title: data.title,
        categories: Array.from(data.categories.entries()).map(([key, count]) => ({
          key,
          label: config.categories[key as keyof typeof config.categories]?.label || key,
          icon: config.categories[key as keyof typeof config.categories]?.icon || 'folder',
          count,
        })),
        totalFiles: data.totalFiles,
        hasMidFinal: data.midCount > 0 || data.finalCount > 0,
      }))
      .sort((a, b) => a.code.localeCompare(b.code));
  },

  getCourseCategories: (semId, courseCode, departmentId?, midFinal?: string | null) => {
    const uploadTree = get().getUploadTree();
    const prefix = semId + '/';
    const code = courseCode.toUpperCase();
    const catMap = new Map<string, { files: any[] }>();
    const folderSet = new Set<string>(); // track which category folders exist
    const facultyId = departmentId ? getFacultyIdForDepartment(departmentId) : null;

    // First pass: detect categories from folder structure (tree items)
    uploadTree.forEach((item: any) => {
      if (departmentId) {
        const matchesDept = item.department === departmentId;
        const matchesFaculty = facultyId && item.department === facultyId;
        if (!matchesDept && !matchesFaculty) return;
      }
      if (!item.path.startsWith(prefix)) return;
      const rel = item.path.substring(prefix.length);
      const parts = rel.split('/');
      const first = parts[0] || '';
      const dashMatch = first.match(/^([A-Z]{2,5}-\d{3,4})\s*-\s*(.+)$/i);
      if (!dashMatch || dashMatch[1].toUpperCase() !== code) return;

      // parts[1] = Mid/Final or category folder
      // parts[2] = category folder (if under Mid/Final)
      let mf: string | null = null;
      let catFolder: string | null = null;

      if (parts.length >= 2) {
        const mfCheck = parts[1];
        if (mfCheck === 'Mid' || mfCheck === 'Final') {
          mf = mfCheck;
          catFolder = parts[2] || null;
        } else {
          catFolder = mfCheck;
        }
      }

      if (catFolder && catFolder !== '.gitkeep') {
        const catKey = detectCategory(catFolder);
        const folderKey = `${mf || ''}/${catKey}`;
        folderSet.add(folderKey);
      }
    });

    // Second pass: count files (blobs only, skip .gitkeep)
    uploadTree.forEach((item: any) => {
      if (item.type !== 'blob') return;
      const fileName = item.path.split('/').pop();
      if (fileName === '.gitkeep') return;
      if (departmentId) {
        const matchesDept = item.department === departmentId;
        const matchesFaculty = facultyId && item.department === facultyId;
        if (!matchesDept && !matchesFaculty) return;
      }
      if (!item.path.startsWith(prefix)) return;
      const rel = item.path.substring(prefix.length);

      const parsed = parseCourseFilePath(rel);
      if (!parsed || parsed.code !== code) return;

      if (midFinal) {
        if (parsed.midFinal !== midFinal) return;
        if (!parsed.midFinal) return;
      } else {
        if (parsed.midFinal) return;
      }

      if (!catMap.has(parsed.category)) catMap.set(parsed.category, { files: [] });
      catMap.get(parsed.category)!.files.push(item);
    });

    // When no midFinal, add Mid and Final as virtual categories
    if (!midFinal) {
      let midCount = 0;
      let finalCount = 0;
      uploadTree.forEach((item: any) => {
        if (item.type !== 'blob') return;
        const fileName = item.path.split('/').pop();
        if (fileName === '.gitkeep') return;
        if (departmentId) {
          const matchesDept = item.department === departmentId;
          const matchesFaculty = facultyId && item.department === facultyId;
          if (!matchesDept && !matchesFaculty) return;
        }
        if (!item.path.startsWith(prefix)) return;
        const rel = item.path.substring(prefix.length);
        const parsed = parseCourseFilePath(rel);
        if (!parsed || parsed.code !== code) return;
        if (parsed.midFinal === 'Mid') midCount++;
        else if (parsed.midFinal === 'Final') finalCount++;
      });

      // Also detect Mid/Final from folder structure
      const hasMidFolder = folderSet.has('Mid/notes') || folderSet.has('Mid/questions') || folderSet.has('Mid/sheet') || folderSet.has('Mid/syllabus') || folderSet.has('Mid/other');
      const hasFinalFolder = folderSet.has('Final/notes') || folderSet.has('Final/questions') || folderSet.has('Final/sheet') || folderSet.has('Final/syllabus') || folderSet.has('Final/other');

      const virtualCats: { key: string; label: string; icon: string; count: number; files: any[] }[] = [];
      if (midCount > 0 || hasMidFolder) virtualCats.push({ key: '_mid', label: 'Mid', icon: 'fa-pen-fancy', count: midCount, files: [] });
      if (finalCount > 0 || hasFinalFolder) virtualCats.push({ key: '_final', label: 'Final', icon: 'fa-graduation-cap', count: finalCount, files: [] });

      // Root categories: include from files AND from folder structure
      const rootCatKeys = new Set<string>(Array.from(catMap.keys()));
      Array.from(folderSet).forEach(fk => {
        if (fk.startsWith('Mid/') || fk.startsWith('Final/')) return;
        rootCatKeys.add(fk.replace(/^\//, ''));
      });

      const rootCats = Array.from(rootCatKeys).map(key => ({
        key,
        label: config.categories[key as keyof typeof config.categories]?.label || key,
        icon: config.categories[key as keyof typeof config.categories]?.icon || 'folder',
        count: catMap.get(key)?.files.length || 0,
        files: catMap.get(key)?.files || [],
      }));
      return [...virtualCats, ...rootCats];
    }

    // When midFinal is set, also include categories from folder structure
    const resultCats = Array.from(catMap.entries()).map(([key, data]) => ({
      key,
      label: config.categories[key as keyof typeof config.categories]?.label || key,
      icon: config.categories[key as keyof typeof config.categories]?.icon || 'folder',
      count: data.files.length,
      files: data.files,
    }));

    // Add folders that exist but have no files yet
    const resultKeys = new Set(resultCats.map(c => c.key));
    Array.from(folderSet).forEach(fk => {
      if (!fk.startsWith(midFinal + '/')) return;
      const catKey = fk.split('/')[1];
      if (catKey && !resultKeys.has(catKey)) {
        resultCats.push({
          key: catKey,
          label: config.categories[catKey as keyof typeof config.categories]?.label || catKey,
          icon: config.categories[catKey as keyof typeof config.categories]?.icon || 'folder',
          count: 0,
          files: [],
        });
      }
    });

    return resultCats;
  },

  getCourseMidFinal: (semId, courseCode, departmentId?) => {
    const uploadTree = get().getUploadTree();
    const prefix = semId + '/';
    const code = courseCode.toUpperCase();
    const result = { mid: 0, final: 0, root: 0 };
    const facultyId = departmentId ? getFacultyIdForDepartment(departmentId) : null;

    uploadTree.forEach((item: any) => {
      if (item.type !== 'blob') return;
      const fileName = item.path.split('/').pop();
      if (fileName === '.gitkeep') return;
      if (departmentId) {
        const matchesDept = item.department === departmentId;
        const matchesFaculty = facultyId && item.department === facultyId;
        if (!matchesDept && !matchesFaculty) return;
      }
      if (!item.path.startsWith(prefix)) return;
      const rel = item.path.substring(prefix.length);

      const parsed = parseCourseFilePath(rel);
      if (!parsed || parsed.code !== code) return;

      if (parsed.midFinal === 'Mid') result.mid++;
      else if (parsed.midFinal === 'Final') result.final++;
      else result.root++;
    });

    // Also detect Mid/Final from folder structure (tree items)
    uploadTree.forEach((item: any) => {
      if (item.type === 'blob') return; // only tree items
      if (departmentId) {
        const matchesDept = item.department === departmentId;
        const matchesFaculty = facultyId && item.department === facultyId;
        if (!matchesDept && !matchesFaculty) return;
      }
      if (!item.path.startsWith(prefix)) return;
      const rel = item.path.substring(prefix.length);
      const parts = rel.split('/');
      const first = parts[0] || '';
      const dashMatch = first.match(/^([A-Z]{2,5}-\d{3,4})\s*-\s*(.+)$/i);
      if (!dashMatch || dashMatch[1].toUpperCase() !== code) return;
    });

    return result;
  },

  getSearchResults: (query, typeFilter, yearFilter, semFilter, departmentId?) => {
    const uploadTree = get().getUploadTree();
    const q = query.toLowerCase().trim();
    if (!q && !typeFilter && !yearFilter && !semFilter) return { files: [], folders: [] };

    const matchedFiles: any[] = [];
    const matchedFolders = new Map<string, { id: string; label: string; type: string; path: string; count: number }>();

    const COURSE_RE = /^([A-Z]{2,5}-\d{3,4})\s*-\s*(.+)$/i;

    uploadTree.forEach((item: any) => {
      if (item.type !== 'blob') return;
      if (departmentId && item.department !== departmentId && item.department !== null) return;
      const parts = item.path.split('/');
      const sem = parts[0];
      const fileName = parts[parts.length - 1] || '';
      if (fileName === '.gitkeep') return;
      const ext = fileName.split('.').pop()?.toLowerCase() || '';

      // Detect folder structure: new (CODE - Title) vs legacy
      let catFolder = '';
      let courseName = '';
      const second = parts[1] || '';
      const courseMatch = second.match(COURSE_RE);
      if (courseMatch) {
        // New format: {sem}/{CODE - Title}/{category}/{...}
        courseName = second;
        catFolder = parts[2] || '';
      } else {
        // Legacy format: {sem}/{category}/{course}/{...}
        catFolder = second;
        courseName = parts[2] || '';
      }

      // Semester filter
      if (semFilter && sem !== semFilter) return;

      // File type filter
      if (typeFilter && getMimeFromExt(ext) !== typeFilter) return;

      // Year filter
      if (yearFilter && extractYear(fileName) !== yearFilter) return;

      // Search query match
      if (q) {
        const semLabel = config.semesters.find(s => s.id === sem)?.label || sem.replace(/-/g, ' ');
        const catCfg = config.categories[catFolder as keyof typeof config.categories];
        const catLabel = catCfg?.label || catFolder;
        const matchFileName = fileName.toLowerCase().includes(q);
        const matchCourse = courseName.toLowerCase().includes(q);
        const matchCat = catLabel.toLowerCase().includes(q);
        const matchSem = semLabel.toLowerCase().includes(q);
        const matchCatFolder = catFolder.toLowerCase().includes(q);
        if (!matchFileName && !matchCourse && !matchCat && !matchSem && !matchCatFolder) return;
      }

      matchedFiles.push({ ...item, sem, catFolder, courseName, fileName });

      // Track matched folders
      const semKey = `sem:${sem}`;
      if (!matchedFolders.has(semKey)) {
        const semCfg = config.semesters.find(s => s.id === sem);
        matchedFolders.set(semKey, { id: sem, label: semCfg?.label || sem.replace(/-/g, ' '), type: 'semester', path: sem, count: 0 });
      }
      matchedFolders.get(semKey)!.count++;

      if (catFolder) {
        const catKey = `cat:${sem}/${catFolder}`;
        if (!matchedFolders.has(catKey)) {
          const catCfg = config.categories[catFolder as keyof typeof config.categories];
          matchedFolders.set(catKey, { id: catFolder, label: catCfg?.label || catFolder, type: 'category', path: `${sem}/${catFolder}`, count: 0 });
        }
        matchedFolders.get(catKey)!.count++;
      }

      if (courseName) {
        const courseKey = `course:${sem}/${catFolder}/${courseName}`;
        if (!matchedFolders.has(courseKey)) {
          matchedFolders.set(courseKey, { id: courseName, label: courseName, type: 'course', path: `${sem}/${catFolder}/${courseName}`, count: 0 });
        }
        matchedFolders.get(courseKey)!.count++;
      }
    });

    return { files: matchedFiles, folders: Array.from(matchedFolders.values()) };
  },
}));

/* ─── localStorage helpers (used by PdfViewer, not in store) ─── */
export function savePdfPage(filePath: string, pageNum: number) {
  if (!filePath || !pageNum) return;
  try {
    localStorage.setItem(getPdfPageKey(filePath), String(pageNum));
  } catch {}
}

export function getSavedPdfPage(filePath: string) {
  if (!filePath) return 1;
  try {
    return parseInt(localStorage.getItem(getPdfPageKey(filePath)) || '1') || 1;
  } catch {
    return 1;
  }
}
