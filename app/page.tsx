'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { config } from '@/lib/config';
import { useAppStore, savePdfPage, getSavedPdfPage } from '@/lib/store';
import LoginModal from '@/components/LoginModal';
import UploadModal from '@/components/UploadModal';

import { useRecaptcha } from '@/lib/useRecaptcha';

/* ─── pure helpers ─── */
function getFileIcon(ext: string) {
  if (['jpg','jpeg','png','gif','webp'].includes(ext)) return 'fa-file-image';
  if (ext === 'pdf') return 'fa-file-pdf';
  if (['doc','docx'].includes(ext)) return 'fa-file-word';
  if (['xls','xlsx','csv'].includes(ext)) return 'fa-file-excel';
  if (['ppt','pptx'].includes(ext)) return 'fa-file-powerpoint';
  return 'fa-file';
}

function getMimeFromExt(ext: string) {
  const e = ext.toLowerCase();
  if (['jpg','jpeg','png','gif','webp'].includes(e)) return 'image';
  if (e === 'pdf') return 'pdf';
  if (['doc','docx'].includes(e)) return 'doc';
  if (['xls','xlsx','csv'].includes(e)) return 'sheet';
  if (['ppt','pptx'].includes(e)) return 'ppt';
  return 'other';
}

function getFileIconByType(mime: string) {
  if (mime === 'image') return <i className="fas fa-file-image" style={{color:'#34d399'}}></i>;
  if (mime === 'pdf') return <i className="fas fa-file-pdf" style={{color:'#ef4444'}}></i>;
  if (mime === 'doc') return <i className="fas fa-file-word" style={{color:'#3b82f6'}}></i>;
  if (mime === 'sheet') return <i className="fas fa-file-excel" style={{color:'#22c55e'}}></i>;
  if (mime === 'ppt') return <i className="fas fa-file-powerpoint" style={{color:'#f97316'}}></i>;
  return <i className="fas fa-file" style={{color:'#94a3b8'}}></i>;
}

