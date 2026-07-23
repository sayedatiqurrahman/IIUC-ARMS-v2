import { create } from 'zustand';
import { config } from './config';

/* ─── types ─── */
export type View = 'semesters' | 'categories' | 'courses' | 'files' | 'history' | 'contributors' | 'routine' | 'dashboard';

export interface Breadcrumb {
  label: string;
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

/* ─── helpers ─── */
function getRawUrl(path: string) {
  return `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.branch}/${config.uploadPath}/${path}`;
}

function getMimeFromExt(ext: string) {
  const e = ext.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(e)) return 'image';
  if (e === 'pdf') return 'pdf';
  if (['doc', 'docx'].includes(e)) return 'doc';
  if (['xls', 'xlsx', 'csv'].includes(e)) return 'sheet';
  if (['ppt', 'pptx'].includes(e)) return 'ppt';
  return 'other';
}

function detectCategory(name: string) {
  const l = name.toLowerCase();
  // Related Kitabs categories - return folder name as category key
  if (config.relatedKitabsCategories[l]) return l;
  // Semester categories
  if (l.includes('sheet')) return 'sheet';
  if (l.includes('previous question') || l.includes('question')) return 'question';
  if (l === 'notes' || l === 'note') return 'note';
  if (l.includes('syllabus')) return 'syllabus';
  return 'other';
}

function getPdfPageKey(filePath: string) {
  return 'pdf_page_' + btoa(unescape(encodeURIComponent(filePath))).replace(/[=+/]/g, '');
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
  email: string;
  whatsapp: string;
  semester: string;
  image: string;
  githubLogin: string;
  githubToken: string;
  facebook: string;
  twitter: string;
  linkedin: string;
  website: string;
  hideWhatsapp: boolean;
  hideUniversityId: boolean;
}

const defaultProfile: Profile = {
  universityId: '', name: '', email: '', whatsapp: '', semester: '', image: '',
  githubLogin: '', githubToken: '', facebook: '', twitter: '', linkedin: '', website: '',
  hideWhatsapp: false, hideUniversityId: false,
};

/* ─── store ─── */
interface AppState {
  tree: any[];
  loading: boolean;
  error: string;

  view: View;
  currentSem: string;
  currentCat: string;
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

  routineData: any[];
  routineLoading: boolean;

  profile: Profile;
  updateProfile: (p: Partial<Profile>) => Promise<void>;
  loadProfile: () => Promise<void>;
  githubToken: string;
  setGithubToken: (token: string) => void;

  loadTree: (token?: string) => Promise<void>;

  navigateToSemester: (semId: string) => void;
  navigateToCategory: (semId: string, catKey: string) => void;
  navigateToCourse: (courseName: string) => void;
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

  getUploadTree: () => any[];
  getSemesters: () => Semester[];
  getCategories: (semId: string) => Category[];
  getCourses: (semId: string, catKey: string) => [string, any[]][];
}

