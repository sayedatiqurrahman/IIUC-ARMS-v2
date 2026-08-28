import { create } from 'zustand';
import { config } from '../config';
import { FACULTIES, resolveDepartmentId } from '../departments';
import { safeJson, getRawUrl, getMimeFromExt } from '../utils';
import { getOnboardingData, setOnboardingData as saveOnboarding, clearOnboardingData as clearOnboardingStorage } from '@/lib/onboarding-storage';
import { defaultProfile } from './types';
import type { AppState, Profile, ViewerItem } from './types';
import { createTreeHelpers } from './tree-helpers';

export type { View, Breadcrumb, ViewerItem, Semester, Category, Profile, AppState } from './types';

const PROFILE_LS_KEY = 'qsis-profile-cache';
const PROFILE_COOKIE = 'qsis_profile_cache';

function readProfileCache(): { profile: Profile; githubToken: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PROFILE_LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.profile) {
        return { profile: { ...defaultProfile, ...parsed.profile }, githubToken: parsed.githubToken || '' };
      }
    }
    const cookieRaw = document.cookie.split('; ').find(c => c.startsWith(`${PROFILE_COOKIE}=`));
    if (cookieRaw) {
      const parsed = JSON.parse(decodeURIComponent(cookieRaw.slice(cookieRaw.indexOf('=') + 1)));
      if (parsed && parsed.profile) {
        return { profile: { ...defaultProfile, ...parsed.profile }, githubToken: '' };
      }
    }
  } catch {}
  return null;
}

function writeProfileCache(profile: Profile, githubToken: string) {
  if (typeof document === 'undefined') return;
  try {
    localStorage.setItem(PROFILE_LS_KEY, JSON.stringify({ profile, githubToken }));
  } catch {}
  try {
    const { githubToken: _ignored, ...meta } = profile;
    document.cookie = `${PROFILE_COOKIE}=${encodeURIComponent(JSON.stringify({ profile: { ...meta, githubToken: '' } }))}; path=/; max-age=2592000; SameSite=Lax`;
  } catch {}
}

function clearProfileCache() {
  if (typeof document === 'undefined') return;
  try { localStorage.removeItem(PROFILE_LS_KEY); } catch {}
  try { document.cookie = `${PROFILE_COOKIE}=; path=/; max-age=0; SameSite=Lax`; } catch {}
}

