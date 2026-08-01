'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useRef, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { config } from '@/lib/config';
import { FACULTIES } from '@/lib/departments';
import { useAppStore } from '@/lib/store';
import { getMimeFromExt, getFileIconByType, esc, timeAgo, extractYear, showToast } from '@/lib/utils';
import ReadmeEditor from '@/components/ReadmeEditor';
import FileActionsMenu from '@/components/FileActionsMenu';
import MoveModal from '@/components/MoveModal';
import RenameModal from '@/components/RenameModal';
import CustomSelect from '@/components/CustomSelect';

export default function BrowsePage() {
  const { data: session } = useSession();
  const profile = useAppStore(s => s.profile);
  const [mounted, setMounted] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);

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
  const [addCourseCode, setAddCourseCode] = useState('');
  const [addCourseTitle, setAddCourseTitle] = useState('');
  const [addCourseLoading, setAddCourseLoading] = useState(false);
  const [addCourseError, setAddCourseError] = useState('');
  const [addCourseSuccess, setAddCourseSuccess] = useState('');
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
    loadTree(session?.accessToken || '');
    loadCourses();
    setShowWelcome(localStorage.getItem('qs-welcome-dismissed') !== 'true');
    setMounted(true);
  }, []);

  // Load file action permissions
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
        const check = (action: string) => {
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

  const hasAnyFileAction = filePerms.move || filePerms.copy || filePerms.rename || filePerms.delete;

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

  // Deep-link: read URL params on load
  useEffect(() => {
    if (!mounted || loading) return;
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    const dept = params.get('dept');
    const sem = params.get('sem');
    const course = params.get('course');
    const mf = params.get('mf');
    const cat = params.get('cat');

    if (q) {
      setSearchQuery(q);
      return;
    }

    if (dept && view === 'departments') {
      navigateToDepartment(dept);
      if (sem) {
        setTimeout(() => {
          const { navigateToSemester: navSem } = useAppStore.getState();
          navSem(sem);
          if (course) {
            setTimeout(() => {
              const { getSemesterCourses: getCourses, navigateToCourse: navCourse } = useAppStore.getState();
              const courses = getCourses(sem, dept);
              const found = courses.find(c => c.code.toUpperCase() === course.toUpperCase());
              if (found) {
                navCourse(found.code, found.title);
                if (mf) {
                  setTimeout(() => {
                    const { navigateToMidFinal } = useAppStore.getState();
                    navigateToMidFinal(mf);
                  }, 200);
                }
                if (cat) {
                  setTimeout(() => {
                    const catKey = Object.keys(config.categories).find(k => config.categories[k as keyof typeof config.categories].label.toLowerCase() === cat.toLowerCase() || k === cat);
                    if (catKey) navigateToCategory(catKey);
                  }, mf ? 300 : 200);
                }
              } else {
                setTimeout(() => {
                  const retryCourses = useAppStore.getState().getSemesterCourses(sem, dept);
                  const retryFound = retryCourses.find(c => c.code.toUpperCase() === course.toUpperCase());
                  if (retryFound) {
                    useAppStore.getState().navigateToCourse(retryFound.code, retryFound.title);
                    if (mf) {
                      setTimeout(() => useAppStore.getState().navigateToMidFinal(mf), 200);
                    }
                    if (cat) {
                      setTimeout(() => {
                        const catKey = Object.keys(config.categories).find(k => config.categories[k as keyof typeof config.categories].label.toLowerCase() === cat.toLowerCase() || k === cat);
                        if (catKey) useAppStore.getState().navigateToCategory(catKey);
                      }, mf ? 300 : 200);
                    }
                  }
                }, 500);
              }
            }, 300);
          }
        }, 300);
      }
    }
  }, [mounted, loading]);

  // Auto-navigate to user's department after onboarding completes
  useEffect(() => {
    if (!mounted) return;
    const prevData = prevOnboardDataRef.current;
    prevOnboardDataRef.current = onboardData;
    if (!prevData && onboardData && userDeptId && view === 'departments') {
      navigateToDepartment(userDeptId);
      // Also navigate into the user's semester
      const semId = onboardData.semester
        ? config.semesters.find(s => s.label === onboardData.semester)?.id
        : null;
      if (semId && semId !== 'graduated') {
        setTimeout(() => {
          const { navigateToSemester } = useAppStore.getState();
          navigateToSemester(semId);
        }, 150);
      }
    }
  }, [onboardData, mounted]);

  // Auto-navigate returning users into their department on page load (only if no URL params / personalized)
  useEffect(() => {
    if (!mounted || loading) return;
    const urlParams = new URLSearchParams(window.location.search);
    const hasUrlParams = urlParams.has('dept') || urlParams.has('q');
    if (hasUrlParams) return;
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

  // Auto-navigate when user updates semester from dashboard
  const prevSemesterRef = useRef(profile.semester);
  useEffect(() => {
    if (!mounted || loading) return;
    const newSem = profile.semester;
    const oldSem = prevSemesterRef.current;
    prevSemesterRef.current = newSem;
    if (!newSem || newSem === 'graduated' || newSem === oldSem) return;
    // Only re-navigate if already inside a department
    const { currentDept, view: currentView } = useAppStore.getState();
    if (currentDept && (currentView === 'courses' || currentView === 'semesters')) {
      const { navigateToSemester } = useAppStore.getState();
      navigateToSemester(newSem);
    }
  }, [profile.semester, mounted, loading]);

  // Onboarding-based personalization
  const userSemesterId = onboardData
    ? config.semesters.find(s => s.label === onboardData.semester)?.id
    : null;
  const isMySemesterOnly = onboardData?.fileView === 'my-semester-only' && userSemesterId;

  // Department-based personalization: find department ID from onboarding name
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

  // Sync URL params on navigation
  useEffect(() => {
    if (!mounted) return;
    const params = new URLSearchParams();
    if (view === 'departments') {
      // root — no params
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
  }, [mounted, view, currentDept, currentSem, currentCourseCode, currentCat, searchQuery, isSearching]);

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

  // Apply onboarding sorting/filtering to semesters
  const personalizedSemesters = (() => {
    if (!userSemesterId) return filteredSemesters;
    if (isMySemesterOnly) {
      // Only show user's semester + related kitabs + related sources
      return filteredSemesters.filter(s => s.id === userSemesterId || s.isRelated || s.id === config.relatedSourcesFolder);
    }
    // all-prioritized: sort user's semester to top (non-related only)
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

  const filteredCategories = courseCategories;

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
      {/* Hero Section — always visible */}
      <section className="text-center py-6 mb-4">
        <div className="mb-3">
          <Image src="/arms-logo-icon.png" alt="IIUC-ARMS" width={150} height={150} className="w-28 h-28 p-2 rounded-lg border-2 border-qsis mx-auto object-contain bg-white mb-3" />
        </div>
        <h2 className="text-[1.5rem] font-extrabold bg-gradient-to-br from-qsis to-accent bg-clip-text text-transparent mb-1">IIUC-ARMS</h2>
        <p className="text-gray-500 text-[0.85rem]">IIUC Academic Resource Management System</p>
        <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
          <span className="text-[0.75rem] text-gray-400">Developed by <Link href="https://atiq.is-a.dev" target="_blank" className="no-underline"> <strong className="text-qsis">Sayed Atiqur Rahman</strong> </Link> &mdash; QSIS, IIUC</span>
        </div>
      </section>

      {/* Welcome Banner for Teachers & Admins */}
      {view === 'departments' && !searchQuery && isPrivileged && showWelcome && (
        <section className="max-w-[700px] mx-auto mb-5 p-4 rounded-xl border border-qsis/20 bg-gradient-to-r from-qsis/5 to-accent/5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[1rem] font-semibold text-dark-text mb-1">
                Assalamu Alaikum{userName ? `, ${userRole === 'teacher' ? 'Sir' : userRole === 'admin' ? 'Sir' : ''}` : ''} {userName || ''} 
              </p>
              <p className="text-[0.82rem] text-dark-text2 leading-relaxed">
                Welcome to <strong className="text-qsis">IIUC-ARMS</strong>. In sha Allah, we hope you will enjoy exploring the site.
              </p>
              <p className="text-[0.78rem] text-dark-text3 mt-1">
                {userRole === 'admin' ? (
                  <>You have <strong className="text-green-400">full admin access</strong> &mdash; routine management, publishing, file uploads, and activity monitoring.</>
                ) : (
                  <>You have <strong className="text-green-400">routine management access</strong> and <strong className="text-green-400">publishable access</strong> for all branches.</>
                )}
              </p>
            </div>
            <button onClick={() => { setShowWelcome(false); localStorage.setItem('qs-welcome-dismissed', 'true'); }} className="text-dark-text3 hover:text-dark-text text-sm ml-3 mt-1 flex-shrink-0" title="Dismiss">
              <i className="fas fa-times"></i>
            </button>
          </div>
        </section>
      )}

      {/* Stats */}
      {!isSearching && view === 'departments' && (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-[700px] mx-auto mb-6">
          <div className="bg-dark-bg2 border border-dark-border rounded-xl p-3.5 text-center">
            <div className="text-[1.3rem] font-bold text-qsis">{departments.length}</div>
            <div className="text-[0.7rem] text-dark-text2 mt-0.5">Departments</div>
          </div>
          <div className="bg-dark-bg2 border border-dark-border rounded-xl p-3.5 text-center">
            <div className="text-[1.3rem] font-bold text-accent">8</div>
            <div className="text-[0.7rem] text-dark-text2 mt-0.5">Semesters</div>
          </div>
          <div className="bg-dark-bg2 border border-dark-border rounded-xl p-3.5 text-center">
            <div className="text-[1.3rem] font-bold text-yellow-400">{departments.reduce((s, d) => s + d.files, 0)}</div>
            <div className="text-[0.7rem] text-dark-text2 mt-0.5">Files</div>
          </div>
          <div className="bg-dark-bg2 border border-dark-border rounded-xl p-3.5 text-center">
            <div className="text-[1.3rem] font-bold text-pink-400">{recentReads.length}</div>
            <div className="text-[0.7rem] text-dark-text2 mt-0.5">Recent Reads</div>
          </div>
        </section>
      )}

      {/* Recent Reads */}
      {view === 'semesters' && recentReads.length > 0 && (
        <section className="max-w-[1200px] mx-auto mb-5">
          <h3 className="text-base font-semibold flex items-center gap-2 mb-3"><i className="fas fa-clock"></i> Recent Reads</h3>
          <div className="grid grid-cols-1 md:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5">
            {recentReads.map((item: any) => (
              <div key={item.path} className="flex items-center gap-2.5 p-[10px_12px] bg-dark-bg3 border border-dark-border rounded-lg cursor-pointer hover:border-qsis hover:bg-dark-bg3/80 hover:-translate-y-px transition-all" onClick={() => openRecentFile(item)}>
                <div className="text-[1.4rem] flex-shrink-0">{getFileIconByType(item.mimeType)}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-[0.8rem] font-semibold whitespace-nowrap overflow-hidden text-ellipsis">{esc(item.name)}</div>
                  <div className="text-[0.7rem] text-dark-text2">{item.lastRead ? timeAgo(item.lastRead) : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Search & Filter Bar */}
      <div className="bg-dark-bg2 border border-dark-border rounded-xl p-1 mb-5">
        <div className="flex items-center gap-2.5 bg-dark-bg border border-dark-border rounded-lg px-3.5">
          <i className="fas fa-search text-dark-text2"></i>
          <input
            type="text"
            placeholder="Search files, courses, semesters..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent border-none text-dark-text py-2.5 text-[0.9rem] outline-none placeholder:text-dark-text2"
          />
          {searchQuery && (
            <button className="text-dark-text2 hover:text-dark-text cursor-pointer bg-transparent border-none text-[0.85rem] transition-colors" onClick={() => setSearchQuery('')} title="Clear search">
              <i className="fas fa-times-circle"></i>
            </button>
          )}
        </div>
        <div className="flex gap-2 p-2 flex-wrap">
          <CustomSelect
            value={searchSemester}
            onChange={setSearchSemester}
            placeholder="All Semesters"
            options={[
              { value: '', label: 'All Semesters' },
              ...config.semesters.map(s => ({ value: s.id, label: s.label })),
              { value: 'related-kitabs', label: 'Related Kitabs' },
              { value: config.relatedSourcesFolder, label: 'Related Sources' },
            ]}
          />
          <CustomSelect
            value={fileTypeFilter}
            onChange={setFileTypeFilter}
            placeholder="All Types"
            options={[
              { value: '', label: 'All Types' },
              { value: 'pdf', label: 'PDF', icon: 'fa-file-pdf' },
              { value: 'image', label: 'Image', icon: 'fa-file-image' },
              { value: 'doc', label: 'Document', icon: 'fa-file-word' },
              { value: 'sheet', label: 'Sheet (XLS)', icon: 'fa-file-excel' },
              { value: 'ppt', label: 'Presentation', icon: 'fa-file-powerpoint' },
            ]}
          />
          <CustomSelect
            value={searchYear}
            onChange={setSearchYear}
            placeholder="All Years"
            options={[
              { value: '', label: 'All Years' },
              { value: '2026', label: '2026' },
              { value: '2025', label: '2025' },
              { value: '2024', label: '2024' },
              { value: '2023', label: '2023' },
            ]}
          />
        </div>
      </div>

      {/* Directory Path */}
      {!loading && !error && view !== 'departments' && (() => {
        let deptLabel = currentDept;
        for (const f of FACULTIES) {
          const d = f.departments.find(dd => dd.id === currentDept);
          if (d) { deptLabel = d.shortName; break; }
        }
        const semLabel = config.semesters.find(s => s.id === currentSem)?.label || currentSem;
        return (
        <div className="flex items-center gap-1.5 text-[0.75rem] mb-4 px-1 flex-wrap">
          <button className="text-qsis cursor-pointer hover:underline bg-transparent border-none text-[0.75rem] font-semibold" onClick={goHome}>
            <i className="fas fa-home text-[0.65rem]"></i> Home
          </button>
          {currentDept && (
            <>
              <span className="text-dark-text2 text-[0.5rem]"><i className="fas fa-chevron-right"></i></span>
              <button className="text-qsis cursor-pointer hover:underline bg-transparent border-none text-[0.75rem]" onClick={() => navigateToDepartment(currentDept)}>
                {deptLabel}
              </button>
            </>
          )}
          {currentSem && (
            <>
              <span className="text-dark-text2 text-[0.5rem]"><i className="fas fa-chevron-right"></i></span>
              <button className="text-qsis cursor-pointer hover:underline bg-transparent border-none text-[0.75rem]" onClick={() => navigateToSemester(currentSem)}>
                {semLabel}
              </button>
            </>
          )}
          {currentCourseCode && (
            <>
              <span className="text-dark-text2 text-[0.5rem]"><i className="fas fa-chevron-right"></i></span>
              <span className="text-dark-text font-semibold text-[0.75rem]">{currentCourseCode}</span>
            </>
          )}
          {currentMidFinal && (
            <>
              <span className="text-dark-text2 text-[0.5rem]"><i className="fas fa-chevron-right"></i></span>
              <span className="text-dark-text text-[0.75rem]">{currentMidFinal}</span>
            </>
          )}
          {view === 'files' && currentCat && (
            <>
              <span className="text-dark-text2 text-[0.5rem]"><i className="fas fa-chevron-right"></i></span>
              <span className="text-dark-text text-[0.75rem]">{config.categories[currentCat as keyof typeof config.categories]?.label || currentCat}</span>
            </>
          )}
        </div>
        );
      })()}

      {/* Loading */}
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

      {/* Error */}
      {error && (
        <div className="text-center py-10 text-dark-text2">
          <i className="fas fa-exclamation-triangle text-2xl text-yellow-500 mb-2 block"></i>
          <p>{error}</p>
          <button className="mt-3 px-4 py-2 rounded-xl border border-dark-border bg-dark-bg3 text-dark-text text-sm font-semibold" onClick={() => loadTree(session?.accessToken || '')}>
            <i className="fas fa-sync"></i> Retry
          </button>
        </div>
      )}

      {/* Departments View — grouped by faculty */}
      {!loading && !error && !isSearching && view === 'departments' && (
        <section className="mb-5">
          {/* Edit Personalize Banner */}
          {onboardData && (
            <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl border border-qsis/30 bg-qsis/5 text-[0.8rem]">
              <i className="fas fa-user-cog text-qsis flex-shrink-0"></i>
              <span className="text-dark-text2">
                Viewing as <strong className="text-dark-text">{onboardData.department?.split(' ').slice(0, 3).join(' ')}</strong> &middot; <strong className="text-dark-text">{onboardData.semester}</strong>
                {onboardData.fileView === 'my-semester-only' ? ' (My Semester Only)' : ' (All Prioritized)'}
              </span>
              <button
                onClick={() => { clearOnboarding(); window.location.reload(); }}
                className="ml-auto px-3 py-1.5 rounded-lg bg-qsis/10 border border-qsis/30 text-qsis text-[0.75rem] font-semibold cursor-pointer hover:bg-qsis/20 transition-colors flex-shrink-0"
              >
                <i className="fas fa-edit mr-1"></i> Edit Personalize
              </button>
            </div>
          )}

          {(() => {
            // Filter departments based on onboarding preference
            let visibleDepts = departments;
            if (onboardData?.fileView === 'my-semester-only' && userDeptId) {
              visibleDepts = departments.filter(d => d.id === userDeptId);
            }

            // For "all-prioritized": sort user's department to top of its faculty, and that faculty first
            const sortedDepts = (() => {
              if (!userDeptId || onboardData?.fileView === 'my-semester-only') return visibleDepts;
              // Find user's faculty
              const userFacultyId = FACULTIES.find(f => f.departments.some(d => d.id === userDeptId))?.id;
              if (!userFacultyId) return visibleDepts;
              // Sort: user's dept first, then rest in normal order
              return [...visibleDepts].sort((a, b) => {
                if (a.id === userDeptId) return -1;
                if (b.id === userDeptId) return 1;
                const aFacIdx = FACULTIES.findIndex(f => f.departments.some(d => d.id === a.id));
                const bFacIdx = FACULTIES.findIndex(f => f.departments.some(d => d.id === b.id));
                if (aFacIdx !== bFacIdx) return aFacIdx - bFacIdx;
                const aFac = FACULTIES[aFacIdx];
                const bFac = FACULTIES[bFacIdx];
                const aDeptIdx = aFac?.departments.findIndex(d => d.id === a.id) ?? 0;
                const bDeptIdx = bFac?.departments.findIndex(d => d.id === b.id) ?? 0;
                return aDeptIdx - bDeptIdx;
              });
            })();

            // Group by faculty, prioritizing user's faculty
            const facultiesToShow = onboardData?.fileView === 'all-prioritized' && userDeptId
              ? [...FACULTIES].sort((a, b) => {
                  if (a.departments.some(d => d.id === userDeptId)) return -1;
                  if (b.departments.some(d => d.id === userDeptId)) return 1;
                  return 0;
                })
              : FACULTIES;

            if (sortedDepts.length === 0) {
              return (
                <div className="text-center py-8 text-dark-text2">
                  <i className="fas fa-folder-open text-3xl mb-3 block opacity-40"></i>
                  <p>No departments have files yet.</p>
                </div>
              );
            }

            return facultiesToShow.map(faculty => {
              const facDepts = sortedDepts.filter(d => {
                const fac = FACULTIES.find(f => f.id === faculty.id);
                return fac?.departments.some(dd => dd.id === d.id);
              });
              if (facDepts.length === 0) return null;
              const isUserFaculty = userDeptId && facDepts.some(d => d.id === userDeptId);
              return (
                <div key={faculty.id} className="mb-5 last:mb-0">
                  <div className="flex items-center gap-3 mb-2.5 pb-2 border-b border-dark-border/50">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-qsis/80 to-accent/80 flex items-center justify-center text-white text-[0.7rem] font-bold flex-shrink-0">
                      <i className="fas fa-graduation-cap"></i>
                    </div>
                    <div>
                      <div className="text-[0.95rem] font-bold text-dark-text">{faculty.name}</div>
                      <div className="text-[0.65rem] text-dark-text3">{faculty.shortName} &middot; {facDepts.length} departments</div>
                    </div>
                    {isUserFaculty && (
                      <span className="ml-auto text-[0.65rem] px-2 py-0.5 rounded-full bg-qsis/15 text-qsis font-semibold">Your Faculty</span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {facDepts.map((dept) => {
                      const isUserDept = dept.id === userDeptId;
                      return (
                        <div key={dept.id} className={`flex items-center gap-4 p-[18px_20px] bg-dark-bg2 border rounded-xl cursor-pointer hover:border-qsis hover:shadow-[0_0_20px_rgba(34,197,94,0.3)] hover:translate-x-1 transition-all ${isUserDept ? 'border-qsis/40 ring-1 ring-qsis/20' : 'border-dark-border'}`} onClick={() => navigateToDepartment(dept.id)}>
                          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-qsis to-accent flex items-center justify-center text-white text-[1rem] flex-shrink-0">
                            <i className={`fas ${dept.icon || 'fa-building'}`}></i>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[0.95rem] font-bold truncate flex items-center gap-2">
                              {dept.shortName}
                              {isUserDept && <span className="text-[0.6rem] px-1.5 py-0.5 rounded-full bg-qsis/15 text-qsis font-semibold">You</span>}
                            </div>
                            <div className="text-[0.7rem] text-dark-text2 truncate">{dept.name}</div>
                          </div>
                          <div className="text-[0.78rem] text-dark-text2 text-right flex-shrink-0">{dept.files} files</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            });
          })()}
        </section>
      )}

      {/* Semester View (inside a department) */}
      {!loading && !error && !isSearching && view === 'semesters' && (
        <section className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold flex items-center gap-2">
              <i className="fas fa-calendar"></i> 
              {currentDept ? (() => {
                for (const f of FACULTIES) {
                  const d = f.departments.find(dd => dd.id === currentDept);
                  if (d) return d.shortName;
                }
                return 'Semesters';
              })() : 'Select Semester'}
            </h3>
            <button className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold" onClick={() => goBack()}>
              <i className="fas fa-arrow-left"></i> All Departments
            </button>
          </div>

          {/* Edit preference banner */}
          {onboardData && (
            <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl border border-qsis/30 bg-qsis/5 text-[0.8rem]">
              <i className="fas fa-filter text-qsis flex-shrink-0"></i>
              <span className="text-dark-text2">
                {isMySemesterOnly ? (
                  <>Showing only <strong className="text-dark-text">{onboardData.semester}</strong> files.</>
                ) : (
                  <>Showing all semesters, <strong className="text-dark-text">{onboardData.semester}</strong> prioritized.</>
                )}
              </span>
              <button
                onClick={() => { clearOnboarding(); window.location.reload(); }}
                className="ml-auto px-3 py-1.5 rounded-lg bg-qsis/10 border border-qsis/30 text-qsis text-[0.75rem] font-semibold cursor-pointer hover:bg-qsis/20 transition-colors flex-shrink-0"
              >
                <i className="fas fa-edit mr-1"></i> Edit Personalize
              </button>
            </div>
          )}

          {personalizedSemesters.length === 0 && (
            <div className="text-center py-8 text-dark-text2">
              <i className="fas fa-search text-3xl mb-3 block opacity-40"></i>
              <p>No semesters match your search.</p>
            </div>
          )}
          <div className="flex flex-col gap-2">
            {personalizedSemesters.map((sem, idx) => {
              const isRelated = sem.isRelated;
              const isSources = sem.id === config.relatedSourcesFolder;
              const isSpecial = isRelated || isSources;
              return (
                <div key={sem.id} className={`flex items-center gap-4 p-[18px_20px] ${isSpecial ? 'bg-gradient-to-r from-dark-bg2 to-accent/5 border-accent/30' : 'bg-dark-bg2 border-dark-border'} border rounded-xl cursor-pointer hover:border-qsis hover:shadow-[0_0_20px_rgba(34,197,94,0.3)] hover:translate-x-1 transition-all ${!isSpecial && idx === 0 && userSemesterId === sem.id && !isMySemesterOnly ? 'border-qsis/40 ring-1 ring-qsis/20' : ''}`} onClick={() => navigateToSemester(sem.id)}>
                  <div className={`w-12 h-12 rounded-xl ${isSpecial ? 'bg-gradient-to-br from-accent to-qsis' : 'bg-gradient-to-br from-qsis to-accent'} flex items-center justify-center text-white text-[1.2rem] flex-shrink-0`}>
                    <i className={`fas ${isSources ? 'fa-link' : isRelated ? 'fa-book-open' : 'fa-book'}`}></i>
                  </div>
                  <div className="flex-1">
                    <div className="text-[1.05rem] font-bold flex items-center gap-2">
                      {sem.label}
                      {!isSpecial && idx === 0 && userSemesterId === sem.id && !isMySemesterOnly && (
                        <span className="text-[0.65rem] px-2 py-0.5 rounded-full bg-qsis/15 text-qsis font-semibold">Your Semester</span>
                      )}
                    </div>
                    {isSpecial && (
                      <div className="text-[0.75rem] text-dark-text2">
                        {isSources ? 'Cross-faculty shared resources' : 'Cross-semester & Shariah resources'}
                      </div>
                    )}
                  </div>
                  <div className="text-[0.8rem] text-dark-text2">{sem.courses} {isSources ? 'resources' : 'courses'} &middot; {sem.files} files</div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Course View — inside a semester */}
      {!loading && !error && !isSearching && view === 'courses' && (
        <section className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[1.05rem] font-semibold flex items-center gap-2">
              <i className="fas fa-book"></i> Courses
            </h3>
            <button className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold" onClick={goBack}>
              <i className="fas fa-arrow-left"></i> Back
            </button>
          </div>
          {semesterCourses.length === 0 && (
            <div className="text-center py-12">
              <i className="fas fa-book-open text-4xl mb-4 block text-qsis opacity-40"></i>
              <p className="text-dark-text font-semibold text-sm mb-1">No courses added yet for this semester.</p>
              <p className="text-dark-text3 text-xs mb-4">Be the first to add a course code and title.</p>
              {session && coursePerms.canAdd && (
                <button onClick={() => {
                  setAddCourseCode('');
                  setAddCourseTitle('');
                  setAddCourseError('');
                  setAddCourseSuccess('');
                  setShowAddCourse(true);
                }} className="px-5 py-2.5 bg-qsis text-white rounded-xl text-xs font-semibold hover:bg-qsis/90 transition-colors">
                  <i className="fas fa-plus mr-1.5"></i>Add Course
                </button>
              )}
            </div>
          )}
          {semesterCourses.length > 0 && filteredCourses.length === 0 && (
            <div className="text-center py-8 text-dark-text2">
              <i className="fas fa-search text-3xl mb-3 block opacity-40"></i>
              <p>No courses match your search.</p>
            </div>
          )}
          <div className="flex flex-col gap-2.5">
            {filteredCourses.map(course => (
              <div key={course.code} className="p-[14px_18px] bg-dark-bg2 border border-dark-border rounded-xl cursor-pointer hover:border-qsis hover:shadow-[0_0_12px_rgba(34,197,94,0.3)] transition-all" onClick={() => navigateToCourse(course.code, course.title)}>
                <div className="flex items-center gap-3.5">
                  <div className="text-[1.3rem] text-qsis flex-shrink-0"><i className="fas fa-book-open"></i></div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[0.95rem]">{course.code} — {course.title}</div>
                    <div className="flex gap-2 mt-[5px] flex-wrap">
                      {course.categories.map((cat: any) => (
                        <span key={cat.key} className={`text-[0.68rem] px-2 py-[2px] rounded-full border ${(cat as any).hasLinks ? 'bg-pink-500/15 text-pink-400 border-pink-500/40 font-semibold' : 'bg-dark-bg3 text-dark-text2 border-dark-border'}`}>
                          {cat.label}: {cat.count}
                          {(cat as any).hasLinks && <i className="fas fa-link ml-1 text-[0.55rem]"></i>}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-[0.75rem] text-dark-text2 flex items-center gap-1.5 justify-end">
                      {(course as any).hasSharedLinks && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-pink-500/15 text-pink-400 text-[0.6rem] font-bold border border-pink-500/30"><i className="fas fa-link text-[0.55rem]"></i>Links</span>}
                      {course.totalFiles} files
                    </div>
                    {course.hasMidFinal && (
                      <div className="flex gap-1 mt-1 justify-end">
                        <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-yellow-400/15 text-yellow-400">Mid Term</span>
                        <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-green-400/15 text-green-400">Final Term</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Add Course Button — logged in only */}
          {session && coursePerms.canAdd && (
            <div className="mt-4 text-center">
              <button
                onClick={() => {
                  setAddCourseCode('');
                  setAddCourseTitle('');
                  setAddCourseError('');
                  setAddCourseSuccess('');
                  setShowAddCourse(true);
                }}
                className="px-5 py-2.5 bg-qsis text-white rounded-xl text-xs font-semibold hover:bg-qsis/90 transition-colors"
              >
                <i className="fas fa-plus mr-1.5"></i>Add Course
              </button>
            </div>
          )}
        </section>
      )}

      {/* Category View — inside a course */}
      {!loading && !error && !isSearching && view === 'categories' && (
        <section className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[1.05rem] font-semibold flex items-center gap-2">
              <i className="fas fa-folder-open"></i> {currentMidFinal || 'Folders'}
            </h3>
            <button className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold" onClick={goBack}>
              <i className="fas fa-arrow-left"></i> Back
            </button>
          </div>

          {filteredCategories.length === 0 && (
            <div className="text-center py-8 text-dark-text2">
              <i className="fas fa-folder-open text-3xl mb-3 block opacity-40"></i>
              <p>No folders found.</p>
            </div>
          )}

          {/* Virtual mid/final cards — side by side on large screens */}
          {filteredCategories.some(c => c.key === '_mid' || c.key === '_final') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
              {filteredCategories.filter(c => c.key === '_mid' || c.key === '_final').map(cat => {
                if (cat.key === '_mid') {
                  return (
                    <div key={cat.key} className="flex items-center gap-3.5 p-[14px_18px] bg-dark-bg2 border border-dark-border rounded-xl cursor-pointer hover:border-yellow-400/50 hover:bg-yellow-400/5 hover:shadow-[0_0_16px_rgba(250,204,21,.15)] hover:translate-x-1 transition-all" onClick={() => navigateToMidFinal('Mid')}>
                      <div className="text-[1.5rem] text-yellow-400"><i className="fas fa-pen-fancy"></i></div>
                      <div className="text-[0.95rem] font-semibold">Mid</div>
                      <div className="flex items-center gap-2 ml-auto">
                        {(cat as any).hasLinks && <span className="text-[0.7rem] px-1.5 py-[2px] rounded bg-pink-500/15 text-pink-400"><i className="fas fa-link mr-1"></i>Links</span>}
                        <div className="text-[0.75rem] text-dark-text2">{cat.count} files</div>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={cat.key} className="flex items-center gap-3.5 p-[14px_18px] bg-dark-bg2 border border-dark-border rounded-xl cursor-pointer hover:border-green-400/50 hover:bg-green-400/5 hover:shadow-[0_0_16px_rgba(34,197,94,.15)] hover:translate-x-1 transition-all" onClick={() => navigateToMidFinal('Final')}>
                    <div className="text-[1.5rem] text-green-400"><i className="fas fa-graduation-cap"></i></div>
                    <div className="text-[0.95rem] font-semibold">Final</div>
                    <div className="flex items-center gap-2 ml-auto">
                      {(cat as any).hasLinks && <span className="text-[0.7rem] px-1.5 py-[2px] rounded bg-pink-500/15 text-pink-400"><i className="fas fa-link mr-1"></i>Links</span>}
                      <div className="text-[0.75rem] text-dark-text2">{cat.count} files</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Real categories */}
          <div className="flex flex-col gap-2">
            {filteredCategories.filter(c => c.key !== '_mid' && c.key !== '_final').map(cat => {
              const catConfig = config.categories[cat.key as keyof typeof config.categories] || config.categories.other;
              return (
                <div key={cat.key} className="flex items-center gap-3.5 p-[14px_18px] bg-dark-bg2 border border-dark-border rounded-xl cursor-pointer hover:border-accent hover:shadow-[0_0_16px_rgba(16,185,129,.2)] hover:translate-x-1 transition-all" onClick={() => navigateToCategory(cat.key)}>
                  <div className="text-[1.5rem]" style={{color: catConfig.color}}><i className={`fas ${catConfig.icon}`}></i></div>
                  <div className="text-[0.95rem] font-semibold">{cat.label}</div>
                  <div className="flex items-center gap-2 ml-auto">
                    {(cat as any).hasLinks && <span className="text-[0.7rem] px-1.5 py-[2px] rounded bg-pink-500/15 text-pink-400"><i className="fas fa-link mr-1"></i>Links</span>}
                    <div className="text-[0.75rem] text-dark-text2">{cat.count} files</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Files in course */}
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
           <FileCards items={filteredFiles} onOpen={openFile} filePerms={filePerms}
              onMove={(p, n, m) => setMoveTarget({ path: p, name: n, mode: m })}
              onCopy={(p, n, m) => setMoveTarget({ path: p, name: n, mode: m })}
              onRename={(p, n) => setRenameTarget({ path: p, name: n })}
              onDelete={(p, n) => setDeleteConfirm({ path: p, name: n })}
              actionLoading={actionLoading} />
        </section>
      )}

      {/* Search Results View */}
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

          {/* Matched Folders */}
          {searchResults.folders.length > 0 && (
            <div className="mb-4">
              <h4 className="text-[0.82rem] font-semibold text-dark-text2 mb-2"><i className="fas fa-folder mr-1.5"></i> Matching Folders</h4>
              <div className="flex flex-col gap-2">
                {searchResults.folders.map((folder: any) => (
                  <div
                    key={folder.path}
                    className="flex items-center gap-3 p-[12px_16px] bg-dark-bg2 border border-dark-border rounded-xl cursor-pointer hover:border-qsis hover:shadow-[0_0_12px_rgba(34,197,94,0.2)] hover:translate-x-1 transition-all"
                    onClick={() => {
                      if (folder.type === 'semester') {
                        navigateToSemester(folder.id);
                      } else if (folder.type === 'category') {
                        navigateToCategory(folder.id);
                      } else if (folder.type === 'course') {
                        const parts = folder.path.split('/');
                        navigateToSemester(parts[0]);
                        setTimeout(() => {
                          navigateToCourse(folder.id, folder.id);
                        }, 0);
                      }
                    }}
                  >
                    <div className="w-9 h-9 rounded-lg bg-qsis/10 flex items-center justify-center flex-shrink-0">
                      <i className={`fas ${folder.type === 'semester' ? 'fa-book' : folder.type === 'category' ? 'fa-folder' : 'fa-book-open'} text-qsis text-[0.85rem]`}></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[0.85rem] font-semibold">{folder.label}</div>
                      <div className="text-[0.65rem] text-dark-text2 font-mono truncate">{folder.path}</div>
                    </div>
                    <span className="text-[0.7rem] text-dark-text2 flex-shrink-0">{folder.count} file{folder.count !== 1 ? 's' : ''}</span>
                    <i className="fas fa-chevron-right text-dark-text2 text-[0.65rem] flex-shrink-0"></i>
                  </div>
            ))}
          </div>
            </div>
          )}

          {/* Matched Files */}
          {searchResults.files.length > 0 && (
            <div>
              <h4 className="text-[0.82rem] font-semibold text-dark-text2 mb-2"><i className="fas fa-file mr-1.5"></i> Matching Files</h4>
              <FileCards items={searchResults.files} onOpen={openFile} filePerms={filePerms}
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

      {/* Support Our Work Banner */}
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

      {/* Shared Links — at the very bottom of page, like GitHub README */}
      {!loading && !error && currentDept && currentSem && currentCourseCode && (view === 'categories' || view === 'files') && (
        <div className="mt-6">
          <ReadmeEditor
            folder={view === 'files' && currentMidFinal && currentCat
              ? `${currentDept}/${currentSem}/${currentCourseCode} - ${currentCourseTitle}/${currentMidFinal}/${config.categories[currentCat]?.folder || currentCat}`
              : `${currentDept}/${currentSem}/${currentCourseCode} - ${currentCourseTitle}${currentMidFinal ? '/' + currentMidFinal : ''}`
            }
            isOwner={isOwner}
            isLoggedIn={!!session}
            canEdit={coursePerms.canEditLinks}
          />
        </div>
      )}
      </>
      )}

      {/* ─── Move/Copy Modal ─── */}
      {moveTarget && (
        <MoveModal
          isOpen={!!moveTarget}
          onClose={() => setMoveTarget(null)}
          sourcePath={moveTarget.path}
          sourceName={moveTarget.name}
          mode={moveTarget.mode}
          onAction={async (from, to, newName) => {
            await handleFileAction(moveTarget.mode, from, to, newName);
          }}
        />
      )}

      {/* ─── Rename Modal ─── */}
      {renameTarget && (
        <RenameModal
          isOpen={!!renameTarget}
          onClose={() => setRenameTarget(null)}
          filePath={renameTarget.path}
          currentName={renameTarget.name}
          onRename={async (from, newName) => {
            await handleFileAction('rename', from, undefined, newName);
          }}
        />
      )}

      {/* ─── Delete Confirmation ─── */}
      {deleteConfirm && (
        <>
          <div className="fixed inset-0 bg-black/60 z-[200]" onClick={() => setDeleteConfirm(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[201] bg-dark-bg2 border border-red-500/30 rounded-2xl shadow-2xl w-[380px] p-6">
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-trash text-red-400 text-xl"></i>
              </div>
              <h3 className="font-semibold text-[1rem] mb-2">Delete File?</h3>
              <p className="text-[0.82rem] text-dark-text2 mb-1">This will permanently delete:</p>
              <p className="text-[0.78rem] text-dark-text font-mono bg-dark-bg rounded-lg px-3 py-2 border border-dark-border truncate">{deleteConfirm.name}</p>
              <p className="text-[0.72rem] text-red-400 mt-3"><i className="fas fa-exclamation-triangle mr-1"></i>This action cannot be undone.</p>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 rounded-xl bg-dark-bg border border-dark-border text-dark-text2 text-[0.82rem] hover:bg-dark-bg3 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    await handleFileAction('delete', deleteConfirm.path);
                    setDeleteConfirm(null);
                  } catch {}
                }}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-[0.82rem] font-semibold hover:bg-red-500/90 transition-colors"
              >
                <i className="fas fa-trash mr-1.5"></i>Delete
              </button>
            </div>
          </div>
        </>
      )}

      {/* ─── Add Course Modal ─── */}
      {showAddCourse && (
        <>
          <div className="fixed inset-0 bg-black/60 z-[200]" onClick={() => setShowAddCourse(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[201] bg-dark-bg2 border border-dark-border rounded-2xl shadow-2xl w-[400px] max-w-[95vw] p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[1rem] flex items-center gap-2">
                <i className="fas fa-book-medical text-qsis"></i> Add Course
              </h3>
              <button onClick={() => setShowAddCourse(false)} className="text-dark-text3 hover:text-dark-text text-lg"><i className="fas fa-times"></i></button>
            </div>
            <p className="text-[0.78rem] text-dark-text3 mb-4">
              Add a new course to <span className="text-qsis font-semibold">{currentSem}</span> in <span className="text-qsis font-semibold">{currentDept}</span>.
              <br/>Subfolders (Mid/Final/NOTES/Previous Questions/sheet/Syllabus/Other) will be created automatically on GitHub.
            </p>

            {addCourseError && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                <i className="fas fa-exclamation-triangle mr-1"></i>{addCourseError}
              </div>
            )}
            {addCourseSuccess && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-xs">
                <i className="fas fa-check mr-1"></i>{addCourseSuccess}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-[0.75rem] text-dark-text2 font-medium mb-1 block">Course Code *</label>
                <input
                  value={addCourseCode}
                  onChange={e => setAddCourseCode(e.target.value.toUpperCase())}
                  placeholder="e.g. QSM-3602"
                  className="w-full px-3 py-2.5 bg-dark-bg border border-dark-border rounded-xl text-dark-text text-sm outline-none focus:border-qsis transition-colors"
                />
              </div>
              <div>
                <label className="text-[0.75rem] text-dark-text2 font-medium mb-1 block">Course Title *</label>
                <input
                  value={addCourseTitle}
                  onChange={e => setAddCourseTitle(e.target.value)}
                  placeholder="e.g. Tafsir Bir Rayi"
                  className="w-full px-3 py-2.5 bg-dark-bg border border-dark-border rounded-xl text-dark-text text-sm outline-none focus:border-qsis transition-colors"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowAddCourse(false)}
                className="flex-1 py-2.5 rounded-xl bg-dark-bg border border-dark-border text-dark-text2 text-[0.82rem] hover:bg-dark-bg3 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!addCourseCode.trim() || !addCourseTitle.trim()) {
                    setAddCourseError('Both course code and title are required.');
                    return;
                  }
                  setAddCourseLoading(true);
                  setAddCourseError('');
                  setAddCourseSuccess('');
                  try {
                    const res = await fetch('/api/courses', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ department: currentDept, semester: currentSem, code: addCourseCode.trim(), title: addCourseTitle.trim() }),
                    });
                    const data = await res.json();
                    if (data.success) {
                      setAddCourseSuccess(`Course ${addCourseCode.trim()} created! Folder structure created on GitHub.`);
                      setAddCourseCode('');
                      setAddCourseTitle('');
                      loadTree();
                      setTimeout(() => { setShowAddCourse(false); setAddCourseSuccess(''); }, 2000);
                    } else {
                      if (res.status === 403) {
                        setPermissionDenied({ show: true, message: data.error || 'You do not have permission to add courses.', contact: 'Please contact your CR, ACR, teacher, manager, or admin for access.' });
                        setShowAddCourse(false);
                      } else {
                        setAddCourseError(data.error || 'Failed to create course');
                      }
                    }
                  } catch {
                    setAddCourseError('Network error. Please try again.');
                  }
                  setAddCourseLoading(false);
                }}
                disabled={addCourseLoading}
                className="flex-1 py-2.5 rounded-xl bg-qsis text-white text-[0.82rem] font-semibold hover:bg-qsis/90 transition-colors disabled:opacity-50"
              >
                {addCourseLoading ? <><i className="fas fa-spinner fa-spin mr-1.5"></i>Creating...</> : <><i className="fas fa-plus mr-1.5"></i>Add Course</>}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ─── Permission Denied Popup ─── */}
      {permissionDenied.show && (
        <>
          <div className="fixed inset-0 bg-black/60 z-[200]" onClick={() => setPermissionDenied({ show: false, message: '', contact: '' })} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[201] bg-dark-bg2 border border-amber-500/30 rounded-2xl shadow-2xl w-[380px] max-w-[95vw] p-6">
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-amber-500/15 flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-lock text-amber-400 text-xl"></i>
              </div>
              <h3 className="font-semibold text-[1rem] mb-2">Access Restricted</h3>
              <p className="text-[0.82rem] text-dark-text2 mb-3">{permissionDenied.message}</p>
              <div className="px-4 py-3 bg-dark-bg rounded-xl border border-dark-border mb-4">
                <p className="text-[0.78rem] text-dark-text3">
                  <i className="fas fa-info-circle text-blue-400 mr-1.5"></i>
                  {permissionDenied.contact}
                </p>
              </div>
            </div>
            <button
              onClick={() => setPermissionDenied({ show: false, message: '', contact: '' })}
              className="w-full py-2.5 rounded-xl bg-qsis text-white text-[0.82rem] font-semibold hover:bg-qsis/90 transition-colors"
            >
              Got it
            </button>
          </div>
        </>
      )}
    </>
  );
}

/* ─── File Card Component ─── */
function FileCards({ items, onOpen, filePerms, onMove, onCopy, onRename, onDelete, actionLoading }: {
  items: any[];
  onOpen: (item: any) => void;
  filePerms: Record<string, boolean>;
  onMove: (path: string, name: string, mode: 'move' | 'copy') => void;
  onCopy: (path: string, name: string, mode: 'move' | 'copy') => void;
  onRename: (path: string, name: string) => void;
  onDelete: (path: string, name: string) => void;
  actionLoading: string;
}) {
  if (!items || items.length === 0) {
    return <div className="text-center py-10 text-dark-text2"><i className="fas fa-folder-open"></i> No files here yet.</div>;
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((item: any) => {
        const name = item.path.split('/').pop() || '';
        const ext = name.split('.').pop()?.toLowerCase() || '';
        const mime = getMimeFromExt(ext);
        const isFolder = item.type === 'tree';
        const hasActions = filePerms.move || filePerms.copy || filePerms.rename || filePerms.delete;
        return (
          <div key={item.path} className="bg-dark-bg2 border border-dark-border rounded-xl p-[12px_14px] transition-all hover:border-qsis hover:shadow-[0_0_12px_rgba(34,197,94,0.3)]">
            <div className="flex gap-2.5 items-center cursor-pointer" onClick={() => onOpen(item)}>
              <div className="text-[1.5rem] flex-shrink-0">{getFileIconByType(mime)}</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[0.85rem] whitespace-nowrap overflow-hidden text-ellipsis">{name}</div>
                <div className="text-[0.7rem] text-dark-text2 whitespace-nowrap overflow-hidden text-ellipsis">{item.path}</div>
              </div>
            </div>
            <div className="flex gap-1 mt-2 pt-2 border-t border-dark-border justify-end">
              <button className="bg-transparent border border-dark-border text-dark-text2 cursor-pointer w-[30px] h-[30px] rounded-md inline-flex items-center justify-center text-[0.8rem] hover:bg-dark-bg3 hover:text-qsis hover:border-qsis transition-all" title="View" onClick={(e) => { e.stopPropagation(); onOpen(item); }}>
                <i className="fas fa-eye"></i>
              </button>
              {hasActions && (
                <FileActionsMenu
                  filePath={item.path}
                  fileName={name}
                  isFolder={isFolder}
                  onMove={() => onMove(item.path, name, 'move')}
                  onCopy={() => onCopy(item.path, name, 'copy')}
                  onRename={() => onRename(item.path, name)}
                  onDelete={() => onDelete(item.path, name)}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