export const useAppStore = create<AppState>((set, get) => ({
  tree: [],
  loading: true,
  error: '',

  view: 'semesters',
  currentSem: '',
  currentCat: '',
  breadcrumbs: [],

  searchQuery: '',
  fileTypeFilter: 'all',
  searchSemester: '',
  searchYear: '',

  viewerOpen: false,
  viewerItem: null,

  uploadOpen: false,
  recentReads: [],

  imgZoom: 100,
  imgRotation: 0,

  contributors: [],
  contributorsLoading: false,

  routineData: [],
  routineLoading: false,

  profile: { ...defaultProfile },
  loadProfile: async () => {
    try {
      const res = await fetch('/api/profile');
      if (res.ok) {
        const data = await res.json();
        set({ profile: { ...defaultProfile, ...data } });
      } else {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        console.error('[Profile] Load failed:', res.status, err);
      }
    } catch (err) {
      console.error('[Profile] Load error:', err);
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
        console.error('[Profile] Save failed:', res.status, err);
        set({ profile: snapshot });
        if (typeof window !== 'undefined') {
          const { showToast } = await import('@/lib/utils');
          showToast(`Failed to save: ${err.error || 'Unknown error'}`, 'error');
        }
      }
    } catch (err) {
      console.error('[Profile] Save error:', err);
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
      const res = await fetch('/api/github', { headers });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const filtered = (data.tree || []).filter((item: any) => {
        const parts = item.path.split('/');
        const fileName = parts[parts.length - 1];
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        if (item.type === 'blob') {
          if (['.gitkeep', 'README.md', 'LICENSE'].includes(fileName)) return false;
          if (['js', 'json', 'yml', 'yaml', 'css', 'html', 'md', 'lock'].includes(ext)) return false;
          if (!config.academicExtensions.includes(ext)) return false;
        }
        return true;
      });
      set({ tree: filtered });
    } catch (err: any) {
      set({ error: err.message || 'Failed to load files' });
    }
    set({ loading: false });
  },

  navigateToSemester: (semId) => {
    const isRelated = semId === config.relatedKitabsFolder;
    const label = isRelated ? 'Related Kitabs' : semId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    set({
      currentSem: semId,
      currentCat: '',
      view: 'categories',
      breadcrumbs: [
        { label: 'Home', onClick: () => get().goHome() },
        { label },
      ],
    });
  },

  navigateToCategory: (semId, catKey) => {
    const catConfig = config.categories[catKey as keyof typeof config.categories];
    set({
      currentCat: catKey,
      view: 'courses',
      breadcrumbs: [
        { label: 'Home', onClick: () => get().goHome() },
        {
          label: semId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          onClick: () => get().navigateToSemester(semId),
        },
        { label: catConfig?.label || catKey },
      ],
    });
  },

  navigateToCourse: (courseName) => {
    const { breadcrumbs } = get();
    set({
      view: 'files',
      breadcrumbs: [...breadcrumbs, { label: courseName }],
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
    const { view, currentSem, currentCat, breadcrumbs } = get();
    if (view === 'files') {
      set({ view: 'courses', breadcrumbs: breadcrumbs.slice(0, -1) });
    } else if (view === 'courses') {
      get().navigateToCategory(currentSem, currentCat);
    } else if (view === 'history' || view === 'contributors' || view === 'routine' || view === 'dashboard') {
      get().goHome();
    } else {
      get().goHome();
    }
  },

  goHome: () => {
    set({
      view: 'semesters',
      currentSem: '',
      currentCat: '',
      breadcrumbs: [],
      searchQuery: '',
      fileTypeFilter: 'all',
      searchSemester: '',
      searchYear: '',
    });
    get().loadRecentReads();
  },

  setSearchQuery: (q) => set({ searchQuery: q }),
  setFileTypeFilter: (f) => set({ fileTypeFilter: f }),
  setSearchSemester: (s) => set({ searchSemester: s }),
  setSearchYear: (y) => set({ searchYear: y }),
  resetFilters: () => set({ searchQuery: '', fileTypeFilter: 'all', searchSemester: '', searchYear: '' }),

  openFile: (item) => {
    const ext = item.path.split('/').pop()?.split('.').pop()?.toLowerCase() || '';
    const mime = getMimeFromExt(ext);
    const rawUrl = getRawUrl(item.path);
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
      }
    } catch (err) {
      console.warn('Failed to load contributors:', err);
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
    } catch (err) {
      console.warn('Failed to load routine:', err);
      set({ routineData: [] });
    }
    set({ routineLoading: false });
  },

  /* ────────────────────────────────────────────────────────────────
     COMPUTED HELPERS
     Structure: upload_academic_files / {sem} / {cat_folder} / {course} / {file}
     After getUploadTree strips prefix: {sem} / {cat_folder} / {course} / {file}
     parts[0]=sem  parts[1]=cat_folder  parts[2]=course  parts[3]=file
     Only blobs (item.type === 'blob') are real files.
     ──────────────────────────────────────────────────────────────── */

  getUploadTree: () => {
    const { tree } = get();
    return tree
      .filter((item) => item.path.startsWith(config.uploadPath + '/'))
      .map((item) => ({ ...item, path: item.path.substring(config.uploadPath.length + 1) }));
  },

  getSemesters: () => {
    const uploadTree = get().getUploadTree();
    const sems = new Map<string, { files: number; courses: Set<string> }>();

    // Initialize from config so all semesters appear even if empty
    config.semesters.forEach((s) => {
      sems.set(s.id, { files: 0, courses: new Set() });
    });

    // Related Kitabs entry
    sems.set(config.relatedKitabsFolder, { files: 0, courses: new Set() });

    uploadTree.forEach((item: any) => {
      if (item.type !== 'blob') return;
      const parts = item.path.split('/');
      const sem = parts[0];
      if (!sem) return;

      // Skip related-kitabs folder from semester counts (handled separately)
      if (sem === config.relatedKitabsFolder) {
        const s = sems.get(config.relatedKitabsFolder)!;
        s.files++;
        if (parts.length >= 3 && parts[1]) s.courses.add(parts[1]);
        return;
      }

      if (!sems.has(sem)) sems.set(sem, { files: 0, courses: new Set() });
      const s = sems.get(sem)!;
      s.files++;

      // Course name is at parts[2] only when structure is sem/cat_folder/course/file (4+ parts)
      if (parts.length >= 4 && parts[2]) {
        s.courses.add(parts[2]);
      }
    });

    return Array.from(sems.entries())
      .map(([id, data]) => {
        const cfg = config.semesters.find(s => s.id === id);
        const isRelated = id === config.relatedKitabsFolder;
        const label = isRelated ? 'Related Kitabs' : (cfg?.label || id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
        return { id, label, files: data.files, courses: data.courses.size, isRelated };
      })
      .sort((a, b) => {
        if (a.isRelated) return 1;
        if (b.isRelated) return -1;
        return a.id.localeCompare(b.id);
      });
  },

  getCategories: (semId) => {
    const uploadTree = get().getUploadTree();
    const isRelated = semId === config.relatedKitabsFolder;
    const prefix = semId + '/';
    const folderCounts: Record<string, number> = {};
    const knownFolders = new Set<string>();

    uploadTree.forEach((item: any) => {
      if (!item.path.startsWith(prefix)) return;
      const rel = item.path.substring(prefix.length);
      const parts = rel.split('/');
      const catFolder = parts[0];
      if (!catFolder) return;

      knownFolders.add(catFolder);

      if (item.type === 'blob') {
        folderCounts[catFolder] = (folderCounts[catFolder] || 0) + 1;
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

    // For related-kitabs, merge entries with same category key and apply labels
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

    return catEntries;
  },

  getCourses: (semId, catKey) => {
    const uploadTree = get().getUploadTree();
    const categories = get().getCategories(semId);
    const catEntry = categories.find((c) => c.cat === catKey);
    if (!catEntry || catEntry.folders.length === 0) return [];

    const catFolders = new Set(catEntry.folders);
    const prefix = semId + '/';
    const courses = new Map<string, any[]>();

    uploadTree.forEach((item: any) => {
      if (item.type !== 'blob') return;
      if (!item.path.startsWith(prefix)) return;
      const rel = item.path.substring(prefix.length);
      const parts = rel.split('/');

      // Must be: cat_folder/course_name/file  (3+ parts after sem prefix)
      if (parts.length < 3) return;

      const catFolder = parts[0];
      if (!catFolders.has(catFolder)) return;

      const courseName = parts[1];
      if (!courseName) return;

      if (!courses.has(courseName)) courses.set(courseName, []);
      courses.get(courseName)!.push(item);
    });

    return Array.from(courses.entries()).sort((a, b) => a[0].localeCompare(b[0]));
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