export const useAppStore = create<AppState>((set, get) => {
  const treeHelpers = createTreeHelpers(get as () => AppState);
  const cached = readProfileCache();

  return {
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
    currentSubPath: '',
    breadcrumbs: [],

    searchQuery: '',
    fileTypeFilter: '',
    searchSemester: '',
    searchYear: '',

    viewerOpen: false,
    viewerItem: null,

    uploadOpen: false,
    uploadBg: null,
    setUploadBg: (partial) => set(s => ({ uploadBg: partial === null ? null : { ...(s.uploadBg ?? { active: false, progress: null, result: null, compressing: null, steps: [] }), ...partial } })),
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
      const COURSES_CACHE_KEY = 'qsis-courses-cache';
      const COURSES_CACHE_TS = 'qsis-courses-cache-ts';
      const COURSES_CACHE_TTL = 5 * 60 * 1000;

      try {
        const cached = localStorage.getItem(COURSES_CACHE_KEY);
        const cachedTs = parseInt(localStorage.getItem(COURSES_CACHE_TS) || '0', 10);
        if (cached && cachedTs && Date.now() - cachedTs < COURSES_CACHE_TTL) {
          set({ dbCourses: JSON.parse(cached) });
          return;
        }
      } catch {}

      try {
        const res = await fetch('/api/courses');
        const data = await res.json();
        if (data.success) {
          try {
            localStorage.setItem(COURSES_CACHE_KEY, JSON.stringify(data.courses));
            localStorage.setItem(COURSES_CACHE_TS, String(Date.now()));
          } catch {}
          set({ dbCourses: data.courses });
        }
      } catch {}
    },
    invalidateCoursesCache: () => {
      try {
        localStorage.removeItem('qsis-courses-cache');
        localStorage.removeItem('qsis-courses-cache-ts');
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
          return { success: true, alreadyExisted: !!data.alreadyExisted, course: data.course };
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
        const res = await fetch(`/api/courses`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
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

    operationLabel: '',
    setOperationLabel: (label) => set({ operationLabel: label }),

    profile: cached?.profile ?? { ...defaultProfile },
    profileLoaded: !!cached,
    loadProfile: async () => {
      try {
        const res = await fetch('/api/profile');
        if (res.ok) {
          const data = await res.json();
          const email = data.email || '';
          const emailRole = email ? config.detectRole(email) : 'user';
          const role = data.role && data.role !== 'user' ? data.role : emailRole;
          const updates: Record<string, any> = { profile: { ...defaultProfile, ...data, role }, profileLoaded: true };
          if (data.githubInstallationId) updates.githubInstallationId = data.githubInstallationId;
          if (data.githubLogin) updates.githubLogin = data.githubLogin;
          if (data.githubAvatar) updates.githubAvatar = data.githubAvatar;
          writeProfileCache(updates.profile, '');
          set(updates);
        } else {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          if (res.status === 401 || res.status === 403) {
            clearProfileCache();
            set({ profile: { ...defaultProfile }, profileLoaded: true, githubToken: '' });
          } else {
            set({ profileLoaded: true });
          }
        }
      } catch {
        set({ profileLoaded: true });
      }
    },
    updateProfile: async (p) => {
      const current = get().profile;
      const snapshot = { ...current };
      const updated = { ...current, ...p };
      set({ profile: updated, profileLoaded: true });
      try {
        const res = await fetch('/api/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated),
        });
        if (res.ok) {
          const data = await res.json();
          const merged = { ...defaultProfile, ...data };
          writeProfileCache(merged, '');
          set({ profile: merged, profileLoaded: true });
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

    githubToken: cached?.githubToken ?? '',
    githubLogin: cached?.profile.githubLogin || '',
    githubInstallationId: cached?.profile.githubInstallationId || '',
    githubAvatar: cached?.profile.githubAvatar || '',
    setGithubToken: (token: string) => set({ githubToken: token }),

    loadTree: async (token?: string) => {
      const TREE_CACHE_KEY = 'qsis-tree-cache';
      const TREE_CACHE_TS = 'qsis-tree-cache-ts';
      // Short TTL so newly uploaded files appear quickly for everyone.
      const TREE_CACHE_TTL = 30 * 1000;

      try {
        const cached = localStorage.getItem(TREE_CACHE_KEY);
        const cachedTs = parseInt(localStorage.getItem(TREE_CACHE_TS) || '0', 10);
        if (cached && cachedTs && Date.now() - cachedTs < TREE_CACHE_TTL) {
          const filtered = JSON.parse(cached);
          set({ tree: filtered, loading: false, error: '' });
          return;
        }
      } catch {}

      set({ loading: true, error: '' });
      try {
        const headers: Record<string, string> = {};
        if (token) headers['x-auth-token'] = token;
        const res = await fetch(`/api/github?_t=${Date.now()}`, { headers });
        const data = await safeJson(res);
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
        try {
          localStorage.setItem(TREE_CACHE_KEY, JSON.stringify(filtered));
          localStorage.setItem(TREE_CACHE_TS, String(Date.now()));
        } catch {}
        set({ tree: filtered });
      } catch (err: any) {
        try {
          const cached = localStorage.getItem(TREE_CACHE_KEY);
          if (cached) {
            set({ tree: JSON.parse(cached), error: err.message || 'Failed to refresh files (showing cached)' });
            return;
          }
        } catch {}
        set({ error: err.message || 'Failed to load files' });
      }
      set({ loading: false });
    },

    invalidateTreeCache: () => {
      try {
        localStorage.removeItem('qsis-tree-cache');
        localStorage.removeItem('qsis-tree-cache-ts');
      } catch {}
    },

    isTreeCacheStale: () => {
      try {
        const cachedTs = parseInt(localStorage.getItem('qsis-tree-cache-ts') || '0', 10);
        return !cachedTs || Date.now() - cachedTs >= 30 * 1000;
      } catch { return true; }
    },

    navigateToDepartment: (deptId) => {
      const canonicalDept = resolveDepartmentId(deptId);
      const dept = (() => {
        for (const f of FACULTIES) {
          const d = f.departments.find(dd => dd.id === canonicalDept);
          if (d) return d;
        }
        return null;
      })();
      set({
        currentDept: canonicalDept,
        currentSem: '',
        currentCat: '',
        currentCourseCode: '',
        currentCourseTitle: '',
        currentSubPath: '',
        view: 'semesters',
        breadcrumbs: [
          { label: 'Departments', icon: 'fa-building', onClick: () => get().goHome() },
          { label: dept?.shortName || canonicalDept, icon: dept?.icon },
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
        currentSubPath: '',
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
        currentSubPath: '',
        view: 'files',
        breadcrumbs: [
          ...breadcrumbs,
          { label: catConfig?.label || catKey, icon: 'fa-folder' },
        ],
      });
    },

    navigateToSubFolder: (subFolder) => {
      const { currentSubPath, breadcrumbs } = get();
      const label = subFolder.split('/').pop() || subFolder;
      const newSubPath = currentSubPath ? `${currentSubPath}/${subFolder}` : subFolder;
      set({
        currentSubPath: newSubPath,
        breadcrumbs: [...breadcrumbs, { label, icon: 'fa-folder' }],
      });
    },

    navigateUpSubFolder: () => {
      const { currentSubPath, breadcrumbs } = get();
      if (!currentSubPath) return;
      const segments = currentSubPath.split('/');
      segments.pop();
      const newSubPath = segments.join('/');
      set({
        currentSubPath: newSubPath,
        breadcrumbs: breadcrumbs.slice(0, -1),
      });
    },

    resetSubPath: () => {
      set({ currentSubPath: '' });
    },

    navigateToCourse: (courseCode, courseTitle) => {
      const { breadcrumbs } = get();
      const label = courseTitle ? `${courseCode} - ${courseTitle}` : courseCode;
      set({
        currentCourseCode: courseCode,
        currentCourseTitle: courseTitle,
        currentMidFinal: '',
        currentSubPath: '',
        view: 'categories',
        breadcrumbs: [
          ...breadcrumbs,
          { label, icon: 'fa-book' },
        ],
      });
    },

    navigateToMidFinal: (midFinal) => {
      const { currentDept, currentSem, currentCourseCode, currentCourseTitle } = get();
      set({
        currentMidFinal: midFinal,
        currentCat: '',
        currentSubPath: '',
        view: 'categories',
        breadcrumbs: [
          { label: 'Departments', icon: 'fa-building', onClick: () => get().goHome() },
          ...(currentDept ? [{ label: (() => { for (const f of FACULTIES) { const d = f.departments.find(dd => dd.id === currentDept); if (d) return d.shortName; } return currentDept; })(), icon: 'fa-building', onClick: () => get().navigateToDepartment(currentDept) }] : []),
          ...(currentSem ? [{ label: currentSem.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()), icon: 'fa-calendar', onClick: () => get().navigateToSemester(currentSem) }] : []),
          ...(currentCourseCode ? [{ label: currentCourseTitle ? `${currentCourseCode} - ${currentCourseTitle}` : currentCourseCode, icon: 'fa-book', onClick: () => get().navigateToCourse(currentCourseCode, currentCourseTitle) }] : []),
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
      const { view, currentDept, currentSem, currentCourseCode, currentCourseTitle, currentMidFinal, currentSubPath, breadcrumbs } = get();
      if (view === 'files' && currentSubPath) {
        get().navigateUpSubFolder();
      } else if (view === 'files') {
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
        currentSubPath: '',
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

    removeHistory: (path) => {
      try {
        let items = JSON.parse(localStorage.getItem('qsis_history') || '[]');
        items = items.filter((i: any) => i.path !== path);
        localStorage.setItem('qsis_history', JSON.stringify(items));
        get().loadRecentReads();
      } catch {}
    },

    pruneHistory: (validPaths) => {
      try {
        let items = JSON.parse(localStorage.getItem('qsis_history') || '[]');
        const before = items.length;
        items = items.filter((i: any) => validPaths.has(i.path));
        if (items.length !== before) {
          localStorage.setItem('qsis_history', JSON.stringify(items));
          get().loadRecentReads();
        }
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
          if (Array.isArray(data)) {
            set({ contributors: data });
          } else if (Array.isArray(data.contributors)) {
            set({ contributors: data.contributors });
          } else {
            set({ contributors: [] });
          }
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

    ...treeHelpers,
  };
});