function esc(text: string) {
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function timeAgo(ts: number) {
  const d = Date.now() - ts;
  if (d < 60000) return 'Just now';
  if (d < 3600000) return Math.floor(d / 60000) + 'm ago';
  if (d < 86400000) return Math.floor(d / 3600000) + 'h ago';
  return Math.floor(d / 86400000) + 'd ago';
}

function makeId(path: string) {
  return btoa(unescape(encodeURIComponent(path))).replace(/[=+/]/g, '');
}

function getRawUrl(path: string) {
  return `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.branch}/${config.uploadPath}/${path}`;
}

function extractYear(name: string): string {
  const m = name.match(/(20\d{2})/);
  return m ? m[1] : '';
}

/* ─── main page ─── */
export default function Home() {
  const { data: session, status } = useSession();
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ universityId: '', name: '', whatsapp: '', semester: '' });
  const { executeRecaptcha } = useRecaptcha();

  /* ── individual selectors for reactivity ── */
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
  const viewerOpen = useAppStore(s => s.viewerOpen);
  const viewerItem = useAppStore(s => s.viewerItem);
  const uploadOpen = useAppStore(s => s.uploadOpen);
  const recentReads = useAppStore(s => s.recentReads);
  const tree = useAppStore(s => s.tree);

  /* ── actions ── */
  const loadTree = useAppStore(s => s.loadTree);
  const setSearchQuery = useAppStore(s => s.setSearchQuery);
  const setFileTypeFilter = useAppStore(s => s.setFileTypeFilter);
  const setSearchSemester = useAppStore(s => s.setSearchSemester);
  const setSearchYear = useAppStore(s => s.setSearchYear);
  const resetFilters = useAppStore(s => s.resetFilters);
  const setUploadOpen = useAppStore(s => s.setUploadOpen);
  const goHome = useAppStore(s => s.goHome);
  const navigateToSemester = useAppStore(s => s.navigateToSemester);
  const navigateToCategory = useAppStore(s => s.navigateToCategory);
  const navigateToCourse = useAppStore(s => s.navigateToCourse);
  const navigateToHistory = useAppStore(s => s.navigateToHistory);
  const navigateToContributors = useAppStore(s => s.navigateToContributors);
  const navigateToRoutine = useAppStore(s => s.navigateToRoutine);
  const navigateToDashboard = useAppStore(s => s.navigateToDashboard);
  const profile = useAppStore(s => s.profile);
  const updateProfile = useAppStore(s => s.updateProfile);
  const loadProfile = useAppStore(s => s.loadProfile);
  const goBack = useAppStore(s => s.goBack);
  const openFile = useAppStore(s => s.openFile);
  const openRecentFile = useAppStore(s => s.openRecentFile);
  const closeViewer = useAppStore(s => s.closeViewer);
  const getSemesters = useAppStore(s => s.getSemesters);
  const contributors = useAppStore(s => s.contributors);
  const contributorsLoading = useAppStore(s => s.contributorsLoading);
  const routineData = useAppStore(s => s.routineData);
  const routineLoading = useAppStore(s => s.routineLoading);
  const getCategories = useAppStore(s => s.getCategories);
  const getCourses = useAppStore(s => s.getCourses);
  const getUploadTree = useAppStore(s => s.getUploadTree);

  useEffect(() => {
    loadTree(session?.accessToken || '');
    useAppStore.getState().loadRecentReads();
    loadProfile();
  }, []);

  /* ── derived data — computed every render for correct reactivity ── */
  const semesters = getSemesters();
  const categories = currentSem ? getCategories(currentSem) : [];
  const courses = currentSem && currentCat ? getCourses(currentSem, currentCat) : [];
  const uploadTree = getUploadTree();
  const totalFiles = uploadTree.filter((i: any) => i.type === 'blob').length;

  /* ── search filtering ── */
  const filteredSemesters = semesters.filter(sem => {
    const matchSearch = !searchQuery || sem.label.toLowerCase().includes(searchQuery.toLowerCase());
    const matchSemester = !searchSemester || sem.id === searchSemester;
    if (!matchSearch || !matchSemester) return false;

    // Apply file type filter: only show semesters that have matching files
    if (fileTypeFilter !== 'all') {
      const semFiles = uploadTree.filter((item: any) => {
        if (item.type !== 'blob') return false;
        const parts = item.path.split('/');
        if (parts[0] !== sem.id) return false;
        const ext = (parts[parts.length - 1] || '').split('.').pop()?.toLowerCase() || '';
        return getMimeFromExt(ext) === fileTypeFilter;
      });
      if (semFiles.length === 0) return false;
    }

    // Apply year filter: only show semesters that have matching files
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
    const matchSearch = !searchQuery || catConfig.label.toLowerCase().includes(searchQuery.toLowerCase()) || ce.folders.some(f => f.toLowerCase().includes(searchQuery.toLowerCase()));
    if (!matchSearch) return false;

    // Apply file type filter for Related Kitabs
    if (fileTypeFilter !== 'all' && currentSem === config.relatedKitabsFolder) {
      const matchingFiles = uploadTree.filter((item: any) => {
        if (item.type !== 'blob') return false;
        const parts = item.path.split('/');
        if (parts[0] !== currentSem) return false;
        const ext = (parts[parts.length - 1] || '').split('.').pop()?.toLowerCase() || '';
        return getMimeFromExt(ext) === fileTypeFilter && ce.folders.includes(parts[1]);
      });
      if (matchingFiles.length === 0) return false;
    }

    return true;
  });

  const filteredCourses = courses.filter(([name, files]) => {
    const matchSearch = !searchQuery || name.toLowerCase().includes(searchQuery.toLowerCase()) || files.some((f: any) => f.path.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchType = fileTypeFilter === 'all' || files.some((f: any) => {
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
      const matchType = fileTypeFilter === 'all' || getMimeFromExt(ext) === fileTypeFilter;
      const matchYear = !searchYear || extractYear(fileName) === searchYear;
      return matchSearch && matchType && matchYear;
    });
  })();

  const availableYears = (() => {
    const years = new Set<string>();
    uploadTree.forEach((f: any) => {
      const y = extractYear(f.path.split('/').pop() || '');
      if (y) years.add(y);
    });
    return Array.from(years).sort().reverse();
  })();

  async function downloadFile(item: any) {
    try {
      const res = await fetch(item.rawUrl || getRawUrl(item.path));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = item.name; document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
      showToast('Downloaded: ' + item.name, 'success');
    } catch { showToast('Download failed', 'error'); }
  }

  const showSearchBar = view === 'semesters' || view === 'categories' || view === 'courses' || view === 'files';

  return (
    <div className="min-h-screen bg-dark-bg text-dark-text">
      {/* NAVBAR */}
      <nav className="sticky top-0 z-[100] bg-dark-bg2 border-b border-dark-border">
        <div className="max-w-[1200px] mx-auto px-5 py-2.5 flex items-center justify-between gap-4">
          <a href="/" className="flex items-center gap-3" onClick={(e) => { e.preventDefault(); goHome(); }}>
            <Image src="/arms-logo.png" alt="QSIS-ARMS" width={40} height={40} className="w-10 h-10 p-1 rounded-full border-2 border-qsis object-contain bg-white" priority />
            <div>
              <h1 className="text-[1.1rem] font-bold bg-gradient-to-br from-qsis to-accent bg-clip-text text-transparent">QSIS-ARMS</h1>
              <span className="text-[0.7rem] text-dark-text2 hidden md:block">Academic Resource System</span>
            </div>
          </a>
          <div className="hidden md:flex items-center gap-1">
            <button className={`inline-flex items-center gap-[5px] px-3 py-1.5 rounded-lg text-[0.78rem] font-medium border-none cursor-pointer transition-all ${view === 'semesters' || view === 'categories' || view === 'courses' || view === 'files' ? 'bg-qsis/15 text-qsis' : 'bg-transparent text-dark-text2 hover:text-dark-text hover:bg-dark-bg3'}`} onClick={goHome}>
              <i className="fas fa-book-open"></i> Browse
            </button>
            <button className={`inline-flex items-center gap-[5px] px-3 py-1.5 rounded-lg text-[0.78rem] font-medium border-none cursor-pointer transition-all ${view === 'history' ? 'bg-qsis/15 text-qsis' : 'bg-transparent text-dark-text2 hover:text-dark-text hover:bg-dark-bg3'}`} onClick={navigateToHistory}>
              <i className="fas fa-history"></i> History
            </button>
            <button className={`inline-flex items-center gap-[5px] px-3 py-1.5 rounded-lg text-[0.78rem] font-medium border-none cursor-pointer transition-all ${view === 'routine' ? 'bg-qsis/15 text-qsis' : 'bg-transparent text-dark-text2 hover:text-dark-text hover:bg-dark-bg3'}`} onClick={navigateToRoutine}>
              <i className="fas fa-calendar-alt"></i> Routine
            </button>
            <button className={`inline-flex items-center gap-[5px] px-3 py-1.5 rounded-lg text-[0.78rem] font-medium border-none cursor-pointer transition-all ${view === 'contributors' ? 'bg-qsis/15 text-qsis' : 'bg-transparent text-dark-text2 hover:text-dark-text hover:bg-dark-bg3'}`} onClick={navigateToContributors}>
              <i className="fas fa-users"></i> Contributors
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-[6px] px-4 py-2 rounded-xl bg-gradient-to-br from-qsis to-qsis-dark text-white border-none cursor-pointer text-[0.8rem] font-semibold" onClick={() => setUploadOpen(true)}>
              <i className="fas fa-upload"></i> Upload
            </button>
            {status === 'authenticated' ? (
              <div className="relative">
                <button className="inline-flex items-center gap-[6px] px-2 py-1 rounded-xl border border-dark-border bg-dark-bg3 cursor-pointer" onClick={() => document.getElementById('profileDD')?.classList.toggle('hidden')}>
                  <Image src={(session as any)?.user?.image || ''} alt="" width={28} height={28} className="w-7 h-7 rounded-full" />
                </button>
                <div id="profileDD" className="profile-dropdown hidden">
                  <div className="profile-dropdown-header">
                    <Image src={(session as any)?.user?.image || ''} alt="" width={36} height={36} className="w-9 h-9 rounded-full border-2 border-qsis" />
                    <div>
                      <div className="text-[0.85rem] font-bold">{(session as any)?.user?.name || ''}</div>
                      <div className="text-[0.7rem] text-dark-text2">{session?.user?.email || ''}</div>
                    </div>
                  </div>
                  <div className="profile-dropdown-divider"></div>
                  <button className="profile-dropdown-item" onClick={() => { navigateToDashboard(); document.getElementById('profileDD')?.classList.add('hidden'); }}><i className="fas fa-th-large"></i> Dashboard</button>
                  <button className="profile-dropdown-item" onClick={() => { navigateToHistory(); document.getElementById('profileDD')?.classList.add('hidden'); }}><i className="fas fa-history"></i> History</button>
                  <div className="profile-dropdown-divider"></div>
                  <button className="profile-dropdown-item profile-dropdown-logout" onClick={() => signOut()}><i className="fas fa-sign-out-alt"></i> Logout</button>
                </div>
              </div>
            ) : (
              <button className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.8rem] font-semibold" onClick={() => setLoginModalOpen(true)}>
                <i className="fab fa-github"></i> Login
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-[1200px] mx-auto px-5 py-6 pb-24 md:pb-6">
        {/* Hero — only on browse views */}
        {(view === 'semesters' || view === 'categories' || view === 'courses' || view === 'files') && (
          <>
        <section className="py-10 px-8 text-center bg-dark-bg2 rounded-2xl mb-6 shadow-lg">
          <div className="flex items-center justify-center mb-4  ">
            <Image src="/arms-logo.png" alt="QSIS-ARMS Logo" width={110} height={110} className="w-[110px] p-2 bg-white h-[110px] rounded-2xl border-[3px] border-qsis object-contain shadow-[0_4px_20px_rgba(34,197,94,0.25)]" priority quality={100} />
          </div>
          <h2 className="text-[1.7rem] font-extrabold bg-gradient-to-br from-qsis to-accent bg-clip-text text-transparent mb-1.5">QSIS-ARMS</h2>
          <p className="text-gray-500 text-[0.95rem]">QSIS Academic Resource Management System</p>
          <div className="flex items-center justify-center gap-2 mt-2.5 flex-wrap">
            <span className="text-[0.78rem] text-gray-400">Developed by <a href="https://atiq.is-a.dev" target="_blank"> <strong className="text-qsis">Sayed Atiqur Rahman</strong> </a> &mdash; QSIS, IIUC</span>
          </div>
        </section>

        {/* Stats */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-[700px] mx-auto mb-6">
          <div className="bg-dark-bg2 border border-dark-border rounded-xl p-3.5 text-center">
            <span className="block text-[1.5rem] font-extrabold text-qsis">{semesters.filter(s => !s.isRelated).length}</span>
            <span className="text-[0.75rem] text-dark-text2">Semesters</span>
          </div>
          <div className="bg-dark-bg2 border border-dark-border rounded-xl p-3.5 text-center">
            <span className="block text-[1.5rem] font-extrabold text-qsis">
              {view === 'courses' ? filteredCourses.length : filteredCategories.reduce((s, c) => s + c.count, 0)}
            </span>
            <span className="text-[0.75rem] text-dark-text2">{view === 'courses' ? 'Courses' : 'Files'}</span>
          </div>
          <div className="bg-dark-bg2 border border-dark-border rounded-xl p-3.5 text-center">
            <span className="block text-[1.5rem] font-extrabold text-qsis">{totalFiles}</span>
            <span className="text-[0.75rem] text-dark-text2">Total Files</span>
          </div>
          <div className="bg-dark-bg2 border border-dark-border rounded-xl p-3.5 text-center">
            <span className="block text-[1.5rem] font-extrabold text-qsis">{semesters.find(s => s.isRelated)?.files || 0}</span>
            <span className="text-[0.75rem] text-dark-text2">Related Kitabs</span>
          </div>
        </section>

        {/* Search & Filter — v1 style */}
        {showSearchBar && (
          <section className="mb-5">
            <div className="bg-dark-bg2 border border-dark-border rounded-xl p-1">
              <div className="flex items-center gap-2.5 bg-dark-bg border border-dark-border rounded-lg px-3.5">
                <i className="fas fa-search text-dark-text2"></i>
                <input
                  type="text"
                  className="flex-1 bg-transparent border-none text-dark-text py-2.5 text-[0.9rem] outline-none placeholder:text-dark-text2"
                  placeholder="Search files, courses, semesters..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button className="text-dark-text2 hover:text-dark-text cursor-pointer bg-transparent border-none" onClick={() => setSearchQuery('')}>
                    <i className="fas fa-times text-[0.8rem]"></i>
                  </button>
                )}
              </div>
              <div className="flex gap-2 p-2 flex-wrap">
                <div className="relative">
                  <select
                    className="bg-dark-bg border border-dark-border text-dark-text py-1.5 px-2.5 pr-7 rounded-md text-[0.78rem] outline-none cursor-pointer focus:border-qsis appearance-none"
                    value={searchSemester}
                    onChange={(e) => setSearchSemester(e.target.value)}
                  >
                    <option value="">All Semesters</option>
                    {config.semesters.map(s => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                  <i className="fas fa-chevron-down absolute right-2 top-1/2 -translate-y-1/2 text-dark-text2 text-[0.6rem] pointer-events-none"></i>
                </div>
                <div className="relative">
                  <select
                    className="bg-dark-bg border border-dark-border text-dark-text py-1.5 px-2.5 pr-7 rounded-md text-[0.78rem] outline-none cursor-pointer focus:border-qsis appearance-none"
                    value={fileTypeFilter === 'all' ? '' : fileTypeFilter}
                    onChange={(e) => setFileTypeFilter(e.target.value || 'all')}
                  >
                    <option value="">All Types</option>
                    <option value="pdf">PDF</option>
                    <option value="doc">Document</option>
                    <option value="sheet">Sheet (XLS)</option>
                    <option value="ppt">Presentation</option>
                    <option value="image">Image</option>
                  </select>
                  <i className="fas fa-chevron-down absolute right-2 top-1/2 -translate-y-1/2 text-dark-text2 text-[0.6rem] pointer-events-none"></i>
                </div>
                <div className="relative">
                  <select
                    className="bg-dark-bg border border-dark-border text-dark-text py-1.5 px-2.5 pr-7 rounded-md text-[0.78rem] outline-none cursor-pointer focus:border-qsis appearance-none"
                    value={searchYear}
                    onChange={(e) => setSearchYear(e.target.value)}
                  >
                    <option value="">All Years</option>
                    {availableYears.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                  <i className="fas fa-chevron-down absolute right-2 top-1/2 -translate-y-1/2 text-dark-text2 text-[0.6rem] pointer-events-none"></i>
                </div>
                {(searchQuery || fileTypeFilter !== 'all' || searchSemester || searchYear) && (
                  <button
                    className="inline-flex items-center gap-[4px] px-2.5 py-1.5 rounded-md text-[0.78rem] font-semibold bg-red-500/10 text-red-400 border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-all"
                    onClick={resetFilters}
                  >
                    <i className="fas fa-times"></i> Clear
                  </button>
                )}
              </div>
            </div>
          </section>
        )}
          </>
        )}

        {/* Recent Reads — only on home */}
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
        {!loading && !error && view === 'semesters' && (
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

            {/* Related Kitabs - special card */}
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
        {!loading && !error && view === 'categories' && (
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
        {!loading && !error && view === 'courses' && (
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
        {!loading && !error && view === 'files' && currentSem && currentCat && (
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
            <FileCards items={filteredFiles} onOpen={openFile} onDownload={downloadFile} />
          </section>
        )}

        {/* History View */}
        {!loading && !error && view === 'history' && (
          <section className="mb-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold flex items-center gap-2"><i className="fas fa-history"></i> Reading History</h3>
              <button className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold" onClick={goHome}>
                <i className="fas fa-arrow-left"></i> Back
              </button>
            </div>
            {recentReads.length === 0 ? (
              <div className="text-center py-12 text-dark-text2">
                <i className="fas fa-clock text-4xl mb-3 block opacity-30"></i>
                <p className="text-[0.9rem]">No reading history yet.</p>
                <p className="text-[0.78rem] mt-1 opacity-60">Files you open will appear here.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {recentReads.map((item: any) => {
                  const name = item.path?.split('/').pop() || item.name || 'Unknown';
                  const ext = name.split('.').pop()?.toLowerCase() || '';
                  const mime = getMimeFromExt(ext);
                  return (
                    <div key={item.path} className="flex items-center gap-3 p-[14px_18px] bg-dark-bg2 border border-dark-border rounded-xl hover:border-qsis hover:shadow-[0_0_12px_rgba(34,197,94,0.15)] transition-all cursor-pointer" onClick={() => openRecentFile(item)}>
                      <div className="text-[1.3rem] flex-shrink-0">{getFileIconByType(mime)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-[0.85rem] truncate">{name}</div>
                        <div className="text-[0.7rem] text-dark-text2 truncate">{item.path}</div>
                      </div>
                      <div className="text-[0.68rem] text-dark-text2 flex-shrink-0">{item.lastRead ? timeAgo(item.lastRead) : ''}</div>
                      <button className="w-8 h-8 rounded-lg bg-qsis/10 text-qsis border-none cursor-pointer flex items-center justify-center text-[0.8rem] hover:bg-qsis/20 transition-all flex-shrink-0" onClick={(e) => { e.stopPropagation(); openRecentFile(item); }}>
                        <i className="fas fa-external-link-alt"></i>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Contributors View */}
        {!loading && !error && view === 'contributors' && (
          <section className="mb-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold flex items-center gap-2"><i className="fas fa-users"></i> Contributors</h3>
              <button className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold" onClick={goHome}>
                <i className="fas fa-arrow-left"></i> Back
              </button>
            </div>
            {contributorsLoading ? (
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
                <div className="loading-text">Loading contributors<span className="loading-dots"></span></div>
              </div>
            ) : contributors.length === 0 ? (
              <div className="text-center py-12 text-dark-text2">
                <i className="fas fa-users text-4xl mb-3 block opacity-30"></i>
                <p className="text-[0.9rem]">No contributors found.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {contributors.map((c: any) => {
                  const isFounder = c.role === 'Founder & Lead Developer';
                  return (
                    <div key={c.id} className={`${isFounder ? 'bg-gradient-to-br from-qsis/5 to-accent/5 border-qsis/40 ring-1 ring-qsis/20' : 'bg-dark-bg2 border-dark-border'} border rounded-2xl overflow-hidden hover:border-qsis hover:shadow-[0_4px_24px_rgba(34,197,94,0.15)] transition-all group`}>
                      {/* Header with avatar + role badge */}
                      <div className={`relative ${isFounder ? 'bg-gradient-to-br from-qsis/20 to-accent/15' : 'bg-gradient-to-br from-qsis/10 to-accent/10'} px-5 pt-6 pb-4 text-center`}>
                        {isFounder && (
                          <div className="absolute top-3 left-3 px-2 py-0.5 rounded-full bg-qsis/20 text-qsis text-[0.6rem] font-bold flex items-center gap-1">
                            <i className="fas fa-star"></i> Programming Light
                          </div>
                        )}
                        {c.profileComplete && (
                          <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center" title="Profile Complete">
                            <i className="fas fa-check text-white text-[0.6rem]"></i>
                          </div>
                        )}
                        <Image
                          src={c.avatar_url}
                          alt={c.login}
                          width={72}
                          height={72}
                          className={`w-[72px] h-[72px] rounded-full mx-auto mb-3 object-cover ${isFounder ? 'border-[3px] border-qsis shadow-[0_0_20px_rgba(34,197,94,0.4)]' : 'border-[3px] border-qsis'}`}
                        />
                        <h4 className="text-[1rem] font-bold text-dark-text">{c.name || c.login}</h4>
                        {isFounder && (
                          <div className="text-[0.75rem] text-qsis font-medium mt-0.5">{config.founderName}</div>
                        )}
                        <a href={c.html_url} target="_blank" rel="noopener noreferrer" className="text-[0.75rem] text-dark-text2 hover:text-qsis transition-colors">@{c.login}</a>
                        <div className="mt-2">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[0.68rem] font-semibold ${
                            isFounder ? 'bg-qsis/25 text-qsis ring-1 ring-qsis/40' :
                            c.role === 'Developer & Resource Provider' ? 'bg-purple-500/15 text-purple-400' :
                            c.role === 'Developer' ? 'bg-blue-500/15 text-blue-400' :
                            c.role === 'Resource Provider' ? 'bg-orange-500/15 text-orange-400' :
                            'bg-dark-bg3 text-dark-text2'
                          }`}>
                            <i className={`fas ${
                              isFounder ? 'fa-crown' :
                              c.role === 'Developer & Resource Provider' ? 'fa-code-branch' :
                              c.role === 'Developer' ? 'fa-laptop-code' :
                              c.role === 'Resource Provider' ? 'fa-book-open' :
                              'fa-user'
                            }`}></i>
                            {c.role}
                          </span>
                          {c.roleType === 'both' && !isFounder && (
                            <span className="ml-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.6rem] font-medium bg-green-500/10 text-green-400">
                              <i className="fas fa-check-circle"></i> Both Repos
                            </span>
                          )}
                        </div>
                        {isFounder && (
                          <div className="mt-2 flex items-center justify-center gap-2 text-[0.65rem] text-dark-text2">
                            <span><i className="fas fa-laptop-code text-blue-400 mr-1"></i>Web App</span>
                            <span><i className="fas fa-book-open text-orange-400 mr-1"></i>Data Repo</span>
                            <span><i className="fas fa-database text-green-400 mr-1"></i>Database</span>
                          </div>
                        )}
                      </div>

                    {/* Profile details */}
                    <div className="px-5 py-4">
                      {c.universityId && (
                        <div className="flex items-center gap-2.5 mb-2.5">
                          <div className="w-7 h-7 rounded-lg bg-qsis/10 flex items-center justify-center flex-shrink-0">
                            <i className="fas fa-id-card text-qsis text-[0.7rem]"></i>
                          </div>
                          <div>
                            <div className="text-[0.65rem] text-dark-text2 leading-tight">University ID</div>
                            <div className="text-[0.82rem] font-semibold text-qsis font-mono">{c.universityId}</div>
                          </div>
                        </div>
                      )}
                      {c.whatsapp && (
                        <div className="flex items-center gap-2.5 mb-2.5">
                          <div className="w-7 h-7 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
                            <i className="fab fa-whatsapp text-green-500 text-[0.7rem]"></i>
                          </div>
                          <div>
                            <div className="text-[0.65rem] text-dark-text2 leading-tight">WhatsApp</div>
                            <div className="text-[0.82rem] font-semibold">{c.whatsapp}</div>
                          </div>
                        </div>
                      )}
                      {c.semester && (
                        <div className="flex items-center gap-2.5 mb-2.5">
                          <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                            <i className="fas fa-graduation-cap text-accent text-[0.7rem]"></i>
                          </div>
                          <div>
                            <div className="text-[0.65rem] text-dark-text2 leading-tight">Semester</div>
                            <div className="text-[0.82rem] font-semibold">{config.semesters.find(s => s.id === c.semester)?.label || c.semester}</div>
                          </div>
                        </div>
                      )}
                      {c.email && (
                        <div className="flex items-center gap-2.5 mb-2.5">
                          <div className="w-7 h-7 rounded-lg bg-yellow-500/10 flex items-center justify-center flex-shrink-0">
                            <i className="fas fa-envelope text-yellow-500 text-[0.7rem]"></i>
                          </div>
                          <div className="min-w-0">
                            <div className="text-[0.65rem] text-dark-text2 leading-tight">Email</div>
                            <div className="text-[0.82rem] font-semibold truncate">{c.email}</div>
                          </div>
                        </div>
                      )}

                      {!c.universityId && !c.whatsapp && !c.semester && !c.email && (
                        <div className="text-center py-2 text-dark-text2 text-[0.78rem]">
                          <i className="fas fa-user-circle mr-1 opacity-40"></i> No profile info yet
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="px-5 py-3 border-t border-dark-border flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {c.contributions > 0 && (
                          <span className="text-[0.72rem] text-dark-text2">
                            <i className="fas fa-code-commit mr-1 text-qsis"></i>
                            {c.contributions} commit{c.contributions !== 1 ? 's' : ''}
                          </span>
                        )}
                        {c.source === 'db' && (
                          <span className="text-[0.72rem] text-dark-text2">
                            <i className="fas fa-file-upload mr-1 text-accent"></i>PR Contributor
                          </span>
                        )}
                      </div>
                      <a href={c.html_url} target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-lg bg-dark-bg3 flex items-center justify-center text-dark-text2 hover:text-qsis hover:bg-qsis/10 transition-all" title="View GitHub Profile">
                        <i className="fab fa-github text-[0.9rem]"></i>
                      </a>
                    </div>
                  </div>
                )})}
              </div>
            )}
          </section>
        )}

        {/* Routine View */}
        {!loading && !error && view === 'routine' && (
          <section className="mb-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold flex items-center gap-2"><i className="fas fa-calendar-alt"></i> Class Routine</h3>
              <button className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold" onClick={goHome}>
                <i className="fas fa-arrow-left"></i> Back
              </button>
            </div>
            {routineLoading ? (
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
                <div className="loading-text">Loading routine<span className="loading-dots"></span></div>
              </div>
            ) : routineData.length === 0 ? (
              <div className="text-center py-12 text-dark-bg2 rounded-2xl border border-dark-border">
                <i className="fas fa-calendar-times text-4xl text-dark-text2 mb-3 block opacity-30"></i>
                <p className="text-[0.9rem] text-dark-text2">No routine available yet.</p>
                <p className="text-[0.78rem] text-dark-text2 mt-1 opacity-60">Class routine will be published by the department.</p>
                <a href="https://www.facebook.com/DQSIS" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-xl bg-qsis/10 text-qsis text-[0.8rem] font-semibold hover:bg-qsis/20 transition-all">
                  <i className="fab fa-facebook"></i> Check Facebook for Updates
                </a>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse bg-dark-bg2 rounded-xl overflow-hidden">
                  <thead>
                    <tr className="bg-dark-bg3">
                      <th className="text-left text-[0.78rem] font-semibold text-dark-text p-3 border-b border-dark-border">Day</th>
                      <th className="text-left text-[0.78rem] font-semibold text-dark-text p-3 border-b border-dark-border">Time</th>
                      <th className="text-left text-[0.78rem] font-semibold text-dark-text p-3 border-b border-dark-border">Course</th>
                      <th className="text-left text-[0.78rem] font-semibold text-dark-text p-3 border-b border-dark-border">Room</th>
                      <th className="text-left text-[0.78rem] font-semibold text-dark-text p-3 border-b border-dark-border">Teacher</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routineData.map((r: any, i: number) => (
                      <tr key={i} className="hover:bg-dark-bg3 transition-colors">
                        <td className="text-[0.82rem] p-3 border-b border-dark-border">{r.day}</td>
                        <td className="text-[0.82rem] p-3 border-b border-dark-border text-qsis font-medium">{r.time}</td>
                        <td className="text-[0.82rem] p-3 border-b border-dark-border font-semibold">{r.course}</td>
                        <td className="text-[0.82rem] p-3 border-b border-dark-border">{r.room}</td>
                        <td className="text-[0.82rem] p-3 border-b border-dark-border text-dark-text2">{r.teacher}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Dashboard View */}
        {!loading && !error && view === 'dashboard' && (
          <section className="mb-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold flex items-center gap-2"><i className="fas fa-th-large"></i> Dashboard</h3>
              <button className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold" onClick={goHome}>
                <i className="fas fa-arrow-left"></i> Back
              </button>
            </div>

            {/* Profile Card */}
            <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5 mb-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <Image src={(session as any)?.user?.image || profile.image || ''} alt="" width={64} height={64} className="w-16 h-16 rounded-full border-2 border-qsis" />
                  <div>
                    <h4 className="text-[1.1rem] font-bold">{(session as any)?.user?.name || profile.name || 'User'}</h4>
                    <p className="text-[0.82rem] text-dark-text2">{session?.user?.email || profile.email || ''}</p>
                  </div>
                </div>
                {!editingProfile && (
                  <button className="px-3 py-1.5 rounded-lg border border-dark-border bg-dark-bg3 text-dark-text text-[0.75rem] font-semibold cursor-pointer hover:border-qsis transition-all" onClick={() => {
                    setProfileForm({ universityId: profile.universityId, name: profile.name || (session as any)?.user?.name || '', whatsapp: profile.whatsapp, semester: profile.semester });
                    setEditingProfile(true);
                  }}>
                    <i className="fas fa-pen mr-1"></i> Edit Profile
                  </button>
                )}
              </div>

              {/* Profile Completion */}
              {(() => {
                const filled = [profile.universityId, profile.name || (session as any)?.user?.name, profile.whatsapp, profile.semester].filter(Boolean).length;
                const pct = Math.round((filled / 4) * 100);
                return (
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[0.78rem] text-dark-text2">Profile Completion</span>
                      <span className="text-[0.78rem] font-semibold text-qsis">{pct}%</span>
                    </div>
                    <div className="w-full h-2 bg-dark-bg3 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-qsis to-accent rounded-full transition-all" style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                );
              })()}

              {editingProfile ? (
                <div className="bg-dark-bg3 border border-dark-border rounded-xl p-4">
                  <h5 className="text-[0.85rem] font-semibold mb-3"><i className="fas fa-user-edit text-qsis mr-2"></i>Edit Profile</h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="text-[0.72rem] text-dark-text2 block mb-1">University ID *</label>
                      <input type="text" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" placeholder="e.g. Q233099" value={profileForm.universityId} onChange={e => setProfileForm(p => ({ ...p, universityId: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-[0.72rem] text-dark-text2 block mb-1">Full Name *</label>
                      <input type="text" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" placeholder="e.g. Sayed Atiqur Rahman" value={profileForm.name} onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-[0.72rem] text-dark-text2 block mb-1">WhatsApp</label>
                      <input type="tel" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" placeholder="e.g. +8801XXXXXXXXX" value={profileForm.whatsapp} onChange={e => setProfileForm(p => ({ ...p, whatsapp: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-[0.72rem] text-dark-text2 block mb-1">Current Semester</label>
                      <select className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" value={profileForm.semester} onChange={e => setProfileForm(p => ({ ...p, semester: e.target.value }))}>
                        <option value="">Select semester...</option>
                        {config.semesters.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="px-4 py-2 rounded-xl bg-gradient-to-br from-qsis to-qsis-dark text-white border-none font-semibold text-[0.8rem] cursor-pointer hover:opacity-90 transition-opacity" onClick={() => {
                      updateProfile(profileForm);
                      setEditingProfile(false);
                      showToast('Profile saved!', 'success');
                    }}>
                      <i className="fas fa-save mr-1"></i> Save Profile
                    </button>
                    <button className="px-4 py-2 rounded-xl border border-dark-border bg-dark-bg text-dark-text font-semibold text-[0.8rem] cursor-pointer hover:border-qsis transition-all" onClick={() => setEditingProfile(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-dark-bg3 border border-dark-border">
                    <span className="text-[0.7rem] text-dark-text2 block mb-1">University ID</span>
                    <span className={`text-[0.85rem] font-semibold ${profile.universityId ? 'text-qsis' : 'text-dark-text2'}`}>{profile.universityId || 'Not set'}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-dark-bg3 border border-dark-border">
                    <span className="text-[0.7rem] text-dark-text2 block mb-1">Department</span>
                    <span className="text-[0.85rem] font-semibold">Qur'anic Sciences & Islamic Studies</span>
                  </div>
                  <div className="p-3 rounded-lg bg-dark-bg3 border border-dark-border">
                    <span className="text-[0.7rem] text-dark-text2 block mb-1">WhatsApp</span>
                    <span className={`text-[0.85rem] font-semibold ${profile.whatsapp ? '' : 'text-dark-text2'}`}>{profile.whatsapp || 'Not set'}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-dark-bg3 border border-dark-border">
                    <span className="text-[0.7rem] text-dark-text2 block mb-1">Semester</span>
                    <span className={`text-[0.85rem] font-semibold ${profile.semester ? '' : 'text-dark-text2'}`}>{profile.semester ? config.semesters.find(s => s.id === profile.semester)?.label || profile.semester : 'Not set'}</span>
                  </div>
                </div>
              )}
            </div>

            {/* GitHub Connection */}
            <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5 mb-4">
              <h4 className="text-[0.95rem] font-semibold mb-3 flex items-center gap-2">
                <i className="fab fa-github"></i> GitHub Connection
              </h4>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-dark-bg3 border border-dark-border">
                <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                  <i className="fas fa-check-circle text-green-500"></i>
                </div>
                <div className="flex-1">
                  <span className="text-[0.85rem] font-semibold block">Connected</span>
                  <span className="text-[0.72rem] text-dark-text2">You can upload and create PRs</span>
                </div>
                <button className="px-3 py-1.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.75rem] font-semibold cursor-pointer hover:border-qsis transition-all">
                  Manage
                </button>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5 mb-4">
              <h4 className="text-[0.95rem] font-semibold mb-3"><i className="fas fa-bolt"></i> Quick Actions</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <button className="flex flex-col items-center gap-2 p-4 rounded-xl border border-dark-border bg-dark-bg3 hover:border-qsis hover:bg-qsis/5 transition-all cursor-pointer" onClick={() => setUploadOpen(true)}>
                  <i className="fas fa-upload text-[1.2rem] text-qsis"></i>
                  <span className="text-[0.75rem] font-semibold">Upload Files</span>
                </button>
                <button className="flex flex-col items-center gap-2 p-4 rounded-xl border border-dark-border bg-dark-bg3 hover:border-qsis hover:bg-qsis/5 transition-all cursor-pointer" onClick={navigateToRoutine}>
                  <i className="fas fa-calendar-alt text-[1.2rem] text-accent"></i>
                  <span className="text-[0.75rem] font-semibold">View Routine</span>
                </button>
                <button className="flex flex-col items-center gap-2 p-4 rounded-xl border border-dark-border bg-dark-bg3 hover:border-qsis hover:bg-qsis/5 transition-all cursor-pointer" onClick={navigateToHistory}>
                  <i className="fas fa-history text-[1.2rem] text-yellow-500"></i>
                  <span className="text-[0.75rem] font-semibold">My History</span>
                </button>
                <button className="flex flex-col items-center gap-2 p-4 rounded-xl border border-dark-border bg-dark-bg3 hover:border-qsis hover:bg-qsis/5 transition-all cursor-pointer" onClick={navigateToContributors}>
                  <i className="fas fa-users text-[1.2rem] text-blue-500"></i>
                  <span className="text-[0.75rem] font-semibold">Team</span>
                </button>
              </div>
            </div>

            {/* Activity */}
            <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5">
              <h4 className="text-[0.95rem] font-semibold mb-3"><i className="fas fa-chart-line"></i> Recent Activity</h4>
              {recentReads.length === 0 ? (
                <div className="text-center py-6 text-dark-text2">
                  <i className="fas fa-clock text-2xl mb-2 block opacity-30"></i>
                  <p className="text-[0.82rem]">No activity yet. Start browsing files!</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {recentReads.slice(0, 5).map((item: any) => (
                    <div key={item.path} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-dark-bg3 transition-colors cursor-pointer" onClick={() => openRecentFile(item)}>
                      <div className="text-[1.1rem]">{getFileIconByType(item.mimeType)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[0.82rem] font-semibold truncate">{item.name}</div>
                        <div className="text-[0.68rem] text-dark-text2">{item.lastRead ? timeAgo(item.lastRead) : ''}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* MOBILE BOTTOM NAV */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-[90] bg-dark-bg2 border-t border-dark-border safe-bottom">
        <div className="flex items-center justify-around py-2 px-1">
          <button className={`flex flex-col items-center gap-[2px] px-3 py-1 rounded-lg border-none cursor-pointer transition-all ${view === 'semesters' || view === 'categories' || view === 'courses' || view === 'files' ? 'bg-qsis/15 text-qsis' : 'bg-transparent text-dark-text2'}`} onClick={goHome}>
            <i className="fas fa-book-open text-[1rem]"></i>
            <span className="text-[0.62rem] font-medium">Browse</span>
          </button>
          <button className={`flex flex-col items-center gap-[2px] px-3 py-1 rounded-lg border-none cursor-pointer transition-all ${view === 'history' ? 'bg-qsis/15 text-qsis' : 'bg-transparent text-dark-text2'}`} onClick={navigateToHistory}>
            <i className="fas fa-history text-[1rem]"></i>
            <span className="text-[0.62rem] font-medium">History</span>
          </button>
          <button className={`flex flex-col items-center gap-[2px] px-3 py-1 rounded-lg border-none cursor-pointer transition-all ${view === 'routine' ? 'bg-qsis/15 text-qsis' : 'bg-transparent text-dark-text2'}`} onClick={navigateToRoutine}>
            <i className="fas fa-calendar-alt text-[1rem]"></i>
            <span className="text-[0.62rem] font-medium">Routine</span>
          </button>
          <button className={`flex flex-col items-center gap-[2px] px-3 py-1 rounded-lg border-none cursor-pointer transition-all ${view === 'contributors' ? 'bg-qsis/15 text-qsis' : 'bg-transparent text-dark-text2'}`} onClick={navigateToContributors}>
            <i className="fas fa-users text-[1rem]"></i>
            <span className="text-[0.62rem] font-medium">Team</span>
          </button>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="bg-dark-bg2 border-t border-dark-border mt-8">
        <div className="max-w-[1200px] mx-auto px-5 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <Image src="/arms-logo.png" alt="QSIS-ARMS" width={36} height={36} className="w-9 h-9 rounded-full border-2 border-qsis object-contain bg-white" />
                <div>
                  <h3 className="text-[0.95rem] font-bold bg-gradient-to-br from-qsis to-accent bg-clip-text text-transparent">QSIS-ARMS</h3>
                  <span className="text-[0.68rem] text-dark-text2">Academic Resource System</span>
                </div>
              </div>
              <p className="text-[0.8rem] text-dark-text2 leading-relaxed">A centralized platform for managing and sharing academic resources for the Department of Qur'anic Sciences & Islamic Studies, IIUC.</p>
            </div>
            <div>
              <h4 className="text-[0.85rem] font-semibold text-dark-text mb-3">Quick Links</h4>
              <div className="flex flex-col gap-2">
                <button className="text-[0.8rem] text-dark-text2 hover:text-qsis text-left bg-transparent border-none cursor-pointer transition-colors" onClick={goHome}><i className="fas fa-home mr-2"></i>Dashboard</button>
                <button className="text-[0.8rem] text-dark-text2 hover:text-qsis text-left bg-transparent border-none cursor-pointer transition-colors" onClick={() => setUploadOpen(true)}><i className="fas fa-upload mr-2"></i>Upload Files</button>
                <button className="text-[0.8rem] text-dark-text2 hover:text-qsis text-left bg-transparent border-none cursor-pointer transition-colors" onClick={navigateToHistory}><i className="fas fa-history mr-2"></i>History</button>
                <button className="text-[0.8rem] text-dark-text2 hover:text-qsis text-left bg-transparent border-none cursor-pointer transition-colors" onClick={navigateToRoutine}><i className="fas fa-calendar-alt mr-2"></i>Routine</button>
                <button className="text-[0.8rem] text-dark-text2 hover:text-qsis text-left bg-transparent border-none cursor-pointer transition-colors" onClick={navigateToContributors}><i className="fas fa-users mr-2"></i>Contributors</button>
                <a href="https://github.com/sayedatiqurrahman/QSIS-ACADEMIC-FILES-MANAFGER" target="_blank" className="text-[0.8rem] text-dark-text2 hover:text-qsis transition-colors"><i className="fab fa-github mr-2"></i>GitHub Repo</a>
              </div>
            </div>
            <div>
              <h4 className="text-[0.85rem] font-semibold text-dark-text mb-3">Organizations</h4>
              <div className="flex flex-col gap-2.5">
                <a href="https://www.iiuc.ac.bd/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 group">
                  <Image src="/iiuc-logo.png" alt="IIUC" width={28} height={28} className="w-7 h-7 rounded-md object-contain bg-white" />
                  <span className="text-[0.78rem] text-dark-text2 group-hover:text-qsis transition-colors">International Islamic University Chittagong</span>
                </a>
                <a href="https://www.facebook.com/DQSIS" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 group">
                  <Image src="/qsis-logo.jpg" alt="Qur'anic Sciences Club" width={28} height={28} className="w-7 h-7 rounded-md object-contain bg-white" />
                  <span className="text-[0.78rem] text-dark-text2 group-hover:text-qsis transition-colors">Qur'anic Sciences Club, IIUC</span>
                </a>
              </div>
              <div className="mt-4 pt-3 border-t border-dark-border">
                <a href="https://programming-light.eu.cc" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 group">
                  <Image src="/pl-logo.png" alt="Programming Light" width={28} height={28} className="w-7 h-7 rounded-md object-contain bg-white" />
                  <span className="text-[0.78rem] text-dark-text2 group-hover:text-qsis transition-colors">Presented by <strong className="text-qsis">Programming Light</strong></span>
                </a>
              </div>
            </div>
          </div>
          <div className="border-t border-dark-border mt-6 pt-5 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-[0.72rem] text-dark-text2">&copy; {new Date().getFullYear()} QSIS-ARMS. All rights reserved.</p>
            <div className="flex items-center gap-3">
              <a href="https://github.com/sayedatiqurrahman/QSIS-ACADEMIC-FILES-MANAFGER" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-bg3 border border-dark-border text-[0.72rem] text-dark-text2 hover:text-qsis hover:border-qsis transition-all">
                <i className="fas fa-star text-yellow-500"></i> Star Files Repo
              </a>
              <a href="https://github.com/sayedatiqurrahman/QSIS-ACADEMIC-FILES-MANAFGER/fork" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-bg3 border border-dark-border text-[0.72rem] text-dark-text2 hover:text-qsis hover:border-qsis transition-all">
                <i className="fas fa-code-fork text-qsis"></i> Fork to Contribute
              </a>
              <a href="https://github.com/sayedatiqurrahman/QSIS-ARMS-v2" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-bg3 border border-dark-border text-[0.72rem] text-dark-text2 hover:text-qsis hover:border-qsis transition-all">
                <i className="fab fa-github"></i> Source Code
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* UPLOAD MODAL */}
      {uploadOpen && <UploadModal
        session={session}
        status={status}
        profile={profile}
        onLogin={() => { setUploadOpen(false); setLoginModalOpen(true); }}
        onClose={() => setUploadOpen(false)}
      />}

      {/* VIEWER OVERLAY */}
      {viewerOpen && viewerItem && (
        <div className="viewer-overlay active">
          <div className="viewer-container">
            {viewerItem.mimeType !== 'pdf' && viewerItem.mimeType !== 'image' && (
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-dark-border bg-dark-bg3">
                <div className="flex items-center gap-2 font-semibold text-sm truncate flex-1">
                  <i className={`fas fa-${getFileIcon(viewerItem.mimeType === 'doc' ? 'doc' : viewerItem.mimeType === 'sheet' ? 'xls' : viewerItem.mimeType === 'ppt' ? 'ppt' : 'pdf')}`}></i>
                  <span className="truncate">{viewerItem.name}</span>
                </div>
                <button className="ml-3 w-7 h-7 rounded-lg bg-red-500 text-white border-none cursor-pointer flex items-center justify-center text-sm hover:bg-red-600" onClick={closeViewer}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              {viewerItem.mimeType === 'pdf' && <PdfViewer item={viewerItem} onClose={closeViewer} />}
              {viewerItem.mimeType === 'image' && <ImageViewer item={viewerItem} onClose={closeViewer} />}
              {viewerItem.mimeType === 'doc' && (
                <iframe src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(viewerItem.rawUrl)}`} className="w-full border-none" style={{minHeight:'calc(100vh - 50px)'}}></iframe>
              )}
              {viewerItem.mimeType === 'sheet' && (
                <iframe src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(viewerItem.rawUrl)}`} className="w-full border-none" style={{minHeight:'calc(100vh - 50px)'}}></iframe>
              )}
              {viewerItem.mimeType === 'ppt' && (
                <iframe src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(viewerItem.rawUrl)}`} className="w-full border-none" style={{minHeight:'calc(100vh - 50px)'}}></iframe>
              )}
              {viewerItem.mimeType === 'other' && (
                <div className="flex flex-col items-center justify-center min-h-[calc(100vh-50px)] text-dark-text2">
                  <i className="fas fa-file text-4xl mb-4"></i>
                  <p>Preview not available for this file type.</p>
                  <a href={viewerItem.rawUrl} target="_blank" className="mt-3 px-4 py-2 rounded-xl bg-qsis text-white text-sm font-semibold">
                    <i className="fas fa-external-link-alt"></i> Open in new tab
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* LOGIN MODAL */}
      <LoginModal isOpen={loginModalOpen} onClose={() => setLoginModalOpen(false)} />
    </div>
  );
}

/* ─── FILE CARD COMPONENT ─── */
function FileCards({ items, onOpen, onDownload }: { items: any[]; onOpen: (item: any) => void; onDownload: (item: any) => void }) {
  if (!items || items.length === 0) {
    return <div className="text-center py-10 text-dark-text2"><i className="fas fa-folder-open"></i> No files here yet.</div>;
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((item: any) => {
        const name = item.path.split('/').pop() || '';
        const ext = name.split('.').pop()?.toLowerCase() || '';
        const mime = getMimeFromExt(ext);
        const id = makeId(item.path);
        return (
          <div key={item.path} className="bg-dark-bg2 border border-dark-border rounded-xl p-[12px_14px] transition-all hover:border-qsis hover:shadow-[0_0_12px_rgba(34,197,94,0.3)]" id={`file-${id}`}>
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
              <button className="bg-transparent border border-qsis text-qsis cursor-pointer w-[30px] h-[30px] rounded-md inline-flex items-center justify-center text-[0.8rem] hover:bg-[rgba(34,197,94,.15)] transition-all" title="Download" onClick={(e) => { e.stopPropagation(); onDownload({...item, name}); }}>
                <i className="fas fa-download"></i>
              </button>
              <button className="bg-transparent border border-accent text-accent cursor-pointer w-[30px] h-[30px] rounded-md inline-flex items-center justify-center text-[0.8rem] hover:bg-[rgba(16,185,129,.15)] transition-all" title="Save as" onClick={(e) => { e.stopPropagation(); onDownload({...item, name}); }}>
                <i className="fas fa-share-alt"></i>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── PDF VIEWER - Adobe Acrobat Embed SDK ─── */
function PdfViewer({ item, onClose }: { item: any; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const adobeViewRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const divId = 'adobe-pdf-' + Date.now();
    const container = containerRef.current;
    container.innerHTML = `<div id="${divId}" style="width:100%;height:100%;position:relative"></div>`;

    const closeBtn = document.createElement('button');
    closeBtn.title = 'Close PDF';
    closeBtn.style.cssText = 'position:fixed;top:9px;left:19px;z-index:2147483647;width:27px;height:27px;border-radius:7px;background:#eb0e00;color:rgb(255,256,255);border:2px solid rgb(255,255,255);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:0.85rem;box-shadow:rgba(0,0,0,0.5) 0px 4px 16px;transition:0.15s;transform:scale(1)';
    closeBtn.innerHTML = '<i class="fas fa-times" style="font-size:0.75rem"></i>';
    closeBtn.onmouseover = function() { closeBtn.style.background = '#dc2626'; closeBtn.style.transform = 'scale(1.15)'; };
    closeBtn.onmouseout = function() { closeBtn.style.background = '#ef4444'; closeBtn.style.transform = 'scale(1)'; };
    closeBtn.onclick = onClose;
    document.body.appendChild(closeBtn);

    const savedPage = getSavedPdfPage(item.path);

    function initAdobe() {
      if (typeof (window as any).AdobeDC !== 'undefined') {
        try {
          const adobeDCView = new (window as any).AdobeDC.View({ clientId: config.adobeClientId, divId: divId });
          adobeViewRef.current = adobeDCView;
          adobeDCView.previewFile({
            content: { location: { url: item.rawUrl } },
            metaData: { fileName: item.name }
          }, {}).then((adobeViewer: any) => {
            adobeViewer.getAPIs().then((apis: any) => {
              if (savedPage > 1) apis.gotoLocation(savedPage).catch(() => {});
              let lastSaved = savedPage;
              setInterval(() => {
                apis.getCurrentPage().then((page: number) => {
                  if (page && page !== lastSaved) { lastSaved = page; savePdfPage(item.path, page); }
                }).catch(() => {});
              }, 2000);
            }).catch(() => {});
          }).catch((err: any) => {
            console.warn('Adobe preview failed:', err);
            fallbackPdf(container, item);
          });
        } catch (err) {
          console.warn('Adobe init failed:', err);
          fallbackPdf(container, item);
        }
      } else {
        document.addEventListener('adobe_dc_view_sdk.ready', function handler() {
          document.removeEventListener('adobe_dc_view_sdk.ready', handler);
          initAdobe();
        });
        setTimeout(() => {
          if (typeof (window as any).AdobeDC === 'undefined') fallbackPdf(container, item);
        }, 8000);
      }
    }

    initAdobe();

    return () => {
      closeBtn.remove();
      container.innerHTML = '';
    };
  }, [item]);

  return <div ref={containerRef} className="w-full h-full"></div>;
}

function fallbackPdf(container: HTMLElement, item: any) {
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:16px;color:#94a3b8">
      <i class="fas fa-file-pdf" style="font-size:3rem;color:#ef4444"></i>
      <p>PDF viewer unavailable.</p>
      <a href="${item.rawUrl}" target="_blank" style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:12px;background:linear-gradient(135deg,#22c55e,#16a34a);color:white;text-decoration:none;font-weight:600;font-size:0.85rem">
        <i class="fas fa-external-link-alt"></i> Open in new tab
      </a>
    </div>`;
}

/* ─── IMAGE VIEWER with zoom/pan ─── */
function ImageViewer({ item, onClose }: { item: any; onClose: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const panRef = useRef({x:0,y:0});
  const dragRef = useRef({dragging:false,startX:0,startY:0});

  const zoom = useAppStore(s => s.imgZoom);
  const rotation = useAppStore(s => s.imgRotation);
  const setZoom = useAppStore(s => s.setImgZoom);
  const setRotation = useAppStore(s => s.setImgRotation);

  function applyTransform(z: number, r: number) {
    const img = imgRef.current;
    if (img) img.style.transform = `translate(${panRef.current.x}px,${panRef.current.y}px) scale(${z/100}) rotate(${r}deg)`;
  }

  function zoomIn() {
    const z = Math.min(zoom + 15, 400);
    setZoom(z);
    applyTransform(z, rotation);
  }

  function zoomOut() {
    const z = Math.max(zoom - 15, 20);
    setZoom(z);
    if (z <= 100) { panRef.current = {x:0,y:0}; applyTransform(z, rotation); }
    else applyTransform(z, rotation);
  }

  function fit() {
    setZoom(100); setRotation(0); panRef.current = {x:0,y:0};
    applyTransform(100, 0);
  }

  function rotate() {
    const r = (rotation + 90) % 360;
    setRotation(r);
    applyTransform(zoom, r);
  }

  function handToggle() {
    const z = zoom <= 100 ? 150 : zoom;
    setZoom(z);
    applyTransform(z, rotation);
  }

  useEffect(() => {
    const scrollArea = scrollRef.current;
    if (!scrollArea) return;

    function onMouseDown(e: MouseEvent) {
      if (zoom <= 100) return;
      e.preventDefault();
      dragRef.current = { dragging: true, startX: e.clientX - panRef.current.x, startY: e.clientY - panRef.current.y };
      scrollArea!.style.cursor = 'grabbing';
    }
    function onMouseMove(e: MouseEvent) {
      if (!dragRef.current.dragging) return;
      panRef.current = { x: e.clientX - dragRef.current.startX, y: e.clientY - dragRef.current.startY };
      applyTransform(zoom, rotation);
    }
    function onMouseUp() {
      if (dragRef.current.dragging) {
        dragRef.current.dragging = false;
        if (scrollArea) scrollArea.style.cursor = zoom > 100 ? 'grab' : 'default';
      }
    }
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      if (e.deltaY < 0) zoomIn(); else zoomOut();
    }

    scrollArea.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    scrollArea.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      scrollArea.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      scrollArea.removeEventListener('wheel', onWheel);
    };
  }, [zoom, rotation]);

  return (
    <div className="image-viewer-container">
      <div className="image-toolbar">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <i className="fas fa-image text-qsis flex-shrink-0"></i>
          <span className="text-[0.85rem] font-semibold truncate">{item.name}</span>
        </div>
        <button className="pdf-btn" onClick={zoomOut} title="Zoom Out"><i className="fas fa-minus"></i></button>
        <span className="text-[0.8rem] font-semibold min-w-[40px] text-center">{zoom}%</span>
        <button className="pdf-btn" onClick={zoomIn} title="Zoom In"><i className="fas fa-plus"></i></button>
        <button className="pdf-btn" onClick={fit} title="Fit"><i className="fas fa-expand"></i> Fit</button>
        <button className="pdf-btn" onClick={rotate} title="Rotate"><i className="fas fa-redo"></i></button>
        <button className="pdf-btn" onClick={handToggle} title="Hand/Pan"><i className="fas fa-hand-paper"></i></button>
        <button className="pdf-btn" onClick={onClose} title="Close" style={{background:'#ef4444',color:'white',borderRadius:'7px'}}><i className="fas fa-times"></i></button>
      </div>
      <div className="image-scroll-area" ref={scrollRef} style={{cursor: zoom > 100 ? 'grab' : 'default'}}>
        <img ref={imgRef} src={item.rawUrl} alt={item.name} draggable={false} className="max-w-full max-h-full object-contain rounded transition-transform" />
      </div>
    </div>
  );
}

function showToast(msg: string, type: string) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${type || 'info'} show`;
  clearTimeout((t as any)._timer);
  (t as any)._timer = setTimeout(() => t.classList.remove('show'), 3500);
}
