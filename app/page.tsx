'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { config } from '@/lib/config';
import { FACULTIES } from '@/lib/departments';
import { useAppStore } from '@/lib/store';
import { getMimeFromExt, getFileIconByType, esc, timeAgo, extractYear } from '@/lib/utils';

export default function BrowsePage() {
  const { data: session } = useSession();
  const profile = useAppStore(s => s.profile);
  const [mounted, setMounted] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);

  const email = session?.user?.email || profile.email || '';
  const userRole = email ? config.detectRole(email) : null;
  const userName = session?.user?.name || profile.name || '';
  const isPrivileged = userRole === 'admin' || userRole === 'teacher';

  const loading = useAppStore(s => s.loading);
  const error = useAppStore(s => s.error);
  const onboardData = useAppStore(s => s.onboardingData);
  const clearOnboarding = useAppStore(s => s.clearOnboarding);
  const prevOnboardDataRef = useRef(onboardData);
  const view = useAppStore(s => s.view);
  const currentSem = useAppStore(s => s.currentSem);
  const currentCat = useAppStore(s => s.currentCat);
  const breadcrumbs = useAppStore(s => s.breadcrumbs);
  const searchQuery = useAppStore(s => s.searchQuery);
  const fileTypeFilter = useAppStore(s => s.fileTypeFilter);
  const searchSemester = useAppStore(s => s.searchSemester);
  const searchYear = useAppStore(s => s.searchYear);
  const recentReads = useAppStore(s => s.recentReads);

  const loadTree = useAppStore(s => s.loadTree);
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
  const goBack = useAppStore(s => s.goBack);
  const openFile = useAppStore(s => s.openFile);
  const openRecentFile = useAppStore(s => s.openRecentFile);
  const getSemesters = useAppStore(s => s.getSemesters);
  const getCategories = useAppStore(s => s.getCategories);
  const getCourses = useAppStore(s => s.getCourses);
  const getUploadTree = useAppStore(s => s.getUploadTree);
  const getSearchResults = useAppStore(s => s.getSearchResults);
  const getUploadDepartments = useAppStore(s => s.getUploadDepartments);
  const currentDept = useAppStore(s => s.currentDept);

  useEffect(() => {
    loadTree(session?.accessToken || '');
    setShowWelcome(localStorage.getItem('qs-welcome-dismissed') !== 'true');
    setMounted(true);
  }, []);

  // Auto-navigate to user's department after onboarding completes
  useEffect(() => {
    if (!mounted) return;
    const prevData = prevOnboardDataRef.current;
    prevOnboardDataRef.current = onboardData;
    // Detect transition from null to having data (onboarding just completed)
    if (!prevData && onboardData && userDeptId && view === 'departments') {
      navigateToDepartment(userDeptId);
    }
  }, [onboardData, mounted]);

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
        if (d.name === deptName) return d.id;
      }
    }
    return null;
  })();

  const departments = getUploadDepartments();
  const semesters = getSemesters(currentDept || userDeptId);
  const categories = currentSem ? getCategories(currentSem, currentDept || userDeptId) : [];
  const courses = currentSem && currentCat ? getCourses(currentSem, currentCat, currentDept || userDeptId) : [];
  const uploadTree = getUploadTree();

  const isSearching = !!(searchQuery || fileTypeFilter || searchYear || searchSemester);
  const searchResults = isSearching ? getSearchResults(searchQuery, fileTypeFilter, searchYear, searchSemester, currentDept || userDeptId) : { files: [], folders: [] };

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

  const filteredCategories = categories.filter(ce => {
    const catConfig = config.categories[ce.cat as keyof typeof config.categories] || config.categories.other;
    const matchLabel = !searchQuery || catConfig.label.toLowerCase().includes(searchQuery.toLowerCase()) || ce.folders.some(f => f.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchSearch = matchLabel || uploadTree.some((item: any) => {
      if (item.type !== 'blob') return false;
      const parts = item.path.split('/');
      if (parts[0] !== currentSem) return false;
      if (!ce.folders.includes(parts[1])) return false;
      const fileName = parts[parts.length - 1] || '';
      return fileName.toLowerCase().includes(searchQuery.toLowerCase());
    });
    if (!matchSearch) return false;
    if (fileTypeFilter) {
      const matchingFiles = uploadTree.filter((item: any) => {
        if (item.type !== 'blob') return false;
        const parts = item.path.split('/');
        if (parts[0] !== currentSem) return false;
        const ext = (parts[parts.length - 1] || '').split('.').pop()?.toLowerCase() || '';
        return getMimeFromExt(ext) === fileTypeFilter && ce.folders.includes(parts[1]);
      });
      if (matchingFiles.length === 0) return false;
    }
    if (searchYear) {
      const matchingFiles = uploadTree.filter((item: any) => {
        if (item.type !== 'blob') return false;
        const parts = item.path.split('/');
        if (parts[0] !== currentSem) return false;
        if (!ce.folders.includes(parts[1])) return false;
        const fileName = parts[parts.length - 1] || '';
        return extractYear(fileName) === searchYear;
      });
      if (matchingFiles.length === 0) return false;
    }
    return true;
  });

  const filteredCourses = courses.filter(([name, files]) => {
    const matchName = !searchQuery || name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchSearch = matchName || files.some((f: any) => {
      const fileName = f.path.split('/').pop() || '';
      return fileName.toLowerCase().includes(searchQuery.toLowerCase());
    });
    const matchType = !fileTypeFilter || files.some((f: any) => {
      const ext = f.path.split('.').pop()?.toLowerCase() || '';
      return getMimeFromExt(ext) === fileTypeFilter;
    });
    const matchYear = !searchYear || files.some((f: any) => {
      const fileName = f.path.split('/').pop() || '';
      return extractYear(fileName) === searchYear;
    });
    return matchSearch && matchType && matchYear;
  });

  const filteredFiles = (() => {
    const currentCourseName = breadcrumbs[breadcrumbs.length - 1]?.label;
    const courseEntry = courses.find(([name]) => name === currentCourseName);
    if (!courseEntry) return [];
    return courseEntry[1].filter((f: any) => {
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
          <Image src="/arms-logo.png" alt="IIUC-ARMS" width={150} height={150} className="w-28 h-28 p-2 rounded-lg border-2 border-qsis mx-auto object-contain bg-white mb-3" />
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

      {/* Breadcrumbs */}
      {breadcrumbs.length > 0 && (
        <div className="flex items-center gap-2 text-[0.8rem] mb-4 flex-wrap">
          {breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <span className="text-dark-text2 text-[0.6rem]"><i className="fas fa-chevron-right"></i></span>}
              {b.onClick ? (
                <button className="text-qsis cursor-pointer hover:underline bg-transparent border-none" onClick={b.onClick}>{b.label}</button>
              ) : (
                <span className="text-dark-text cursor-default">{b.label}</span>
              )}
            </span>
          ))}
        </div>
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
          <select
            value={searchSemester}
            onChange={e => setSearchSemester(e.target.value)}
            className="bg-dark-bg border border-dark-border text-dark-text py-1.5 px-2.5 rounded-md text-[0.78rem] outline-none cursor-pointer focus:border-qsis"
          >
            <option value="">All Semesters</option>
            {config.semesters.map(s => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
            <option value="related-kitabs">Related Kitabs</option>
            <option value={config.relatedSourcesFolder}>Related Sources</option>
          </select>
          <select
            value={fileTypeFilter}
            onChange={e => setFileTypeFilter(e.target.value)}
            className="bg-dark-bg border border-dark-border text-dark-text py-1.5 px-2.5 rounded-md text-[0.78rem] outline-none cursor-pointer focus:border-qsis"
          >
            <option value="">All Types</option>
            <option value="pdf">PDF</option>
            <option value="image">Image</option>
            <option value="doc">Document</option>
            <option value="sheet">Sheet (XLS)</option>
            <option value="ppt">Presentation</option>
          </select>
          <select
            value={searchYear}
            onChange={e => setSearchYear(e.target.value)}
            className="bg-dark-bg border border-dark-border text-dark-text py-1.5 px-2.5 rounded-md text-[0.78rem] outline-none cursor-pointer focus:border-qsis"
          >
            <option value="">All Years</option>
            <option value="2026">2026</option>
            <option value="2025">2025</option>
            <option value="2024">2024</option>
            <option value="2023">2023</option>
          </select>
        </div>
      </div>

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
                            <i className="fas fa-building"></i>
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
              <i className="fas fa-book"></i> 
              {currentDept ? (() => {
                for (const f of FACULTIES) {
                  const d = f.departments.find(dd => dd.id === currentDept);
                  if (d) return d.name;
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

      {/* Category View */}
      {!loading && !error && !isSearching && view === 'categories' && (
        <section className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[1.05rem] font-semibold flex items-center gap-2">
              <i className="fas fa-folder-open"></i>
              {currentSem === config.relatedKitabsFolder ? 'Related Kitabs' : currentSem === config.relatedSourcesFolder ? 'Related Sources' : config.categories[currentCat as keyof typeof config.categories]?.label || 'Categories'}
            </h3>
            <button className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold" onClick={goHome}>
              <i className="fas fa-arrow-left"></i> Back to Semesters
            </button>
          </div>
          {filteredCategories.length === 0 && (
            <div className="text-center py-8 text-dark-text2">
              <i className="fas fa-search text-3xl mb-3 block opacity-40"></i>
              <p>No categories match your search.</p>
            </div>
          )}
          <div className="flex flex-col gap-2">
            {filteredCategories.map(ce => {
              const isRelated = currentSem === config.relatedKitabsFolder;
              const isSources = currentSem === config.relatedSourcesFolder;
              const catConfig = isRelated
                ? (config.relatedKitabsCategories[ce.cat as keyof typeof config.relatedKitabsCategories] || { label: ce.cat, icon: 'folder', color: '#94a3b8' })
                : isSources
                  ? { label: 'Related Sources', icon: 'link', color: '#0ea5e9' }
                  : (config.categories[ce.cat as keyof typeof config.categories] || config.categories.other);
              return (
                <div key={ce.cat} className="flex items-center gap-3.5 p-[14px_18px] bg-dark-bg2 border border-dark-border rounded-xl cursor-pointer hover:border-accent hover:shadow-[0_0_16px_rgba(16,185,129,.2)] hover:translate-x-1 transition-all" onClick={() => navigateToCategory(currentSem, ce.cat)}>
                  <div className="text-[1.5rem]" style={{color: catConfig.color}}><i className={`fas ${catConfig.icon}`}></i></div>
                  <div className="text-[0.95rem] font-semibold">{catConfig.label}</div>
                  <div className="text-[0.75rem] text-dark-text2 ml-auto">{ce.count} files</div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Course View */}
      {!loading && !error && !isSearching && view === 'courses' && (
        <section className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[1.05rem] font-semibold flex items-center gap-2">
              <i className="fas fa-folder-open"></i> {(() => {
                const isRelated = currentSem === config.relatedKitabsFolder;
                const isSources = currentSem === config.relatedSourcesFolder;
                if (isRelated) {
                  const catCfg = config.relatedKitabsCategories[currentCat as keyof typeof config.relatedKitabsCategories];
                  return catCfg?.label || currentCat;
                }
                if (isSources) return 'Related Sources';
                return config.categories[currentCat as keyof typeof config.categories]?.label || currentCat;
              })()}
            </h3>
            <button className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold" onClick={goBack}>
              <i className="fas fa-arrow-left"></i> Back
            </button>
          </div>
          {filteredCourses.length === 0 && (
            <div className="text-center py-8 text-dark-text2">
              <i className="fas fa-search text-3xl mb-3 block opacity-40"></i>
              <p>No courses match your search.</p>
            </div>
          )}
          <div className="flex flex-col gap-2">
            {filteredCourses.map(([name, files]) => {
              const pdfCount = files.filter((f: any) => f.path.toLowerCase().endsWith('.pdf')).length;
              const docCount = files.filter((f: any) => /\.(doc|docx)$/i.test(f.path)).length;
              const xlsCount = files.filter((f: any) => /\.(xls|xlsx)$/i.test(f.path)).length;
              const pptCount = files.filter((f: any) => /\.(ppt|pptx)$/i.test(f.path)).length;
              const imgCount = files.filter((f: any) => /\.(jpg|jpeg|png|gif|webp)$/i.test(f.path)).length;
              return (
                <div key={name} className="flex items-center gap-3.5 p-[14px_18px] bg-dark-bg2 border border-dark-border rounded-xl cursor-pointer hover:border-qsis hover:shadow-[0_0_12px_rgba(34,197,94,0.3)] transition-all" onClick={() => navigateToCourse(name)}>
                  <div className="text-[1.3rem] text-qsis flex-shrink-0"><i className="fas fa-book-open"></i></div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[0.9rem]">{name}</div>
                    <div className="flex gap-2.5 text-[0.72rem] text-dark-text2 mt-[3px]">
                      {pdfCount > 0 && <span className="flex items-center gap-[3px]"><i className="fas fa-file-pdf" style={{color:'#ef4444'}}></i> {pdfCount}</span>}
                      {docCount > 0 && <span className="flex items-center gap-[3px]"><i className="fas fa-file-word" style={{color:'#3b82f6'}}></i> {docCount}</span>}
                      {xlsCount > 0 && <span className="flex items-center gap-[3px]"><i className="fas fa-file-excel" style={{color:'#22c55e'}}></i> {xlsCount}</span>}
                      {pptCount > 0 && <span className="flex items-center gap-[3px]"><i className="fas fa-file-powerpoint" style={{color:'#f97316'}}></i> {pptCount}</span>}
                      {imgCount > 0 && <span className="flex items-center gap-[3px]"><i className="fas fa-file-image" style={{color:'#34d399'}}></i> {imgCount}</span>}
                      <span className="flex items-center gap-[3px]"><i className="fas fa-file"></i> {files.length} total</span>
                    </div>
                  </div>
                  <i className="fas fa-chevron-right text-dark-text2 text-[0.7rem] flex-shrink-0"></i>
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
          <FileCards items={filteredFiles} onOpen={openFile} />
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
                        const parts = folder.path.split('/');
                        navigateToCategory(parts[0], folder.id);
                      } else if (folder.type === 'course') {
                        const parts = folder.path.split('/');
                        // Navigate: semester -> category -> course
                        navigateToSemester(parts[0]);
                        setTimeout(() => {
                          navigateToCategory(parts[0], parts[1]);
                          setTimeout(() => navigateToCourse(folder.id), 0);
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
              <FileCards items={searchResults.files} onOpen={openFile} />
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
      </>
      )}
    </>
  );
}

/* ─── File Card Component ─── */
function FileCards({ items, onOpen }: { items: any[]; onOpen: (item: any) => void }) {
  if (!items || items.length === 0) {
    return <div className="text-center py-10 text-dark-text2"><i className="fas fa-folder-open"></i> No files here yet.</div>;
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((item: any) => {
        const name = item.path.split('/').pop() || '';
        const ext = name.split('.').pop()?.toLowerCase() || '';
        const mime = getMimeFromExt(ext);
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
            </div>
          </div>
        );
      })}
    </div>
  );
}
