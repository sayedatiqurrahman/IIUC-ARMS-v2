'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useRef, useCallback } from 'react';
import { config } from '@/lib/config';
import { DEFAULT_PERMISSIONS } from '@/lib/permission-defaults';
import { FACULTIES, getDepartmentFolder, getFacultyIdForDepartment } from '@/lib/departments';
import { useAppStore } from '@/lib/store';
import { getMimeFromExt, extractYear, showToast } from '@/lib/utils';
import { CreateCourseResult } from '@/components/upload';
import PageHeader from '@/components/browse/PageHeader';
import LatestNotices from '@/components/notices/LatestNotices';
import BrowseHeader from '@/components/browse/BrowseHeader';
import PageLoader from '@/components/PageLoader';
import { refreshTreeUntilVisible } from '@/lib/tree-refresh';
import dynamic from 'next/dynamic';
// Each browse view is loaded on demand — only the view you're actually in is
// fetched/executed, so switching departments → semesters → courses → files
// doesn't run everything at once and low-end devices stay responsive.
const DepartmentsView = dynamic(() => import('@/components/browse/DepartmentsView'), { ssr: false });
const SemestersView = dynamic(() => import('@/components/browse/SemestersView'), { ssr: false });
const CoursesView = dynamic(() => import('@/components/browse/CoursesView'), { ssr: false });
const CategoriesView = dynamic(() => import('@/components/browse/CategoriesView'), { ssr: false });
const SubFolderView = dynamic(() => import('@/components/browse/SubFolderView'), { ssr: false });
const RelatedFolderView = dynamic(() => import('@/components/browse/RelatedFolderView'), { ssr: false });
const FileGrid = dynamic(() => import('@/components/browse/FileGrid'), { ssr: false });
const FolderCard = dynamic(() => import('@/components/browse/FolderCard'), { ssr: false });
const BrowseModals = dynamic(() => import('@/components/browse/BrowseModals'), { ssr: false });
const CreateFolderModal = dynamic(() => import('@/components/browse/CreateFolderModal'), { ssr: false });
const ReadmeEditor = dynamic(() => import('@/components/ReadmeEditor'), { ssr: false });
import ShareModal, { type ShareItem } from '@/components/browse/ShareModal';
export default function BrowsePage() {
  const { data: session } = useSession();
  const profile = useAppStore(s => s.profile);
  const [mounted, setMounted] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const deepLinkingRef = useRef(false);
  const email = session?.user?.email || profile.email || '';
  const userRole = email ? config.detectRole(email) : null;
  const userName = session?.user?.name || profile.name || '';
  const isPrivileged = userRole === 'admin' || userRole === 'teacher';
  const isOwner = email ? config.ownerEmails.includes(email.toLowerCase()) : false;
  const [filePerms, setFilePerms] = useState<Record<string, boolean>>({
    move: false, copy: false, rename: false, delete: false, folderDelete: false,
  });
  const [coursePerms, setCoursePerms] = useState<{ canAdd: boolean; canEdit: boolean; canDelete: boolean; canEditLinks: boolean }>({
    canAdd: false, canEdit: false, canDelete: false, canEditLinks: false,
  });
  const [canCreateFolder, setCanCreateFolder] = useState(false);
  const [moveTarget, setMoveTarget] = useState<{ path: string; name: string; mode: 'move' | 'copy' } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ path: string; name: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ path: string; name: string; kind?: 'file' | 'folder' } | null>(null);
  const [actionLoading, setActionLoading] = useState('');
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState<{ show: boolean; message: string; contact: string }>({ show: false, message: '', contact: '' });
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [relatedCreatePath, setRelatedCreatePath] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickUploading, setQuickUploading] = useState(false);
  const quickInputRef = useRef<HTMLInputElement>(null);
  const [shareItem, setShareItem] = useState<ShareItem | null>(null);
  const loading = useAppStore(s => s.loading);
  const error = useAppStore(s => s.error);
  const onboardData = useAppStore(s => s.onboardingData);
  const clearOnboarding = useAppStore(s => s.clearOnboarding);
  const view = useAppStore(s => s.view);
  const currentSem = useAppStore(s => s.currentSem);
  const currentCat = useAppStore(s => s.currentCat);
  const searchQuery = useAppStore(s => s.searchQuery);
  const fileTypeFilter = useAppStore(s => s.fileTypeFilter);
  const searchSemester = useAppStore(s => s.searchSemester);
  const searchYear = useAppStore(s => s.searchYear);
  const recentReads = useAppStore(s => s.recentReads);
  const loadTree = useAppStore(s => s.loadTree);
  const loadCourses = useAppStore(s => s.loadCourses);
  const dbCourses = useAppStore(s => s.dbCourses);
  const setSearchQuery = useAppStore(s => s.setSearchQuery);
  const setFileTypeFilter = useAppStore(s => s.setFileTypeFilter);
  const setSearchSemester = useAppStore(s => s.setSearchSemester);
  const setSearchYear = useAppStore(s => s.setSearchYear);
  const resetFilters = useAppStore(s => s.resetFilters);
  const goHome = useAppStore(s => s.goHome);
  const navigateToDepartment = useAppStore(s => s.navigateToDepartment);
  const navigateToSemester = useAppStore(s => s.navigateToSemester);
  const navigateToCategory = useAppStore(s => s.navigateToCategory);
  const navigateToCourse = useAppStore(s => s.navigateToCourse);
  const navigateToMidFinal = useAppStore(s => s.navigateToMidFinal);
  const navigateToSubFolder = useAppStore(s => s.navigateToSubFolder);
  const goBack = useAppStore(s => s.goBack);
  const openFile = useAppStore(s => s.openFile);
  const openRecentFile = useAppStore(s => s.openRecentFile);
  const getSemesters = useAppStore(s => s.getSemesters);
  const getSemesterCourses = useAppStore(s => s.getSemesterCourses);
  const getCourseCategories = useAppStore(s => s.getCourseCategories);
  const getCourseMidFinal = useAppStore(s => s.getCourseMidFinal);
  const getSubfolderContents = useAppStore(s => s.getSubfolderContents);
  const getUploadTree = useAppStore(s => s.getUploadTree);
  const getSearchResults = useAppStore(s => s.getSearchResults);
  const getUploadDepartments = useAppStore(s => s.getUploadDepartments);
  const currentDept = useAppStore(s => s.currentDept);
  const currentCourseCode = useAppStore(s => s.currentCourseCode);
  const currentCourseTitle = useAppStore(s => s.currentCourseTitle);
  const currentMidFinal = useAppStore(s => s.currentMidFinal);
  const currentSubPath = useAppStore(s => s.currentSubPath);
  useEffect(() => {
    loadCourses();
    setShowWelcome(localStorage.getItem('qs-welcome-dismissed') !== 'true');
    setMounted(true);
  }, []);
  useEffect(() => {
    if (!email) return;
    const role = config.getEffectiveRole(email, (profile as any).role);
    const isCR = profile.isCR || false;
    const loadPerms = async () => {
      try {
        const res = await fetch('/api/settings/permissions');
        const data = await res.json();
        if (!data.success) {
          // Fall back to default permissions from site settings
          const perms = await import('@/lib/permission-defaults').then(m => m.DEFAULT_PERMISSIONS);
          setFilePerms({
            move: isOwner || perms.moveFile.includes(isCR ? 'cr' : role),
            copy: isOwner || perms.copyFile.includes(isCR ? 'cr' : role),
            rename: isOwner || perms.renameFile.includes(isCR ? 'cr' : role),
            delete: isOwner || perms.deleteFile.includes(isCR ? 'cr' : role),
            folderDelete: isOwner || perms.deleteFolder.includes(isCR ? 'cr' : role),
          });
          setCoursePerms({
            canAdd: perms.addCourse.includes(isCR ? 'cr' : role),
            canEdit: perms.editCourse.includes(isCR ? 'cr' : role),
            canDelete: perms.deleteCourse.includes(isCR ? 'cr' : role),
            canEditLinks: perms.editLinks.includes(isCR ? 'cr' : role),
          });
          setCanCreateFolder(!!session?.user);
          return;
        }
        const perms = data.permissions || {};
        const customPerms = (profile as any).customPermissions || {};
        // Layer 2: resolve custom role permissions from settings
        const customRoles = data.customRoles || [];
        const myCustomRole = customRoles.find((r: any) => r.key === (profile as any).role);
        const rolePerms = myCustomRole?.permissions || [];
        const check = (action: string) => {
          if (rolePerms.includes(action)) return true;
          if (customPerms[action] === true) return true;
          const perUserKey = `${action}_users`;
          const allowedUsers = perms[perUserKey] || [];
          if (allowedUsers.includes(email.toLowerCase())) return true;
          const allowedRoles = perms[action] || [];
          return allowedRoles.includes(isCR ? 'cr' : role);
        };
        setFilePerms({
          move: isOwner || check('moveFile'),
          copy: isOwner || check('copyFile'),
          rename: isOwner || check('renameFile'),
          delete: isOwner || check('deleteFile'),
          folderDelete: isOwner || check('deleteFolder'),
        });
        setCoursePerms({
          canAdd: check('addCourse'),
          canEdit: check('editCourse'),
          canDelete: check('deleteCourse'),
          canEditLinks: check('editLinks'),
        });
        setCanCreateFolder(!!session?.user);
      } catch {
        // Fall back to default permissions
        const perms = await import('@/lib/permission-defaults').then(m => m.DEFAULT_PERMISSIONS);
        setFilePerms({
          move: isOwner || perms.moveFile.includes(isCR ? 'cr' : role),
          copy: isOwner || perms.copyFile.includes(isCR ? 'cr' : role),
          rename: isOwner || perms.renameFile.includes(isCR ? 'cr' : role),
          delete: isOwner || perms.deleteFile.includes(isCR ? 'cr' : role),
          folderDelete: isOwner || perms.deleteFolder.includes(isCR ? 'cr' : role),
        });
        setCoursePerms({
          canAdd: perms.addCourse.includes(isCR ? 'cr' : role),
          canEdit: perms.editCourse.includes(isCR ? 'cr' : role),
          canDelete: perms.deleteCourse.includes(isCR ? 'cr' : role),
          canEditLinks: perms.editLinks.includes(isCR ? 'cr' : role),
        });
        setCanCreateFolder(!!session?.user);
      }
    };
    loadPerms();
  }, [email, profile.isCR, session?.user]);
  const handleFileAction = useCallback(async (action: string, from: string, to?: string, newName?: string) => {
    const opLabels: Record<string, string> = {
      delete: 'Deleting…',
      rename: 'Renaming…',
      move: 'Moving…',
      copy: 'Copying…',
    };
    setActionLoading(action + from);
    useAppStore.getState().setOperationLabel(opLabels[action] || 'Working…');
    try {
      const res = await fetch('/api/github/file-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, from, to, newName }),
      });
      const data = await res.json();
      if (!res.ok && !data.pendingApproval) throw new Error(data.error || 'Action failed');
      if (data.pendingApproval) {
        showToast(data.message || 'Delete request sent to owner for approval', 'info');
      } else {
        showToast(`${action.charAt(0).toUpperCase() + action.slice(1)} successful!`, 'success');
        if (action === 'delete') {
          if (data.isFolder) {
            // Remove all history entries under the deleted folder
            const prefix = from + '/';
            try {
              let items = JSON.parse(localStorage.getItem('qsis_history') || '[]');
              items = items.filter((i: any) => i.path !== from && !i.path.startsWith(prefix));
              localStorage.setItem('qsis_history', JSON.stringify(items));
              useAppStore.getState().loadRecentReads();
            } catch {}
          } else {
            useAppStore.getState().removeHistory(from);
          }
        }
        useAppStore.getState().invalidateTreeCache();
        loadTree(session?.accessToken || '');
      }
      return data;
    } catch (e: any) {
      showToast(e.message || 'Action failed', 'error');
      throw e;
    } finally {
      setActionLoading('');
      useAppStore.getState().setOperationLabel('');
    }
  }, [session?.accessToken, loadTree]);
  const handleAddCourse = useCallback(async (code: string, title: string): Promise<CreateCourseResult> => {
    useAppStore.getState().setOperationLabel('Creating course…');
    try {
      const res = await useAppStore.getState().addCourse(currentDept || '', currentSem || '', code, title);
      if (!res.success) {
        if (/permission|not allowed|forbidden/i.test(res.error || '')) {
          setPermissionDenied({ show: true, message: res.error || 'You do not have permission to add courses.', contact: 'Please contact your CR, ACR, teacher, manager, or admin for access.' });
          setShowAddCourse(false);
        }
        return { success: false, error: res.error || 'Failed to create course' };
      }
      showToast(res.alreadyExisted ? `Course ${code} already exists — selected` : `Course ${code} created on GitHub`, res.alreadyExisted ? 'info' : 'success');
      useAppStore.getState().invalidateCoursesCache();
      useAppStore.getState().loadCourses();
      // GitHub's tree API is eventually consistent — keep reloading until the
      // newly created course folder actually shows up, so no manual refresh.
      const finalCode = (res.course?.code || code).toUpperCase();
      const cleanTitle = (res.course?.title || title).trim();
      const expectedFolder = `${getDepartmentFolder(currentDept || '')}/${currentSem || ''}/${finalCode} - ${cleanTitle}`;
      refreshTreeUntilVisible(expectedFolder, session?.accessToken || '');
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || 'Failed to create course' };
    } finally {
      useAppStore.getState().setOperationLabel('');
    }
  }, [currentDept, currentSem, session?.accessToken, loadTree]);

  const handleCreateFolder = useCallback(async (folderName: string) => {
    const s = useAppStore.getState();
    const deptFolder = getDepartmentFolder(s.currentDept);
    const courseFolder = s.currentCourseCode && s.currentCourseTitle
      ? `${s.currentCourseCode} - ${s.currentCourseTitle}`
      : '';
    const catFolder = s.currentCat
      ? config.categories[s.currentCat as keyof typeof config.categories]?.folder || s.currentCat
      : '';
    let parts;
    if (s.currentSem === config.relatedKitabsFolder || s.currentSem === config.relatedSourcesFolder) {
      const rootFolder = s.currentSem === config.relatedKitabsFolder
        ? config.relatedKitabsParent
        : getFacultyIdForDepartment(s.currentDept) || deptFolder || s.currentDept;
      parts = [rootFolder, s.currentSem, relatedCreatePath, folderName].filter(Boolean);
    } else {
      parts = [deptFolder, s.currentSem, courseFolder, s.currentMidFinal, catFolder, s.currentSubPath, folderName].filter(Boolean);
    }
    const folderPath = `${config.uploadPath}/${parts.join('/')}`;
    const res = await fetch('/api/github/create-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create folder');
    showToast(`Folder "${folderName}" created`, 'success');
    useAppStore.getState().invalidateTreeCache();
    loadTree(session?.accessToken || '');
  }, [session?.accessToken, loadTree, relatedCreatePath]);

  // Direct "upload to the folder you're browsing" — no form, no modal. The
  // target is the current folder's GitHub path (relative to the upload root).
  const handleQuickUpload = useCallback(async (target: string, files: File[]) => {
    if (!files.length || !target) return;
    const payload = files.slice(0, 5);
    for (const f of payload) {
      if (f.size > config.maxSingleFileUploadMB * 1024 * 1024) {
        showToast(`${f.name} is larger than ${config.maxSingleFileUploadMB}MB`, 'error');
        return;
      }
    }
    setQuickUploading(true);
    try {
      const formData = new FormData();
      for (const f of payload) formData.append('files', f, `${target}/${f.name}`);
      formData.append('message', `Upload ${payload.length === 1 ? payload[0].name : `${payload.length} files`} to ${target}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 85000);
      try {
        const res = await fetch('/api/github/upload', { method: 'POST', body: formData, signal: controller.signal });
        const data = await res.json().catch(() => ({}));
        if (data.success) {
          showToast(`Uploaded ${payload.length} file${payload.length !== 1 ? 's' : ''} to ${target}`, 'success');
          useAppStore.getState().invalidateTreeCache();
          loadTree(session?.accessToken || '');
        } else {
          showToast(data.error || 'Upload failed', 'error');
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      showToast('Upload failed — please try again', 'error');
    } finally {
      setQuickUploading(false);
    }
  }, [session?.accessToken, loadTree]);

  const handleFileShare = useCallback((path: string, name: string, isFolder: boolean) => {
    const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://iiuc-arms.eu.cc';
    const params = new URLSearchParams();
    if (currentDept) params.set('dept', getDepartmentFolder(currentDept));
    if (currentSem) params.set('sem', currentSem);
    if (currentCourseCode) params.set('course', currentCourseCode);
    if (currentMidFinal) params.set('mf', currentMidFinal);
    if (currentCat) {
      const catMeta = config.categories[currentCat as keyof typeof config.categories];
      params.set('cat', catMeta?.label || currentCat);
    }
    if (currentSubPath) params.set('sub', currentSubPath);
    const qs = params.toString();
    const pageUrl = qs ? `${SITE_URL}/?${qs}` : SITE_URL;
    if (isFolder) {
      const items = useAppStore.getState().tree.filter((t: any) => t.path.startsWith(path + '/') || t.path === path);
      setShareItem({ title: name, url: pageUrl, type: 'course', githubPath: path, treeItems: items });
    } else {
      setShareItem({ title: name, url: pageUrl, type: 'file', githubPath: path });
    }
  }, [currentDept, currentSem, currentCourseCode, currentMidFinal, currentCat, currentSubPath]);

  useEffect(() => {
    if (!mounted) return;
    const p = new URLSearchParams(window.location.search);
    const dept = p.get('dept');
    if (!dept) return;
    const sem = p.get('sem') || '';
    const course = p.get('course') || '';
    const mf = p.get('mf') || '';
    const cat = p.get('cat') || '';
    const sub = p.get('sub') || '';
    // Navigates through nested subfolder segments after reaching the category.
    const runSubNav = (delay = 300) => {
      const st = useAppStore.getState();
      if (sub && st.currentCat && st.view === 'files') {
        const segs = sub.split('/').filter(Boolean);
        if (segs.length > 0) {
          segs.forEach((seg, i) => {
            setTimeout(() => {
              useAppStore.getState().navigateToSubFolder(seg);
              if (i === segs.length - 1) deepLinkingRef.current = false;
            }, 150 * (i + 1));
          });
          return;
        }
      }
      deepLinkingRef.current = false;
    };
    // A shallow dept/sem URL on a personalized user is almost always a stale
    // position (e.g. the old profile-load bug left ?sem=6th-semister in the
    // URL), not an intentional share. Only deep links (course/category/file/
    // search) override personalization; otherwise the personalization redirect
    // below handles navigation and normalizes the URL.
    if (!(course || mf || cat || p.get('q')) && useAppStore.getState().onboardingData) return;
    deepLinkingRef.current = true;
    if (loading) return;
    if (view !== 'departments') return;
    navigateToDepartment(dept);
    if (sem) {
      setTimeout(() => {
        useAppStore.getState().navigateToSemester(sem);
        if (course) {
          setTimeout(() => {
            const st2 = useAppStore.getState();
            const courses = st2.getSemesterCourses(sem, st2.currentDept || dept);
            const found = courses.find(c => c.code.toUpperCase() === course.toUpperCase());
            if (found) {
              st2.navigateToCourse(found.code, found.title);
              const finishNav = (delay = 300) => {
                if (mf) {
                  setTimeout(() => {
                    useAppStore.getState().navigateToMidFinal(mf);
                    if (cat) {
                      setTimeout(() => {
                        const catKey = Object.keys(config.categories).find(k => config.categories[k as keyof typeof config.categories].label.toLowerCase() === cat.toLowerCase() || k === cat);
                        if (catKey) useAppStore.getState().navigateToCategory(catKey);
                        setTimeout(() => { runSubNav(delay); }, delay);
                      }, 150);
                    } else {
                      setTimeout(() => { runSubNav(delay); }, delay);
                    }
                  }, 150);
                } else if (cat) {
                  setTimeout(() => {
                    const catKey = Object.keys(config.categories).find(k => config.categories[k as keyof typeof config.categories].label.toLowerCase() === cat.toLowerCase() || k === cat);
                    if (catKey) useAppStore.getState().navigateToCategory(catKey);
                    setTimeout(() => { runSubNav(delay); }, delay);
                  }, 150);
                } else {
                  setTimeout(() => { runSubNav(delay); }, delay);
                }
              };
              finishNav();
            } else {
              setTimeout(() => {
                const retryCourses = useAppStore.getState().getSemesterCourses(sem, dept);
                const retryFound = retryCourses.find(c => c.code.toUpperCase() === course.toUpperCase());
                if (retryFound) {
                  useAppStore.getState().navigateToCourse(retryFound.code, retryFound.title);
                  const finishRetryNav = (delay = 300) => {
                    if (mf) {
                      setTimeout(() => {
                        useAppStore.getState().navigateToMidFinal(mf);
                        if (cat) {
                          setTimeout(() => {
                            const catKey = Object.keys(config.categories).find(k => config.categories[k as keyof typeof config.categories].label.toLowerCase() === cat.toLowerCase() || k === cat);
                            if (catKey) useAppStore.getState().navigateToCategory(catKey);
                            setTimeout(() => { runSubNav(delay); }, delay);
                          }, 150);
                        } else {
                          setTimeout(() => { runSubNav(delay); }, delay);
                        }
                      }, 150);
                    } else if (cat) {
                      setTimeout(() => {
                        const catKey = Object.keys(config.categories).find(k => config.categories[k as keyof typeof config.categories].label.toLowerCase() === cat.toLowerCase() || k === cat);
                        if (catKey) useAppStore.getState().navigateToCategory(catKey);
                        setTimeout(() => { runSubNav(delay); }, delay);
                      }, 150);
                    } else {
                      setTimeout(() => { runSubNav(delay); }, delay);
                    }
                  };
                  finishRetryNav();
                } else {
                  deepLinkingRef.current = false;
                }
              }, 500);
            }
          }, 300);
        } else {
          setTimeout(() => { deepLinkingRef.current = false; }, 300);
        }
      }, 300);
    } else {
      setTimeout(() => { deepLinkingRef.current = false; }, 300);
    }
  }, [mounted, loading]);

  // Auto-redirect to the personalized department + semester.
  //  - On mount with pre-existing personalization: redirect once from the
  //    departments view, only when there is no deeplink in the URL (a deeplink
  //    always wins).
  //  - When personalization is just completed/edited via the modal (no data
  //    before, now set): jump straight to the newly chosen department +
  //    semester, regardless of the current view or URL.
  const autoRedirectedRef = useRef(false);
  const onboardDataRef = useRef(onboardData);
  useEffect(() => {
    if (!mounted || loading) return;
    const prevData = onboardDataRef.current;
    onboardDataRef.current = onboardData;
    if (autoRedirectedRef.current) return;

    const deptName = onboardData?.department || '';
    if (!deptName) return;
    const target = FACULTIES.flatMap(f => f.departments).find(d => d.name === deptName || d.id === deptName);
    if (!target) return;

    const freshCompletion = prevData == null && onboardData != null;
    if (!freshCompletion) {
      // Deep links (course/category/file/search) override personalization; a
      // shallow dept/sem URL is just a stale position that this redirect should
      // replace with the personalized semester (and the URL-sync effect then
      // rewrites the address bar).
      if (typeof window !== 'undefined') {
        const p = new URLSearchParams(window.location.search);
        if (p.has('course') || p.has('cat') || p.has('mf') || p.has('q')) return;
      }
      if (useAppStore.getState().view !== 'departments') return;
    }

    autoRedirectedRef.current = true;
    navigateToDepartment(target.id);
    const semId = onboardData?.semester
      ? config.semesters.find(s => s.label === onboardData.semester)?.id
      : null;
    if (semId && semId !== 'graduated') {
      setTimeout(() => {
        useAppStore.getState().navigateToSemester(semId);
      }, 200);
    }
  }, [mounted, loading, onboardData, navigateToDepartment, navigateToSemester]);
  // Auto-navigate when the user updates their semester from the dashboard.
  // The profile is fetched from the network (slower than the cached tree), so
  // its initial load must NEVER redirect — otherwise it would yank the user to
  // profile.semester (e.g. the 6th semester) right after the personalization
  // redirect landed on the chosen semester. Only later, user-initiated changes
  // navigate, and a deeplink always wins.
  const profileLoaded = useAppStore(s => s.profileLoaded);
  const prevSemesterRef = useRef<{ seen: boolean; value: string }>({ seen: false, value: '' });
  useEffect(() => {
    if (!mounted || loading || !profileLoaded) return;
    const newSem = profile.semester;
    const ref = prevSemesterRef.current;
    if (!ref.seen) {
      // First time we see the loaded profile — record it, never navigate from
      // this alone.
      ref.seen = true;
      ref.value = newSem;
      return;
    }
    const oldSem = ref.value;
    ref.value = newSem;
    if (!newSem || newSem === 'graduated' || newSem === oldSem) return;
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      if (p.has('dept') || p.has('sem') || p.has('course') || p.has('q')) return;
    }
    if (deepLinkingRef.current) return;
    const { currentDept, view: currentView } = useAppStore.getState();
    if (currentDept && (currentView === 'courses' || currentView === 'semesters')) {
      const { navigateToSemester } = useAppStore.getState();
      navigateToSemester(newSem);
    }
  }, [profile.semester, profileLoaded, mounted, loading]);
  const userSemesterId = onboardData
    ? config.semesters.find(s => s.label === onboardData.semester)?.id
    : null;
  const isMySemesterOnly = onboardData?.fileView === 'my-semester-only' && userSemesterId;
  const userDeptId = (() => {
    const deptName = onboardData?.department || profile.department || '';
    if (!deptName) return null;
    for (const f of FACULTIES) {
      for (const d of f.departments) {
        if (d.name === deptName || d.id === deptName) return d.id;
      }
    }
    return null;
  })();
  const departments = getUploadDepartments();
  const semesters = getSemesters(currentDept || userDeptId);
  const semesterCourses = currentSem ? getSemesterCourses(currentSem, currentDept || userDeptId) : [];
  const courseMidFinal = currentSem && currentCourseCode ? getCourseMidFinal(currentSem, currentCourseCode, currentDept || userDeptId) : { mid: 0, final: 0, root: 0 };
  const courseCategories = currentSem && currentCourseCode ? getCourseCategories(currentSem, currentCourseCode, currentDept || userDeptId, currentMidFinal || null) : [];
  const uploadTree = getUploadTree();

  const isSearching = !!(searchQuery || fileTypeFilter || searchYear || searchSemester);
  const searchResults = isSearching ? getSearchResults(searchQuery, fileTypeFilter, searchYear, searchSemester, currentDept || userDeptId) : { files: [], folders: [] };
  const getAvailableYears = useAppStore(s => s.getAvailableYears);
  const availableYears = getAvailableYears();
  useEffect(() => {
    if (!mounted || deepLinkingRef.current) return;
    const params = new URLSearchParams();
    if (view === 'departments') {
    } else if (view === 'semesters' && currentDept) {
      params.set('dept', getDepartmentFolder(currentDept));
    } else if (view === 'courses' && currentDept && currentSem) {
      params.set('dept', getDepartmentFolder(currentDept));
      params.set('sem', currentSem);
    } else if (view === 'categories' && currentDept && currentSem && currentCourseCode) {
      params.set('dept', getDepartmentFolder(currentDept));
      params.set('sem', currentSem);
      params.set('course', currentCourseCode);
      if (currentMidFinal) params.set('mf', currentMidFinal);
    } else if (view === 'files' && currentDept && currentSem && currentCourseCode && currentCat) {
      params.set('dept', getDepartmentFolder(currentDept));
      params.set('sem', currentSem);
      params.set('course', currentCourseCode);
      if (currentMidFinal) params.set('mf', currentMidFinal);
      const catMeta = config.categories[currentCat as keyof typeof config.categories];
      params.set('cat', catMeta?.label || currentCat);
      if (currentSubPath) params.set('sub', currentSubPath);
    } else if (isSearching && searchQuery) {
      params.set('q', searchQuery);
    }
    const qs = params.toString();
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState({}, '', url);
  }, [mounted, view, currentDept, currentSem, currentCourseCode, currentCat, currentMidFinal, currentSubPath, searchQuery, isSearching]);
  const filteredSemesters = semesters.filter(sem => {
    const matchLabel = !searchQuery || sem.label.toLowerCase().includes(searchQuery.toLowerCase());
    const matchSearch = matchLabel || uploadTree.some((item: any) => {
      if (item.type !== 'blob') return false;
      const parts = item.path.split('/');
      if (parts[0] !== sem.id) return false;
      const fileName = parts[parts.length - 1] || '';
      return fileName.toLowerCase().includes(searchQuery.toLowerCase());
    });
    if (!matchSearch) return false;
    if (fileTypeFilter) {
      const semFiles = uploadTree.filter((item: any) => {
        if (item.type !== 'blob') return false;
        const parts = item.path.split('/');
        if (parts[0] !== sem.id) return false;
        const ext = (parts[parts.length - 1] || '').split('.').pop()?.toLowerCase() || '';
        return getMimeFromExt(ext) === fileTypeFilter;
      });
      if (semFiles.length === 0) return false;
    }
    if (searchYear) {
      const semFiles = uploadTree.filter((item: any) => {
        if (item.type !== 'blob') return false;
        const parts = item.path.split('/');
        if (parts[0] !== sem.id) return false;
        const fileName = parts[parts.length - 1] || '';
        return extractYear(fileName) === searchYear;
      });
      if (semFiles.length === 0) return false;
    }
    return true;
  });
  const personalizedSemesters = (() => {
    if (!userSemesterId) return filteredSemesters;
    if (isMySemesterOnly) {
      return filteredSemesters.filter(s => s.id === userSemesterId || s.isRelated || s.id === config.relatedSourcesFolder);
    }
    const userSem = filteredSemesters.find(s => s.id === userSemesterId && !s.isRelated);
    if (!userSem) return filteredSemesters;
    const rest = filteredSemesters.filter(s => !(s.id === userSemesterId && !s.isRelated));
    return [userSem, ...rest];
  })();
  const filteredCourses = semesterCourses.filter(c => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return c.code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q);
  });
  const subfolderContents = currentSem && currentCat && currentCourseCode
    ? getSubfolderContents(currentSem, currentCourseCode, currentDept || userDeptId, currentMidFinal || null, currentCat, currentSubPath)
    : { subfolders: [], files: [] };
  const subPathSegments = currentSubPath ? currentSubPath.split('/') : [];
  const isRelatedSem = currentSem === config.relatedKitabsFolder || currentSem === config.relatedSourcesFolder;
  const isRelatedKitabs = currentSem === config.relatedKitabsFolder;
  const relatedLabel = isRelatedKitabs ? 'Related Kitabs' : 'Related Sources';
  const filteredFiles = (() => {
    if (!currentCat || !currentCourseCode || !currentSem) return [];
    return subfolderContents.files.filter((f: any) => {
      const fileName = f.path.split('/').pop() || '';
      const ext = fileName.split('.').pop()?.toLowerCase() || '';
      const matchSearch = !searchQuery || fileName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchType = !fileTypeFilter || getMimeFromExt(ext) === fileTypeFilter;
      const matchYear = !searchYear || extractYear(fileName) === searchYear;
      return matchSearch && matchType && matchYear;
    });
  })();
  return (
    <>
      {!mounted ? null : (
      <>
      <PageHeader
        view={view} searchQuery={searchQuery} isPrivileged={isPrivileged}
        showWelcome={showWelcome} setShowWelcome={setShowWelcome}
        userName={userName} userRole={userRole} isSearching={isSearching}
        departments={departments} recentReads={recentReads} openRecentFile={openRecentFile}
      />
      {view === 'departments' && <LatestNotices />}
      {view === 'files' && !loading && !error && !isSearching && (() => {
        const deptFolder = getDepartmentFolder(currentDept);
        const courseFolder = currentCourseCode && currentCourseTitle ? `${currentCourseCode} - ${currentCourseTitle}` : '';
        const catFolder = currentCat
          ? config.categories[currentCat as keyof typeof config.categories]?.folder || currentCat
          : '';
        const quickTarget = [deptFolder, currentSem, courseFolder, currentMidFinal, catFolder, currentSubPath].filter(Boolean).join('/');
        return (
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <span className="text-[0.7rem] text-dark-text2 min-w-0">
              <i className="fas fa-arrow-right text-[0.6rem] text-qsis mr-1"></i>
              Uploading into: <span className="font-mono text-qsis">./{quickTarget}</span>
            </span>
            <div className="relative">
              <input
                ref={quickInputRef}
                type="file"
                multiple
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.csv,.md,.markdown,.txt,.json,.html,.css,.js,.ts,.py,.zip"
                onChange={e => { const fl = Array.from(e.target.files || []); setMenuOpen(false); if (fl.length) handleQuickUpload(quickTarget, fl); setImmediate(() => { e.target.value = ''; }); }}
              />
              <button
                onClick={() => setMenuOpen(o => !o)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-br from-qsis to-qsis-dark text-white text-[0.78rem] font-semibold cursor-pointer border-none hover:opacity-90 transition-opacity shadow-lg shadow-qsis/20"
              >
                <i className="fas fa-plus text-[0.8rem]"></i>New
                <i className={`fas fa-chevron-down text-[0.55rem] ml-1 transition-transform ${menuOpen ? 'rotate-180' : ''}`}></i>
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-[45]" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 z-[60] w-72 rounded-xl border border-dark-border bg-dark-bg2 shadow-2xl overflow-hidden">
                    <button
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-dark-bg3 transition-colors cursor-pointer border-none bg-transparent"
                      onClick={() => { setMenuOpen(false); setRelatedCreatePath(''); setShowCreateFolder(true); }}
                    >
                      <span className="w-8 h-8 rounded-lg bg-qsis/15 flex items-center justify-center shrink-0"><i className="fas fa-folder-plus text-qsis text-sm"></i></span>
                      <span className="flex flex-col min-w-0 text-left">
                        <span className="text-[0.8rem] font-semibold text-dark-text">New Folder</span>
                        <span className="text-[0.65rem] text-dark-text3">Create a folder inside this location</span>
                      </span>
                    </button>
                    <button
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-dark-bg3 transition-colors cursor-pointer border-none bg-transparent border-t border-dark-border disabled:opacity-50"
                      disabled={quickUploading}
                      onClick={() => { setMenuOpen(false); if (!quickUploading) quickInputRef.current?.click(); }}
                    >
                      <span className="w-8 h-8 rounded-lg bg-qsis/15 flex items-center justify-center shrink-0"><i className="fas fa-cloud-upload-alt text-qsis text-sm"></i></span>
                      <span className="flex flex-col min-w-0 text-left">
                        <span className="text-[0.8rem] font-semibold text-dark-text">{quickUploading ? 'Uploading...' : 'Upload File'}</span>
                        <span className="text-[0.65rem] text-dark-text3">Upload directly here — no form</span>
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}
      <BrowseHeader
        searchQuery={searchQuery} setSearchQuery={setSearchQuery}
        searchSemester={searchSemester} setSearchSemester={setSearchSemester}
        fileTypeFilter={fileTypeFilter} setFileTypeFilter={setFileTypeFilter}
        searchYear={searchYear} setSearchYear={setSearchYear}
        availableYears={availableYears}
        loading={loading} error={error} view={view}
        currentDept={currentDept} currentSem={currentSem}
        currentCourseCode={currentCourseCode} currentCourseTitle={currentCourseTitle}
        currentMidFinal={currentMidFinal} currentCat={currentCat}
        goHome={goHome} navigateToDepartment={navigateToDepartment}
        navigateToSemester={navigateToSemester} navigateToCourse={navigateToCourse}
        navigateToMidFinal={navigateToMidFinal} navigateToCategory={navigateToCategory}
      />
      {loading && (
        <PageLoader fullScreen />
      )}
      {error && (
        <div className="text-center py-10 text-dark-text2">
          <i className="fas fa-exclamation-triangle text-2xl text-yellow-500 mb-2 block"></i>
          <p>{error}</p>
          <button className="mt-3 px-4 py-2 rounded-xl border border-dark-border bg-dark-bg3 text-dark-text text-sm font-semibold" onClick={() => loadTree(session?.accessToken || '')}>
            <i className="fas fa-sync"></i> Retry
          </button>
        </div>
      )}
      {!loading && !error && !isSearching && view === 'departments' && (
        <DepartmentsView
          departments={departments} onboardData={onboardData}
          userDeptId={userDeptId} clearOnboarding={clearOnboarding}
          navigateToDepartment={navigateToDepartment}
        />
      )}

      {!loading && !error && !isSearching && view === 'semesters' && (
        <SemestersView
          currentDept={currentDept} goBack={goBack}
          onboardData={onboardData} clearOnboarding={clearOnboarding}
          isMySemesterOnly={!!isMySemesterOnly} personalizedSemesters={personalizedSemesters}
          userSemesterId={userSemesterId} navigateToSemester={navigateToSemester}
        />
      )}
      {!loading && !error && !isSearching && view === 'courses' && (isRelatedSem ? (
        <RelatedFolderView
          relFolder={currentSem || ''}
          label={relatedLabel}
          departmentId={currentDept}
          onExit={goBack}
          onOpenFile={openFile}
          filePerms={filePerms}
          onMove={(p, n, m) => setMoveTarget({ path: p, name: n, mode: m })}
          onCopy={(p, n, m) => setMoveTarget({ path: p, name: n, mode: m })}
          onRename={(p, n) => setRenameTarget({ path: p, name: n })}
          onDelete={(p, n) => setDeleteConfirm({ path: p, name: n })}
          onShare={handleFileShare}
          actionLoading={actionLoading}
          canCreateFolder={canCreateFolder}
          onCreateFolderAt={(rp) => { setRelatedCreatePath(rp); setShowCreateFolder(true); }}
          canDeleteFolder={!!session?.user}
          onDeleteFolder={(t) => setDeleteConfirm({ ...t, kind: 'folder' })}
          canUpload={!!session?.user}
          onUploadFiles={handleQuickUpload}
          uploading={quickUploading}
        />
      ) : (
        <CoursesView
          semesterCourses={semesterCourses} filteredCourses={filteredCourses}
          coursePerms={coursePerms} navigateToCourse={navigateToCourse}
          goBack={goBack} setShowAddCourse={setShowAddCourse}
          dbCourses={dbCourses} userEmail={email}
          currentDept={currentDept} currentSem={currentSem}
          userDeptId={userDeptId} isOwner={isOwner}
        />
      ))}
      {!loading && !error && !isSearching && view === 'categories' && (
        <CategoriesView
          currentMidFinal={currentMidFinal} goBack={goBack}
          filteredCategories={courseCategories}
          navigateToMidFinal={navigateToMidFinal} navigateToCategory={navigateToCategory}
        />
      )}
      {!loading && !error && !isSearching && view === 'files' && currentSem && currentCat && (
        <SubFolderView
          subfolders={subfolderContents.subfolders}
          files={filteredFiles}
          subPathSegments={subPathSegments}
          onOpenFolder={navigateToSubFolder}
          onGoBack={goBack}
          onOpenFile={openFile}
          filePerms={filePerms}
          onMove={(p, n, m) => setMoveTarget({ path: p, name: n, mode: m })}
          onCopy={(p, n, m) => setMoveTarget({ path: p, name: n, mode: m })}
          onRename={(p, n) => setRenameTarget({ path: p, name: n })}
          onDelete={(p, n) => setDeleteConfirm({ path: p, name: n })}
          onShare={handleFileShare}
          actionLoading={actionLoading}
          canCreateFolder={canCreateFolder}
          onCreateFolder={() => setShowCreateFolder(true)}
          canDeleteFolder={!!session?.user}
          onDeleteFolder={(t) => setDeleteConfirm({ ...t, kind: 'folder' })}
        />
      )}
      {!loading && !error && isSearching && (
        <section className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[1.05rem] font-semibold flex items-center gap-2">
              <i className="fas fa-search"></i> Search Results
              <span className="text-[0.75rem] text-dark-text2 font-normal">({searchResults.files.length} files, {searchResults.folders.length} folders)</span>
            </h3>
            <button className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold" onClick={() => { resetFilters(); goHome(); }}>
              <i className="fas fa-times"></i> Clear
            </button>
          </div>
          {searchResults.folders.length > 0 && (
            <div className="mb-4">
              <h4 className="text-[0.82rem] font-semibold text-dark-text2 mb-2"><i className="fas fa-folder mr-1.5"></i> Matching Folders</h4>
              <div className="flex flex-col gap-2">
                {searchResults.folders.map((folder: any) => (
                  <FolderCard key={folder.path} folder={folder} onClick={() => {
                    if (folder.type === 'semester') navigateToSemester(folder.id);
                    else if (folder.type === 'category') navigateToCategory(folder.id);
                    else if (folder.type === 'course') {
                      const parts = folder.path.split('/');
                      navigateToSemester(parts[0]);
                      setTimeout(() => navigateToCourse(folder.id, folder.id), 0);
                    }
                  }} />
                ))}
              </div>
            </div>
          )}
          {searchResults.files.length > 0 && (
            <div>
              <h4 className="text-[0.82rem] font-semibold text-dark-text2 mb-2"><i className="fas fa-file mr-1.5"></i> Matching Files</h4>
              <FileGrid items={searchResults.files} onOpen={openFile} filePerms={filePerms}
                onMove={(p, n, m) => setMoveTarget({ path: p, name: n, mode: m })}
                onCopy={(p, n, m) => setMoveTarget({ path: p, name: n, mode: m })}
                onRename={(p, n) => setRenameTarget({ path: p, name: n })}
                onDelete={(p, n) => setDeleteConfirm({ path: p, name: n })}
                onShare={handleFileShare}
                actionLoading={actionLoading} />
            </div>
          )}
          {searchResults.files.length === 0 && searchResults.folders.length === 0 && (
            <div className="text-center py-8 text-dark-text2">
              <i className="fas fa-search text-3xl mb-3 block opacity-40"></i>
              <p>No results match your search.</p>
            </div>
          )}
        </section>
      )}
      {!loading && !error && view === 'semesters' && (
        <div className="mt-8 bg-gradient-to-br from-qsis/5 to-accent/5 border border-qsis/20 rounded-2xl p-6 text-center">
          <h4 className="text-[1.05rem] font-bold text-dark-text mb-2"><i className="fas fa-heart text-red-400 mr-2"></i>Support Our Work</h4>
          <p className="text-[0.82rem] text-dark-text2 max-w-md mx-auto">If this project helps you, please give us a star on GitHub. It motivates us to keep building and maintaining this resource for the IIUC community.</p>
        </div>
      )}
      {!loading && !error && currentDept && currentSem && currentCourseCode && (view === 'categories' || view === 'files') && (
        <div className="mt-6">
          <ReadmeEditor
            folder={view === 'files' && currentMidFinal && currentCat
              ? `${getDepartmentFolder(currentDept)}/${currentSem}/${currentCourseCode} - ${currentCourseTitle}/${currentMidFinal}/${config.categories[currentCat]?.folder || currentCat}${currentSubPath ? '/' + currentSubPath : ''}`
              : `${getDepartmentFolder(currentDept)}/${currentSem}/${currentCourseCode} - ${currentCourseTitle}${currentMidFinal ? '/' + currentMidFinal : ''}`
            }
            isOwner={isOwner}
            isLoggedIn={!!session}
            canEdit={coursePerms.canEditLinks}
          />
        </div>
      )}
      </>
      )}

      {/* ── Star Repos Section ─────────────────────────────────── */}
      {!loading && !error && view === 'semesters' && (
        <div className="mt-8 mb-6 border border-dark-border rounded-2xl p-5 bg-gradient-to-br from-dark-bg2 to-dark-bg3 text-center">
          <i className="fab fa-github text-2xl text-dark-text2 mb-2 block"></i>
          <h4 className="text-[0.95rem] font-bold text-dark-text mb-1">Star Our Repos</h4>
          <p className="text-[0.75rem] text-dark-text2 mb-4 max-w-sm mx-auto">If this project helps you, give us a star — it motivates us to keep building for the IIUC community.</p>
          <div className="flex flex-col sm:flex-row items-stretch justify-center gap-3 max-w-lg mx-auto">
            <a href={config.sourceRepoUrl()} target="_blank" rel="noopener noreferrer"
              className=" flex flex-col items-center gap-1 px-4 py-3 rounded-xl bg-dark-bg border border-dark-border hover:border-qsis/50 hover:bg-qsis/5 transition-all no-underline">
              <div className="flex items-center gap-1.5">
                <i className="fas fa-star text-yellow-400 text-[0.7rem]"></i>
                <span className="text-[0.82rem] font-semibold text-dark-text">IIUC-ARMS v2</span>
              </div>
              <span className="text-[0.65rem] text-dark-text3 leading-tight">Web app source code<br/>Browse, Upload, Studio, Routine</span>
            </a>
            <a href={config.dataRepoUrl()} target="_blank" rel="noopener noreferrer"
              className=" flex flex-col items-center gap-1 px-4 py-3 rounded-xl bg-dark-bg border border-dark-border hover:border-orange-400/50 hover:bg-orange-500/5 transition-all no-underline">
              <div className="flex items-center gap-1.5">
                <i className="fas fa-star text-yellow-400 text-[0.7rem]"></i>
                <span className="text-[0.82rem] font-semibold text-dark-text">Academic Files</span>
              </div>
              <span className="text-[0.65rem] text-dark-text3 leading-tight">All course materials live here<br/>PDFs, notes, routines, schedules</span>
            </a>
            {config.githubStarRepos.slice(2).map(repo => (
              <a key={repo.repo} href={`https://github.com/${repo.owner}/${repo.repo}`} target="_blank" rel="noopener noreferrer"
                className="flex flex-col items-center gap-1 px-4 py-3 rounded-xl bg-dark-bg border border-dark-border hover:border-purple-400/50 hover:bg-purple-500/5 transition-all no-underline">
                <div className="flex items-center gap-1.5">
                  <i className="fas fa-star text-yellow-400 text-[0.7rem]"></i>
                  <span className="text-[0.82rem] font-semibold text-dark-text">{repo.label}</span>
                </div>
                <span className="text-[0.65rem] text-dark-text3 leading-tight">Studio themes &amp; community<br/>designs for IIUC-ARMS</span>
              </a>
            ))}
          </div>
        </div>
      )}

      <BrowseModals
        moveTarget={moveTarget} setMoveTarget={setMoveTarget}
        renameTarget={renameTarget} setRenameTarget={setRenameTarget}
        deleteConfirm={deleteConfirm} setDeleteConfirm={setDeleteConfirm}
        showAddCourse={showAddCourse} setShowAddCourse={setShowAddCourse}
        currentDept={currentDept} currentSem={currentSem}
        onAddCourse={handleAddCourse}
        permissionDenied={permissionDenied} setPermissionDenied={setPermissionDenied}
        handleFileAction={handleFileAction}
        canDeleteFile={filePerms.delete}
        canDeleteFolder={filePerms.folderDelete}
      />
      {(() => {
        const deptFolder = getDepartmentFolder(currentDept);
        const courseFolder = currentCourseCode && currentCourseTitle ? `${currentCourseCode} - ${currentCourseTitle}` : '';
        const catFolder = currentCat ? config.categories[currentCat as keyof typeof config.categories]?.folder || currentCat : '';
        const parentPath = isRelatedSem
          ? [isRelatedKitabs ? config.relatedKitabsParent : getFacultyIdForDepartment(currentDept) || deptFolder || currentDept, currentSem, relatedCreatePath].filter(Boolean).join('/')
          : [deptFolder, currentSem, courseFolder, currentMidFinal, catFolder, currentSubPath].filter(Boolean).join('/');
        return (
          <CreateFolderModal
            isOpen={showCreateFolder}
            onClose={() => setShowCreateFolder(false)}
            parentPath={parentPath}
            onCreate={handleCreateFolder}
          />
        );
      })()}
      {shareItem && <ShareModal item={shareItem} onClose={() => setShareItem(null)} />}
    </>
  );
}
