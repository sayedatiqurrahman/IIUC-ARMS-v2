'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useRef, useCallback } from 'react';
import { config } from '@/lib/config';
import { FACULTIES, getDepartmentFolder } from '@/lib/departments';
import { useAppStore } from '@/lib/store';
import { getMimeFromExt, extractYear, showToast } from '@/lib/utils';
import ReadmeEditor from '@/components/ReadmeEditor';
import { CreateCourseResult } from '@/components/upload';
import {
  BrowseHeader, BrowseModals, PageHeader, FileGrid, FolderCard,
  DepartmentsView, SemestersView, CoursesView, CategoriesView,
} from '@/components/browse';
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
  const [filePerms, setFilePerms] = useState<Record<string, boolean>>({});
  const [coursePerms, setCoursePerms] = useState({ canAdd: false, canEdit: false, canDelete: false, canEditLinks: false });
  const [moveTarget, setMoveTarget] = useState<{ path: string; name: string; mode: 'move' | 'copy' } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ path: string; name: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ path: string; name: string } | null>(null);
  const [actionLoading, setActionLoading] = useState('');
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState<{ show: boolean; message: string; contact: string }>({ show: false, message: '', contact: '' });
  const loading = useAppStore(s => s.loading);
  const error = useAppStore(s => s.error);
  const onboardData = useAppStore(s => s.onboardingData);
  const clearOnboarding = useAppStore(s => s.clearOnboarding);
  const prevOnboardDataRef = useRef(onboardData);
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
  const goBack = useAppStore(s => s.goBack);
  const openFile = useAppStore(s => s.openFile);
  const openRecentFile = useAppStore(s => s.openRecentFile);
  const getSemesters = useAppStore(s => s.getSemesters);
  const getSemesterCourses = useAppStore(s => s.getSemesterCourses);
  const getCourseCategories = useAppStore(s => s.getCourseCategories);
  const getCourseMidFinal = useAppStore(s => s.getCourseMidFinal);
  const getUploadTree = useAppStore(s => s.getUploadTree);
  const getSearchResults = useAppStore(s => s.getSearchResults);
  const getUploadDepartments = useAppStore(s => s.getUploadDepartments);
  const currentDept = useAppStore(s => s.currentDept);
  const currentCourseCode = useAppStore(s => s.currentCourseCode);
  const currentCourseTitle = useAppStore(s => s.currentCourseTitle);
  const currentMidFinal = useAppStore(s => s.currentMidFinal);
  useEffect(() => {
    loadCourses();
    setShowWelcome(localStorage.getItem('qs-welcome-dismissed') !== 'true');
    setMounted(true);
  }, []);
  useEffect(() => {
    if (!email) return;
    const role = config.getEffectiveRole(email);
    const isCR = profile.isCR || false;
    const loadPerms = async () => {
      try {
        const res = await fetch('/api/settings/permissions');
        const data = await res.json();
        if (!data.success) return;
        const perms = data.permissions || {};
        const customPerms = (profile as any).customPermissions || {};
        const check = (action: string) => {
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
        });
        setCoursePerms({
          canAdd: check('addCourse'),
          canEdit: check('editCourse'),
          canDelete: check('deleteCourse'),
          canEditLinks: check('editLinks'),
        });
      } catch {}
    };
    loadPerms();
  }, [email, profile.isCR]);
  const handleFileAction = useCallback(async (action: string, from: string, to?: string, newName?: string) => {
    setActionLoading(action + from);
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
        useAppStore.getState().invalidateTreeCache();
        loadTree(session?.accessToken || '');
      }
      return data;
    } catch (e: any) {
      showToast(e.message || 'Action failed', 'error');
      throw e;
    } finally {
      setActionLoading('');
    }
  }, [session?.accessToken, loadTree]);
  const handleAddCourse = useCallback(async (code: string, title: string): Promise<CreateCourseResult> => {
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
      useAppStore.getState().invalidateTreeCache();
      useAppStore.getState().invalidateCoursesCache();
      useAppStore.getState().loadCourses();
      loadTree(session?.accessToken || '');
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || 'Failed to create course' };
    }
  }, [currentDept, currentSem, session?.accessToken, loadTree]);
  useEffect(() => {
    if (!mounted) return;
    const p = new URLSearchParams(window.location.search);
    const dept = p.get('dept');
    if (!dept) return;
    const sem = p.get('sem') || '';
    const course = p.get('course') || '';
    const mf = p.get('mf') || '';
    const cat = p.get('cat') || '';
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
                        setTimeout(() => { deepLinkingRef.current = false; }, delay);
                      }, 150);
                    } else {
                      setTimeout(() => { deepLinkingRef.current = false; }, delay);
                    }
                  }, 150);
                } else if (cat) {
                  setTimeout(() => {
                    const catKey = Object.keys(config.categories).find(k => config.categories[k as keyof typeof config.categories].label.toLowerCase() === cat.toLowerCase() || k === cat);
                    if (catKey) useAppStore.getState().navigateToCategory(catKey);
                    setTimeout(() => { deepLinkingRef.current = false; }, delay);
                  }, 150);
                } else {
                  setTimeout(() => { deepLinkingRef.current = false; }, delay);
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
                            setTimeout(() => { deepLinkingRef.current = false; }, delay);
                          }, 150);
                        } else {
                          setTimeout(() => { deepLinkingRef.current = false; }, delay);
                        }
                      }, 150);
                    } else if (cat) {
                      setTimeout(() => {
                        const catKey = Object.keys(config.categories).find(k => config.categories[k as keyof typeof config.categories].label.toLowerCase() === cat.toLowerCase() || k === cat);
                        if (catKey) useAppStore.getState().navigateToCategory(catKey);
                        setTimeout(() => { deepLinkingRef.current = false; }, delay);
                      }, 150);
                    } else {
                      setTimeout(() => { deepLinkingRef.current = false; }, delay);
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

  useEffect(() => {
    if (!mounted) return;
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('dept')) return;
    const prevData = prevOnboardDataRef.current;
    prevOnboardDataRef.current = onboardData;
    if (!prevData && onboardData && view === 'departments') {
      if (userDeptId) {
        navigateToDepartment(userDeptId);
        const semId = onboardData.semester
          ? config.semesters.find(s => s.label === onboardData.semester)?.id
          : null;
        if (semId && semId !== 'graduated') {
          setTimeout(() => {
            useAppStore.getState().navigateToSemester(semId);
          }, 150);
        }
      }
    }
  }, [onboardData, mounted]);
  useEffect(() => {
    if (!mounted || loading) return;
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('dept')) return;
    const dept = onboardData?.department || profile.department || '';
    if (!dept || view !== 'departments') return;
    const target = FACULTIES.flatMap(f => f.departments).find(d => d.name === dept || d.id === dept);
    if (target) {
      navigateToDepartment(target.id);
      const semId = onboardData?.semester
        ? config.semesters.find(s => s.label === onboardData.semester)?.id
        : profile.semester;
      if (semId && semId !== 'graduated') {
        setTimeout(() => {
          const { navigateToSemester } = useAppStore.getState();
          navigateToSemester(semId);
        }, 200);
      }
    }
  }, [mounted, loading]);
  const prevSemesterRef = useRef(profile.semester);
  useEffect(() => {
    if (!mounted || loading) return;
    const newSem = profile.semester;
    const oldSem = prevSemesterRef.current;
    prevSemesterRef.current = newSem;
    if (!newSem || newSem === 'graduated' || newSem === oldSem) return;
    const { currentDept, view: currentView } = useAppStore.getState();
    if (currentDept && (currentView === 'courses' || currentView === 'semesters')) {
      const { navigateToSemester } = useAppStore.getState();
      navigateToSemester(newSem);
    }
  }, [profile.semester, mounted, loading]);
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
      params.set('dept', currentDept);
    } else if (view === 'courses' && currentDept && currentSem) {
      params.set('dept', currentDept);
      params.set('sem', currentSem);
    } else if (view === 'categories' && currentDept && currentSem && currentCourseCode) {
      params.set('dept', currentDept);
      params.set('sem', currentSem);
      params.set('course', currentCourseCode);
      if (currentMidFinal) params.set('mf', currentMidFinal);
    } else if (view === 'files' && currentDept && currentSem && currentCourseCode && currentCat) {
      params.set('dept', currentDept);
      params.set('sem', currentSem);
      params.set('course', currentCourseCode);
      if (currentMidFinal) params.set('mf', currentMidFinal);
      const catMeta = config.categories[currentCat as keyof typeof config.categories];
      params.set('cat', catMeta?.label || currentCat);
    } else if (isSearching && searchQuery) {
      params.set('q', searchQuery);
    }
    const qs = params.toString();
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState({}, '', url);
  }, [mounted, view, currentDept, currentSem, currentCourseCode, currentCat, currentMidFinal, searchQuery, isSearching]);
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
  const filteredFiles = (() => {
    if (!currentCat || !currentCourseCode || !currentSem) return [];
    const cat = courseCategories.find(c => c.key === currentCat);
    if (!cat) return [];
    return cat.files.filter((f: any) => {
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
        <div className="loading-container">
          <div className="book-loader">
            <div className="book-base"></div>
            <div className="book-spine-loader"></div>
            <div className="book-cover"></div>
            <div className="book-page-stack">
              <div className="book-page"></div>
              <div className="book-page"></div>
              <div className="book-page"></div>
            </div>
            <div className="page-shadow"></div>
            <div className="page-shadow"></div>
            <div className="page-shadow"></div>
          </div>
          <div className="loading-text">Loading academic resources<span className="loading-dots"></span></div>
        </div>
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
      {!loading && !error && !isSearching && view === 'courses' && (
        <CoursesView
          semesterCourses={semesterCourses} filteredCourses={filteredCourses}
          coursePerms={coursePerms} navigateToCourse={navigateToCourse}
          goBack={goBack} setShowAddCourse={setShowAddCourse}
          dbCourses={dbCourses} userEmail={email}
          currentDept={currentDept} currentSem={currentSem}
        />
      )}
      {!loading && !error && !isSearching && view === 'categories' && (
        <CategoriesView
          currentMidFinal={currentMidFinal} goBack={goBack}
          filteredCategories={courseCategories}
          navigateToMidFinal={navigateToMidFinal} navigateToCategory={navigateToCategory}
        />
      )}
      {!loading && !error && !isSearching && view === 'files' && currentSem && currentCat && (
        <section className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[1.05rem] font-semibold flex items-center gap-2"><i className="fas fa-folder-open"></i> Files</h3>
            <button className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold" onClick={goBack}>
              <i className="fas fa-arrow-left"></i> Back
            </button>
          </div>
          {filteredFiles.length === 0 && (
            <div className="text-center py-8 text-dark-text2">
              <i className="fas fa-search text-3xl mb-3 block opacity-40"></i>
              <p>No files match your search.</p>
            </div>
          )}
          <FileGrid items={filteredFiles} onOpen={openFile} filePerms={filePerms}
            onMove={(p, n, m) => setMoveTarget({ path: p, name: n, mode: m })}
            onCopy={(p, n, m) => setMoveTarget({ path: p, name: n, mode: m })}
            onRename={(p, n) => setRenameTarget({ path: p, name: n })}
            onDelete={(p, n) => setDeleteConfirm({ path: p, name: n })}
            actionLoading={actionLoading} />
        </section>
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
          <p className="text-[0.82rem] text-dark-text2 mb-4 max-w-md mx-auto">If this project helps you, please give us a star on GitHub. It motivates us to keep building and maintaining this resource for the IIUC community.</p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <a href="https://github.com/sayedatiqurrahman/QSIS-ARMS-v2" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-qsis to-accent text-white font-semibold text-[0.85rem] no-underline hover:shadow-[0_4px_20px_rgba(34,197,94,0.3)] hover:scale-105 transition-all">
               <i className="fas fa-star"></i> Star IIUC-ARMS v2<span className="text-[0.7rem] opacity-80">(Web App)</span>
            </a>
            <a href="https://github.com/sayedatiqurrahman/QSIS-ACADEMIC-FILES-MANAFGER" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-yellow-500 text-white font-semibold text-[0.85rem] no-underline hover:shadow-[0_4px_20px_rgba(249,115,22,0.3)] hover:scale-105 transition-all">
              <i className="fas fa-star"></i> Star Academic Files<span className="text-[0.7rem] opacity-80">(Data Repo)</span>
            </a>
          </div>
          <p className="text-[0.72rem] text-dark-text2 mt-3"><i className="fas fa-code-branch mr-1"></i>Fork either repo to contribute — check out the README for guidelines!</p>
        </div>
      )}
      {!loading && !error && currentDept && currentSem && currentCourseCode && (view === 'categories' || view === 'files') && (
        <div className="mt-6">
          <ReadmeEditor
            folder={view === 'files' && currentMidFinal && currentCat
              ? `${getDepartmentFolder(currentDept)}/${currentSem}/${currentCourseCode} - ${currentCourseTitle}/${currentMidFinal}/${config.categories[currentCat]?.folder || currentCat}`
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
      <BrowseModals
        moveTarget={moveTarget} setMoveTarget={setMoveTarget}
        renameTarget={renameTarget} setRenameTarget={setRenameTarget}
        deleteConfirm={deleteConfirm} setDeleteConfirm={setDeleteConfirm}
        showAddCourse={showAddCourse} setShowAddCourse={setShowAddCourse}
        currentDept={currentDept} currentSem={currentSem}
        onAddCourse={handleAddCourse}
        permissionDenied={permissionDenied} setPermissionDenied={setPermissionDenied}
        handleFileAction={handleFileAction}
      />
    </>
  );
}
