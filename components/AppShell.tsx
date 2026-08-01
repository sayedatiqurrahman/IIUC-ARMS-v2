'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import { useAppStore, getSavedPdfPage } from '@/lib/store';
import LoginModal from '@/components/LoginModal';
import UploadModal from '@/components/UploadModal';
import PdfViewer from '@/components/PdfViewer';
import OnboardingModal, { getOnboardingData, type OnboardingData } from '@/components/OnboardingModal';
import { useState, useEffect, useRef } from 'react';
import { signOut } from 'next-auth/react';
import { config } from '@/lib/config';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [showMoreSheet, setShowMoreSheet] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const goHome = useAppStore(s => s.goHome);
  const setUploadOpen = useAppStore(s => s.setUploadOpen);
  const uploadOpen = useAppStore(s => s.uploadOpen);
  const viewerOpen = useAppStore(s => s.viewerOpen);
  const viewerItem = useAppStore(s => s.viewerItem);
  const closeViewer = useAppStore(s => s.closeViewer);
  const profile = useAppStore(s => s.profile);
  const loadTree = useAppStore(s => s.loadTree);
  const loadCourses = useAppStore(s => s.loadCourses);
  const loadProfile = useAppStore(s => s.loadProfile);
  const loadRecentReads = useAppStore(s => s.loadRecentReads);
  const navigateToDashboard = useAppStore(s => s.navigateToDashboard);
  const loadOnboarding = useAppStore(s => s.loadOnboarding);
  const setStoreOnboarding = useAppStore(s => s.setOnboardingData);

  useEffect(() => {
    loadTree(session?.accessToken || '');
    loadCourses();
    loadRecentReads();
    loadOnboarding();
    // Check onboarding
    const data = getOnboardingData();
    if (!data) {
      setShowOnboarding(true);
    } else {
      setOnboardingDone(true);
    }
  }, []);

  // Register service worker for offline/PWA support
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  // Refresh tree when user returns to tab (visibility change) — no polling, saves API calls
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        loadTree(session?.accessToken || '');
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [session?.accessToken]);

  useEffect(() => {
    if (status === 'authenticated') {
      loadProfile();
      // Close login modal when session is established (e.g. magic link in another tab)
      setLoginModalOpen(false);
    }
  }, [status]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProfileDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isBrowse = pathname === '/' || pathname.startsWith('/semester');
  const isActive = (path: string) => pathname === path;

  return (
    <div className="min-h-screen bg-dark-bg text-dark-text">
      {/* NAVBAR */}
      <nav className="sticky top-0 z-[100] bg-dark-bg2 border-b border-dark-border">
        <div className="max-w-[1200px] mx-auto px-5 py-2.5 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 no-underline" onClick={(e) => { e.preventDefault(); goHome(); router.push('/'); }}>
            <Image src="/arms-logo-icon.png" alt="IIUC-ARMS" width={40} height={40} className="w-10 h-10 p-1 rounded-full border-2 border-qsis object-contain bg-white" priority />
            <div>
              <h1 className="text-[1.1rem] font-bold bg-gradient-to-br from-qsis to-accent bg-clip-text text-transparent">IIUC-ARMS</h1>
              <span className="text-[0.7rem] text-dark-text2 hidden md:block">Academic Resource System</span>
            </div>
          </Link>
          <div className="hidden md:flex items-center gap-1">
            <Link href="/" className={`inline-flex items-center gap-[5px] px-3 py-1.5 rounded-lg text-[0.78rem] font-medium border-none cursor-pointer transition-all no-underline ${isBrowse ? 'bg-qsis/15 text-qsis' : 'bg-transparent text-dark-text2 hover:text-dark-text hover:bg-dark-bg3'}`}>
              <i className="fas fa-book-open"></i> Browse
            </Link>
            <Link href="/history" className={`inline-flex items-center gap-[5px] px-3 py-1.5 rounded-lg text-[0.78rem] font-medium border-none cursor-pointer transition-all no-underline ${isActive('/history') ? 'bg-qsis/15 text-qsis' : 'bg-transparent text-dark-text2 hover:text-dark-text hover:bg-dark-bg3'}`}>
              <i className="fas fa-history"></i> History
            </Link>
            <Link href="/routine" className={`inline-flex items-center gap-[5px] px-3 py-1.5 rounded-lg text-[0.78rem] font-medium border-none cursor-pointer transition-all no-underline ${isActive('/routine') ? 'bg-qsis/15 text-qsis' : 'bg-transparent text-dark-text2 hover:text-dark-text hover:bg-dark-bg3'}`}>
              <i className="fas fa-calendar-alt"></i> Routine
            </Link>
            <Link href="/contributors" className={`inline-flex items-center gap-[5px] px-3 py-1.5 rounded-lg text-[0.78rem] font-medium border-none cursor-pointer transition-all no-underline ${isActive('/contributors') ? 'bg-qsis/15 text-qsis' : 'bg-transparent text-dark-text2 hover:text-dark-text hover:bg-dark-bg3'}`}>
              <i className="fas fa-users"></i> Contributors
            </Link>
            <Link href="/faculty" className={`inline-flex items-center gap-[5px] px-3 py-1.5 rounded-lg text-[0.78rem] font-medium border-none cursor-pointer transition-all no-underline ${isActive('/faculty') ? 'bg-qsis/15 text-qsis' : 'bg-transparent text-dark-text2 hover:text-dark-text hover:bg-dark-bg3'}`}>
              <i className="fas fa-chalkboard-teacher"></i> Faculty
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <button className="hidden md:inline-flex items-center gap-[5px] px-3 py-1.5 rounded-lg text-[0.78rem] font-medium border border-qsis/30 bg-qsis/10 text-qsis cursor-pointer hover:bg-qsis/20 transition-all" onClick={() => setUploadOpen(true)}>
              <i className="fas fa-upload"></i> Upload
            </button>
            {status === 'loading' ? (
              <div className="w-9 h-9 rounded-full bg-dark-bg3 animate-pulse"></div>
            ) : session ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  className="cursor-pointer bg-transparent border-none p-0"
                >
                  <Image src={profile.image || (session as any)?.user?.image || `https://ui-avatars.com/api/?name=${encodeURIComponent((session as any)?.user?.name || 'User')}&background=22c55e&color=fff&bold=true&size=80`} alt="" width={36} height={36} className="w-9 h-9 rounded-full border-2 border-dark-border hover:border-qsis transition-all object-cover" />
                </button>
                {profileDropdownOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-dark-bg2 border border-dark-border rounded-xl shadow-lg py-2 z-[110]">
                    <div className="px-4 py-2 border-b border-dark-border">
                      <p className="text-[0.78rem] font-semibold text-dark-text truncate">{(session as any)?.user?.name || 'User'}</p>
                      <p className="text-[0.68rem] text-dark-text2 truncate">{(session as any)?.user?.email || ''}</p>
                    </div>
                    <button
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[0.8rem] text-dark-text hover:bg-dark-bg3 cursor-pointer bg-transparent border-none text-left transition-colors"
                      onClick={() => { setProfileDropdownOpen(false); router.push('/dashboard'); }}
                    >
                      <i className="fas fa-th-large w-4 text-center text-dark-text2"></i> Dashboard
                    </button>
                    {config.adminEmails.includes((session as any)?.user?.email || '') && (
                      <button
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[0.8rem] text-dark-text hover:bg-dark-bg3 cursor-pointer bg-transparent border-none text-left transition-colors"
                        onClick={() => { setProfileDropdownOpen(false); router.push('/admin'); }}
                      >
                        <i className="fas fa-shield-alt w-4 text-center text-qsis"></i> Admin Panel
                      </button>
                    )}
                    <button
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[0.8rem] text-red-400 hover:bg-red-500/10 cursor-pointer bg-transparent border-none text-left transition-colors"
                      onClick={() => { setProfileDropdownOpen(false); fetch('/api/auth/firebase-session', { method: 'DELETE' }); signOut({ callbackUrl: '/' }); }}
                    >
                      <i className="fas fa-sign-out-alt w-4 text-center"></i> Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button className="px-3 py-1.5 rounded-lg text-[0.78rem] font-medium bg-qsis text-white border-none cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setLoginModalOpen(true)}>
                <i className="fas fa-sign-in-alt mr-1.5"></i> Sign In
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* MAIN CONTENT */}
      <main className="max-w-[1200px] min-h-[calc(100vh-120px)] mx-auto px-5 py-5 pb-24 md:pb-5">
        {children}
      </main>

      {/* MOBILE BOTTOM NAV */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-[90] bg-dark-bg2 border-t border-dark-border safe-bottom">
        <div className="flex items-center justify-around py-2 px-1">
          <Link href="/" className={`flex flex-col items-center gap-[2px] px-2 py-1 rounded-lg border-none cursor-pointer transition-all no-underline ${isBrowse ? 'bg-qsis/15 text-qsis' : 'bg-transparent text-dark-text2'}`}>
            <i className="fas fa-book-open text-[1rem]"></i>
            <span className="text-[0.62rem] font-medium">Browse</span>
          </Link>
          <Link href="/history" className={`flex flex-col items-center gap-[2px] px-2 py-1 rounded-lg border-none cursor-pointer transition-all no-underline ${isActive('/history') ? 'bg-qsis/15 text-qsis' : 'bg-transparent text-dark-text2'}`}>
            <i className="fas fa-history text-[1rem]"></i>
            <span className="text-[0.62rem] font-medium">History</span>
          </Link>
          <button className="flex flex-col items-center gap-[2px] px-2 py-1 rounded-lg border-none cursor-pointer transition-all bg-transparent text-qsis" onClick={() => setUploadOpen(true)}>
            <div className="w-9 h-9 -mt-4 rounded-full bg-qsis flex items-center justify-center shadow-lg shadow-qsis/30">
              <i className="fas fa-plus text-white text-[0.9rem]"></i>
            </div>
            <span className="text-[0.62rem] font-medium">Upload</span>
          </button>
          <Link href="/routine" className={`flex flex-col items-center gap-[2px] px-2 py-1 rounded-lg border-none cursor-pointer transition-all no-underline ${isActive('/routine') ? 'bg-qsis/15 text-qsis' : 'bg-transparent text-dark-text2'}`}>
            <i className="fas fa-calendar-alt text-[1rem]"></i>
            <span className="text-[0.62rem] font-medium">Routine</span>
          </Link>
          <button className={`flex flex-col items-center gap-[2px] px-2 py-1 rounded-lg border-none cursor-pointer transition-all bg-transparent ${showMoreSheet ? 'text-qsis' : 'text-dark-text2'}`} onClick={() => setShowMoreSheet(!showMoreSheet)}>
            <i className="fas fa-ellipsis-h text-[1rem]"></i>
            <span className="text-[0.62rem] font-medium">More</span>
          </button>
        </div>
      </div>

      {/* MOBILE MORE SHEET */}
      {showMoreSheet && (
        <div className="md:hidden fixed inset-0 z-[95]">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowMoreSheet(false)}></div>
          <div className="absolute bottom-0 left-0 right-0 bg-dark-bg2 border-t border-dark-border rounded-t-2xl max-h-[80vh] overflow-y-auto animate-slide-up">
            <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border sticky top-0 bg-dark-bg2 z-10">
              <span className="text-sm font-bold text-dark-text">More</span>
              <button onClick={() => setShowMoreSheet(false)} className="w-8 h-8 rounded-full bg-dark-bg3 flex items-center justify-center text-dark-text2 border-none cursor-pointer">
                <i className="fas fa-times text-sm"></i>
              </button>
            </div>
            <div className="p-4 space-y-5">
              {/* Quick Links */}
              <div>
                <h4 className="text-[0.75rem] font-bold text-dark-text3 uppercase tracking-wider mb-2">Quick Links</h4>
                <div className="grid grid-cols-3 gap-2">
                  <Link href="/" onClick={() => setShowMoreSheet(false)} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-dark-bg3 border border-dark-border hover:border-qsis/40 transition-colors no-underline">
                    <i className="fas fa-home text-qsis text-sm"></i>
                    <span className="text-[0.68rem] text-dark-text font-medium">Browse</span>
                  </Link>
                  <button onClick={() => { setUploadOpen(true); setShowMoreSheet(false); }} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-dark-bg3 border border-dark-border hover:border-qsis/40 transition-colors">
                    <i className="fas fa-upload text-green-400 text-sm"></i>
                    <span className="text-[0.68rem] text-dark-text font-medium">Upload</span>
                  </button>
                  <Link href="/history" onClick={() => setShowMoreSheet(false)} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-dark-bg3 border border-dark-border hover:border-qsis/40 transition-colors no-underline">
                    <i className="fas fa-history text-yellow-400 text-sm"></i>
                    <span className="text-[0.68rem] text-dark-text font-medium">History</span>
                  </Link>
                  <Link href="/contributors" onClick={() => setShowMoreSheet(false)} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-dark-bg3 border border-dark-border hover:border-qsis/40 transition-colors no-underline">
                    <i className="fas fa-users text-purple-400 text-sm"></i>
                    <span className="text-[0.68rem] text-dark-text font-medium">Team</span>
                  </Link>
                  <Link href="/faculty" onClick={() => setShowMoreSheet(false)} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-dark-bg3 border border-dark-border hover:border-qsis/40 transition-colors no-underline">
                    <i className="fas fa-chalkboard-teacher text-teal-400 text-sm"></i>
                    <span className="text-[0.68rem] text-dark-text font-medium">Faculty</span>
                  </Link>
                  <a href="https://github.com/sayedatiqurrahman/QSIS-ACADEMIC-FILES-MANAFGER" target="_blank" className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-dark-bg3 border border-dark-border hover:border-qsis/40 transition-colors">
                    <i className="fab fa-github text-dark-text2 text-sm"></i>
                    <span className="text-[0.68rem] text-dark-text font-medium">GitHub</span>
                  </a>
                </div>
              </div>
              {/* Organizations */}
              <div>
                <h4 className="text-[0.75rem] font-bold text-dark-text3 uppercase tracking-wider mb-2">Organizations</h4>
                <div className="space-y-2">
                  <a href="https://www.iiuc.ac.bd/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-2.5 rounded-xl bg-dark-bg3 border border-dark-border hover:border-qsis/40 transition-colors">
                    <Image src="/iiuc-logo.png" alt="IIUC" width={28} height={28} className="w-7 h-7 rounded-md object-contain bg-white" />
                    <span className="text-[0.78rem] text-dark-text">International Islamic University Chittagong</span>
                  </a>
                  <a href="https://www.facebook.com/DQSIS" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-2.5 rounded-xl bg-dark-bg3 border border-dark-border hover:border-qsis/40 transition-colors">
                    <Image src="/qsis-logo.jpg" alt="QS Club" width={28} height={28} className="w-7 h-7 rounded-md object-contain bg-white" />
                    <span className="text-[0.78rem] text-dark-text">Qur&apos;anic Sciences Club, IIUC</span>
                  </a>
                  <a href="https://programming-light.eu.cc" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-2.5 rounded-xl bg-dark-bg3 border border-dark-border hover:border-qsis/40 transition-colors">
                    <Image src="/pl-logo.png" alt="Programming Light" width={28} height={28} className="w-7 h-7 rounded-md object-contain bg-white" />
                    <span className="text-[0.78rem] text-dark-text">Presented by <strong className="text-qsis">Programming Light</strong></span>
                  </a>
                </div>
              </div>
              {/* Community */}
              <div>
                <h4 className="text-[0.75rem] font-bold text-dark-text3 uppercase tracking-wider mb-2">Community</h4>
                <div className="space-y-2">
                  <a href="https://whatsapp.com/channel/0029VbD78MI3gvWcocoFdR1g" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-2.5 rounded-xl bg-dark-bg3 border border-dark-border hover:border-green-500/30 transition-colors">
                    <div className="w-7 h-7 rounded-md bg-green-500/20 flex items-center justify-center"><i className="fab fa-whatsapp text-green-400 text-sm"></i></div>
                    <div>
                      <span suppressHydrationWarning className="text-[0.78rem] text-dark-text block">WhatsApp Channel</span>
                      <span className="text-[0.6rem] text-dark-text3">Follow for updates & announcements</span>
                    </div>
                  </a>
                  <a href="https://chat.whatsapp.com/JQbkkwbDTvj9G0Xly9N771" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-2.5 rounded-xl bg-dark-bg3 border border-dark-border hover:border-green-500/30 transition-colors">
                    <div className="w-7 h-7 rounded-md bg-green-500/20 flex items-center justify-center"><i className="fab fa-whatsapp text-green-400 text-sm"></i></div>
                    <div>
                      <span suppressHydrationWarning className="text-[0.78rem] text-dark-text block">WhatsApp Community</span>
                      <span className="text-[0.6rem] text-dark-text3">Join groups & stay connected</span>
                    </div>
                  </a>
                  <a href="https://t.me/iiuc_arms" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-2.5 rounded-xl bg-dark-bg3 border border-dark-border hover:border-blue-500/30 transition-colors">
                    <div className="w-7 h-7 rounded-md bg-blue-500/20 flex items-center justify-center"><i className="fab fa-telegram text-blue-400 text-sm"></i></div>
                    <span className="text-[0.78rem] text-dark-text">Telegram Channel</span>
                  </a>
                </div>
              </div>
              {/* About */}
              <div className="text-center pt-2 border-t border-dark-border">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Image src="/arms-logo-icon.png" alt="IIUC-ARMS" width={24} height={24} className="w-6 h-6 rounded-full border border-qsis object-contain bg-white" />
                  <span className="text-[0.82rem] font-bold bg-gradient-to-br from-qsis to-accent bg-clip-text text-transparent">IIUC-ARMS</span>
                </div>
                <p className="text-[0.65rem] text-dark-text3 leading-relaxed">A centralized platform for managing and sharing<br/>academic resources for QSIS, IIUC.</p>
                <p className="text-[0.6rem] text-dark-text3 mt-2">&copy; {new Date().getFullYear()} IIUC-ARMS</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER — hidden on mobile (use More tab) */}
      <footer className="hidden md:block bg-dark-bg2 border-t border-dark-border mt-8">
        <div className="max-w-[1200px] mx-auto px-5 py-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <Image src="/arms-logo-icon.png" alt="IIUC-ARMS" width={36} height={36} className="w-9 h-9 rounded-full border-2 border-qsis object-contain bg-white" />
                <div>
                  <h3 className="text-[0.95rem] font-bold bg-gradient-to-br from-qsis to-accent bg-clip-text text-transparent">IIUC-ARMS</h3>
                  <span className="text-[0.68rem] text-dark-text2">Academic Resource System</span>
                </div>
              </div>
              <p className="text-[0.8rem] text-dark-text2 leading-relaxed">A centralized platform for managing and sharing academic resources for the Department of Qur&apos;anic Sciences &amp; Islamic Studies, IIUC.</p>
            </div>
            <div>
              <h4 className="text-[0.85rem] font-semibold text-dark-text mb-3">Quick Links</h4>
              <div className="flex flex-col gap-2">
                <Link href="/" className="text-[0.8rem] text-dark-text2 hover:text-qsis no-underline transition-colors"><i className="fas fa-home mr-2"></i>Dashboard</Link>
                <button className="text-[0.8rem] text-dark-text2 hover:text-qsis text-left bg-transparent border-none cursor-pointer transition-colors" onClick={() => setUploadOpen(true)}><i className="fas fa-upload mr-2"></i>Upload Files</button>
                <Link href="/history" className="text-[0.8rem] text-dark-text2 hover:text-qsis no-underline transition-colors"><i className="fas fa-history mr-2"></i>History</Link>
                <Link href="/routine" className="text-[0.8rem] text-dark-text2 hover:text-qsis no-underline transition-colors"><i className="fas fa-calendar-alt mr-2"></i>Routine</Link>
                <Link href="/contributors" className="text-[0.8rem] text-dark-text2 hover:text-qsis no-underline transition-colors"><i className="fas fa-users mr-2"></i>Contributors</Link>
                <Link href="/faculty" className="text-[0.8rem] text-dark-text2 hover:text-qsis no-underline transition-colors"><i className="fas fa-chalkboard-teacher mr-2"></i>Faculty</Link>
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
                  <Image src="/qsis-logo.jpg" alt="Qur&apos;anic Sciences Club" width={28} height={28} className="w-7 h-7 rounded-md object-contain bg-white" />
                  <span className="text-[0.78rem] text-dark-text2 group-hover:text-qsis transition-colors">Qur&apos;anic Sciences Club, IIUC</span>
                </a>
              </div>
              <div className="mt-4 pt-3 border-t border-dark-border">
                <a href="https://programming-light.eu.cc" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 group">
                  <Image src="/pl-logo.png" alt="Programming Light" width={28} height={28} className="w-7 h-7 rounded-md object-contain bg-white" />
                  <span className="text-[0.78rem] text-dark-text2 group-hover:text-qsis transition-colors">Presented by <strong className="text-qsis">Programming Light</strong></span>
                </a>
              </div>
            </div>
            <div>
              <h4 className="text-[0.85rem] font-semibold text-dark-text mb-3">Community</h4>
              <div className="flex flex-col gap-2.5">
                <a href="https://whatsapp.com/channel/0029VbD78MI3gvWcocoFdR1g" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 group">
                  <div className="w-7 h-7 rounded-md bg-green-500/20 flex items-center justify-center"><i className="fab fa-whatsapp text-green-400 text-sm"></i></div>
                  <span suppressHydrationWarning className="text-[0.78rem] text-dark-text2 group-hover:text-green-400 transition-colors">WhatsApp Channel</span>
                </a>
                <a href="https://chat.whatsapp.com/JQbkkwbDTvj9G0Xly9N771" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 group">
                  <div className="w-7 h-7 rounded-md bg-green-500/20 flex items-center justify-center"><i className="fab fa-whatsapp text-green-400 text-sm"></i></div>
                  <span suppressHydrationWarning className="text-[0.78rem] text-dark-text2 group-hover:text-green-400 transition-colors">WhatsApp Community</span>
                </a>
                <p className="text-[0.62rem] text-dark-text3 mt-0.5 ml-9.5">
                  <i className="fas fa-info-circle mr-1 text-green-400/60"></i>Your info stays hidden until you join a group
                </p>
                <a href="https://t.me/iiuc_arms" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 group">
                  <div className="w-7 h-7 rounded-md bg-blue-500/20 flex items-center justify-center"><i className="fab fa-telegram text-blue-400 text-sm"></i></div>
                  <span className="text-[0.78rem] text-dark-text2 group-hover:text-blue-400 transition-colors">Telegram Channel</span>
                </a>
              </div>
              <p className="text-[0.65rem] text-dark-text3 mt-2">Get updates &amp; discuss support</p>
            </div>
          </div>
          <div className="border-t border-dark-border mt-6 pt-5 pb-8  flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-[0.72rem] text-dark-text2">&copy; {new Date().getFullYear()} IIUC-ARMS. All rights reserved.</p>
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
              <a href="https://github.com/sayedatiqurrahman/QSIS-ACADEMIC-FILES-MANAFGER" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-dark-bg3 border border-dark-border text-[0.65rem] sm:text-[0.72rem] text-dark-text2 hover:text-qsis hover:border-qsis transition-all">
                <i className="fas fa-star text-yellow-500"></i> Star Files Repo
              </a>
              <a href="https://github.com/sayedatiqurrahman/QSIS-ACADEMIC-FILES-MANAFGER/fork" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-dark-bg3 border border-dark-border text-[0.65rem] sm:text-[0.72rem] text-dark-text2 hover:text-qsis hover:border-qsis transition-all">
                <i className="fas fa-code-fork text-qsis"></i> Fork to Contribute
              </a>
              <a href="https://github.com/sayedatiqurrahman/QSIS-ARMS-v2" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-dark-bg3 border border-dark-border text-[0.65rem] sm:text-[0.72rem] text-dark-text2 hover:text-qsis hover:border-qsis transition-all">
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
                  <i className="fas fa-file"></i>
                  <span className="truncate">{viewerItem.name}</span>
                </div>
                <button className="ml-3 w-7 h-7 rounded-lg bg-red-500 text-white border-none cursor-pointer flex items-center justify-center text-sm hover:bg-red-600" onClick={closeViewer}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              {viewerItem.mimeType === 'pdf' && <PdfViewer url={viewerItem.rawUrl} name={viewerItem.name} filePath={viewerItem.path} onClose={closeViewer} />}
              {viewerItem.mimeType === 'image' && <ImageViewer item={viewerItem} onClose={closeViewer} />}
              {(viewerItem.mimeType === 'doc' || viewerItem.mimeType === 'sheet' || viewerItem.mimeType === 'ppt') && (
                <iframe src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(viewerItem.rawUrl)}`} className="w-full border-none" style={{minHeight:'calc(100vh - 50px)'}}></iframe>
              )}
              {viewerItem.mimeType === 'other' && (
                <div className="flex flex-col items-center justify-center min-h-[calc(100vh-50px)] text-dark-text2">
                  <i className="fas fa-file text-4xl mb-4"></i>
                  <p>Preview not available for this file type.</p>
                  <a href={viewerItem.rawUrl} target="_blank" className="mt-3 px-4 py-2 rounded-xl bg-qsis text-white text-sm font-semibold no-underline">
                    <i className="fas fa-external-link-alt"></i> Open in new tab
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ONBOARDING MODAL */}
      {showOnboarding && (
        <OnboardingModal
          onComplete={(data) => {
            setStoreOnboarding(data);
            setShowOnboarding(false);
            setOnboardingDone(true);
          }}
          onClose={() => setShowOnboarding(false)}
        />
      )}

      {/* LOGIN MODAL */}
      <LoginModal isOpen={loginModalOpen} onClose={() => setLoginModalOpen(false)} />
    </div>
  );
}

/* ─── Image Viewer (inline) ─── */
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
        <button className="pdf-btn" onClick={fit} title="Fit"><i className="fas fa-expand"></i></button>
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
