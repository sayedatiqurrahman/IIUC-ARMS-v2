'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { config } from '@/lib/config';
import { useAppStore } from '@/lib/store';
import { getMimeFromExt, getFileIconByType, esc, timeAgo, extractYear } from '@/lib/utils';

export default function BrowsePage() {
  const { data: session } = useSession();
  const profile = useAppStore(s => s.profile);
  const [showWelcome, setShowWelcome] = useState(true);

  const email = session?.user?.email || profile.email || '';
  const userRole = email ? config.detectRole(email) : null;
  const userName = session?.user?.name || profile.name || '';
  const isPrivileged = userRole === 'admin' || userRole === 'teacher';

  const loading = useAppStore(s => s.loading);
  const error = useAppStore(s => s.error);
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

  useEffect(() => {
    loadTree(session?.accessToken || '');
  }, []);

  const semesters = getSemesters();
  const categories = currentSem ? getCategories(currentSem) : [];
  const courses = currentSem && currentCat ? getCourses(currentSem, currentCat) : [];
  const uploadTree = getUploadTree();

  const isSearching = !!(searchQuery || fileTypeFilter || searchYear || searchSemester);
  const searchResults = isSearching ? getSearchResults(searchQuery, fileTypeFilter, searchYear, searchSemester) : { files: [], folders: [] };

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
      {/* Hero Section */}
      {view === 'semesters' && !searchQuery && (
        <section className="text-center py-8 mb-5">
          <div className="mb-4">
            <Image src="/arms-logo.png" alt="QSIS-ARMS" width={150} height={150} className="w-32 h-32 p-2 rounded-lg border-2 border-qsis mx-auto object-contain bg-white mb-4" />
          </div>
          <h2 className="text-[1.7rem] font-extrabold bg-gradient-to-br from-qsis to-accent bg-clip-text text-transparent mb-1.5">QSIS-ARMS</h2>
          <p className="text-gray-500 text-[0.95rem]">QSIS Academic Resource Management System</p>
          <div className="flex items-center justify-center gap-2 mt-2.5 flex-wrap">
            <span className="text-[0.78rem] text-gray-400">Developed by <Link href="https://atiq.is-a.dev" target="_blank" className="no-underline"> <strong className="text-qsis">Sayed Atiqur Rahman</strong> </Link> &mdash; QSIS, IIUC</span>
          </div>
        </section>
      )}

      {/* Welcome Banner for Teachers & Admins */}
      {view === 'semesters' && !searchQuery && isPrivileged && showWelcome && (
        <section className="max-w-[700px] mx-auto mb-5 p-4 rounded-xl border border-qsis/20 bg-gradient-to-r from-qsis/5 to-accent/5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[1rem] font-semibold text-dark-text mb-1">
                Assalamu Alaikum{userName ? `, ${userRole === 'teacher' ? 'Sir' : userRole === 'admin' ? 'Sir' : ''}` : ''} {userName || ''} 
              </p>
              <p className="text-[0.82rem] text-dark-text2 leading-relaxed">
                Welcome to <strong className="text-qsis">QSIS-ARMS</strong>. In sha Allah, we hope you will enjoy exploring the site.
              </p>
              <p className="text-[0.78rem] text-dark-text3 mt-1">
                {userRole === 'admin' ? (
                  <>You have <strong className="text-green-400">full admin access</strong> &mdash; routine management, publishing, file uploads, and activity monitoring.</>
                ) : (
                  <>You have <strong className="text-green-400">routine management access</strong> and <strong className="text-green-400">publishable access</strong> for all branches.</>
                )}
              </p>
            </div>
            <button onClick={() => setShowWelcome(false)} className="text-dark-text3 hover:text-dark-text text-sm ml-3 mt-1 flex-shrink-0" title="Dismiss">
              <i className="fas fa-times"></i>
            </button>
          </div>
        </section>
      )}

      {/* Stats */}
      {!isSearching && view === 'semesters' && (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-[700px] mx-auto mb-6">
          <div className="bg-dark-bg2 border border-dark-border rounded-xl p-3.5 text-center">
            <div className="text-[1.3rem] font-bold text-qsis">{semesters.filter(s => !s.isRelated).length}</div>
            <div className="text-[0.7rem] text-dark-text2 mt-0.5">Semesters</div>
          </div>
          <div className="bg-dark-bg2 border border-dark-border rounded-xl p-3.5 text-center">
            <div className="text-[1.3rem] font-bold text-accent">{semesters.reduce((s, c) => s + c.courses, 0)}</div>
            <div className="text-[0.7rem] text-dark-text2 mt-0.5">Courses</div>
          </div>
          <div className="bg-dark-bg2 border border-dark-border rounded-xl p-3.5 text-center">
            <div className="text-[1.3rem] font-bold text-yellow-500">{uploadTree.filter((i: any) => i.type === 'blob').length}</div>
            <div className="text-[0.7rem] text-dark-text2 mt-0.5">Files</div>
          </div>
          <div className="bg-dark-bg2 border border-dark-border rounded-xl p-3.5 text-center">
            <div className="text-[1.3rem] font-bold text-green-500">{config.semesters.length}</div>
            <div className="text-[0.7rem] text-dark-text2 mt-0.5">Total</div>
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

      {/* Semester View */}
      {!loading && !error && !isSearching && view === 'semesters' && (
        <section className="mb-5">
          <h3 className="text-base font-semibold flex items-center gap-2 mb-3"><i className="fas fa-book"></i> Select Semester</h3>
          {filteredSemesters.length === 0 && (
            <div className="text-center py-8 text-dark-text2">
              <i className="fas fa-search text-3xl mb-3 block opacity-40"></i>
              <p>No semesters match your search.</p>
            </div>
          )}
          <div className="flex flex-col gap-2">
            {filteredSemesters.filter(s => !s.isRelated).map(sem => (
              <div key={sem.id} className="flex items-center gap-4 p-[18px_20px] bg-dark-bg2 border border-dark-border rounded-xl cursor-pointer hover:border-qsis hover:shadow-[0_0_20px_rgba(34,197,94,0.3)] hover:translate-x-1 transition-all" onClick={() => navigateToSemester(sem.id)}>
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-qsis to-accent flex items-center justify-center text-white text-[1.2rem] flex-shrink-0"><i className="fas fa-book"></i></div>
                <div className="text-[1.05rem] font-bold">{sem.label}</div>
                <div className="text-[0.8rem] text-dark-text2 ml-auto">{sem.courses} courses &middot; {sem.files} files</div>
              </div>
            ))}
          </div>

          {filteredSemesters.filter(s => s.isRelated).map(sem => (
            <div key={sem.id} className="mt-4 flex items-center gap-4 p-[18px_20px] bg-gradient-to-r from-dark-bg2 to-accent/5 border border-accent/30 rounded-xl cursor-pointer hover:border-accent hover:shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:translate-x-1 transition-all" onClick={() => navigateToSemester(sem.id)}>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent to-qsis flex items-center justify-center text-white text-[1.2rem] flex-shrink-0"><i className="fas fa-book-open"></i></div>
              <div className="flex-1">
                <div className="text-[1.05rem] font-bold">{sem.label}</div>
                <div className="text-[0.75rem] text-dark-text2">Cross-semester & Shariah resources</div>
              </div>
              <div className="text-[0.8rem] text-dark-text2 text-right">{sem.files} files</div>
            </div>
          ))}
        </section>
      )}

      {/* Category View */}
      {!loading && !error && !isSearching && view === 'categories' && (
        <section className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[1.05rem] font-semibold flex items-center gap-2">
              <i className="fas fa-folder-open"></i>
              {currentSem === config.relatedKitabsFolder ? 'Related Kitabs' : config.categories[currentCat as keyof typeof config.categories]?.label || 'Categories'}
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
              const catConfig = isRelated
                ? (config.relatedKitabsCategories[ce.cat as keyof typeof config.relatedKitabsCategories] || { label: ce.cat, icon: 'folder', color: '#94a3b8' })
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
                if (isRelated) {
                  const catCfg = config.relatedKitabsCategories[currentCat as keyof typeof config.relatedKitabsCategories];
                  return catCfg?.label || currentCat;
                }
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
