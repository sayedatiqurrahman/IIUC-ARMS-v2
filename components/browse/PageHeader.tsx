'use client';

import Image from 'next/image';
import Link from 'next/link';
import { getFileIconByType, esc, timeAgo } from '@/lib/utils';

interface PageHeaderProps {
  view: string;
  searchQuery: string;
  isPrivileged: boolean;
  showWelcome: boolean;
  setShowWelcome: (v: boolean) => void;
  userName: string;
  userRole: string | null;
  isSearching: boolean;
  departments: any[];
  recentReads: any[];
  openRecentFile: (item: any) => void;
}

export default function PageHeader({
  view, searchQuery, isPrivileged, showWelcome, setShowWelcome,
  userName, userRole, isSearching, departments, recentReads, openRecentFile,
}: PageHeaderProps) {
  return (
    <>
      {/* Hero Section */}
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
            <div className="text-[1.3rem] font-bold text-yellow-400">{departments.reduce((s: number, d: any) => s + d.files, 0)}</div>
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
    </>
  );
}
