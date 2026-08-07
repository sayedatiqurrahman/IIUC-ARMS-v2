'use client';

import Image from 'next/image';
import { config } from '@/lib/config';
import { Settings } from './types';

export default function RankedCard({ c, rank, settings, onShowHistory }: { c: any; rank: number; settings: Settings; onShowHistory?: (c: any) => void }) {
  const rankColors: Record<number, string> = {
    1: 'bg-yellow-500 text-white',
    2: 'bg-gray-400 text-white',
    3: 'bg-orange-600 text-white',
  };

  const isFounder = c.role === 'Founder & Lead';
  const isDev = c.v2Contributions > 0;
  const isResource = c.dataContributions > 0;

  return (
    <div className={`rounded-xl border transition-all hover:border-qsis/40 hover:shadow-[0_2px_12px_rgba(34,197,94,0.1)] ${
      isFounder ? 'bg-gradient-to-br from-qsis/10 to-accent/10 border-qsis/30' :
      rank <= 3 ? 'bg-dark-bg2 border-qsis/20' : 'bg-dark-bg2 border-dark-border'
    }`}>
      {/* ─── Desktop: horizontal layout ─── */}
      <div className="hidden sm:flex items-center gap-4 p-4">
        {settings.showRanks && (
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-[0.85rem] ${
            isFounder ? 'bg-qsis text-white' : rankColors[rank] || 'bg-dark-bg3 text-dark-text2'
          }`}>
            {isFounder ? <i className="fas fa-crown text-[0.7rem]"></i> : `#${rank}`}
          </div>
        )}
        <Image src={c.avatar_url} alt={c.login} width={48} height={48} className={`w-12 h-12 rounded-full object-cover flex-shrink-0 ${isFounder ? 'border-2 border-qsis' : 'border-2 border-dark-border'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[0.9rem] font-bold text-dark-text truncate">{c.name || c.login}</span>
            {isFounder && <span className="px-1.5 py-0.5 rounded-md bg-qsis/20 text-qsis text-[0.58rem] font-bold"><i className="fas fa-crown mr-0.5"></i>Founder</span>}
            {isDev && <span className="px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-400 text-[0.58rem] font-bold"><i className="fas fa-laptop-code mr-0.5"></i>Developer</span>}
            {isResource && <span className="px-1.5 py-0.5 rounded-md bg-orange-500/15 text-orange-400 text-[0.58rem] font-bold"><i className="fas fa-book-open mr-0.5"></i>Resource</span>}
            {c.profileComplete && <span className="px-1.5 py-0.5 rounded-md bg-green-500/15 text-green-400 text-[0.58rem] font-bold"><i className="fas fa-check-circle mr-0.5"></i>Complete</span>}
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            <a href={c.html_url} target="_blank" rel="noopener noreferrer" className="text-[0.72rem] text-dark-text3 hover:text-qsis transition-colors no-underline">
              <i className="fab fa-github mr-1"></i>@{c.login}
            </a>
            {(c as any).departmentShortName && <span className="text-[0.65rem] text-dark-text3"><i className="fas fa-building mr-1 text-teal-400"></i>{(c as any).departmentShortName}</span>}
            {c.universityId && !c.hideUniversityId && <span className="text-[0.65rem] text-dark-text3"><i className="fas fa-id-card mr-1 text-qsis"></i>{c.universityId}</span>}
            {c.semester && !c.hideSemester && <span className="text-[0.65rem] text-dark-text3"><i className="fas fa-graduation-cap mr-1 text-accent"></i>{c.semester === 'graduated' ? '🎓 Graduated' : config.semesters.find((s: any) => s.id === c.semester)?.label || c.semester}</span>}
            {(() => { const e = c.publicEmail || c.email; if (e && !c.hideEmail) return <span className="text-[0.65rem] text-dark-text3"><i className="fas fa-envelope mr-1 text-blue-400"></i>{e}</span>; })()}
            {c.whatsapp && !c.hideWhatsapp && <span className="text-[0.65rem] text-dark-text3"><i className="fab fa-whatsapp mr-1 text-green-400"></i>{c.whatsapp}</span>}
            {c.company && !c.hideCompany && <span className="text-[0.65rem] text-dark-text3"><i className="fas fa-briefcase mr-1 text-purple-400"></i>{c.company}</span>}
          </div>
        </div>
        {settings.showStats && (
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-center"><div className="text-[0.85rem] font-bold text-blue-400">{c.v2Contributions}</div><div className="text-[0.58rem] text-dark-text3">Code</div></div>
            <div className="text-center"><div className="text-[0.85rem] font-bold text-orange-400">{c.dataContributions}</div><div className="text-[0.58rem] text-dark-text3">Data</div></div>
            <div className="text-center"><div className="text-[0.85rem] font-bold text-accent">{c.prCount}</div><div className="text-[0.58rem] text-dark-text3">PRs</div></div>
            <div className="text-center border-l border-dark-border pl-3 ml-1"><div className="text-[0.85rem] font-bold text-yellow-500">{c.v2Contributions + c.dataContributions}</div><div className="text-[0.58rem] text-dark-text3">Total</div></div>
          </div>
        )}
        <button
          onClick={() => onShowHistory?.(c)}
          className="w-9 h-9 rounded-lg bg-dark-bg3 flex items-center justify-center text-dark-text2 hover:text-qsis hover:bg-qsis/10 transition-all flex-shrink-0"
          title="Contribution history"
          aria-label="Contribution history"
        >
          <i className="fas fa-circle-info text-[0.75rem]"></i>
        </button>
        <a href={c.html_url} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-lg bg-dark-bg3 flex items-center justify-center text-dark-text2 hover:text-qsis hover:bg-qsis/10 transition-all flex-shrink-0">
          <i className="fab fa-github"></i>
        </a>
      </div>

      {/* ─── Mobile: vertical card layout ─── */}
      <div className="sm:hidden p-3">
        {/* Top: Rank + Avatar + Name + Badges */}
        <div className="flex items-center gap-3 mb-2.5">
          {settings.showRanks && (
            <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 font-bold text-[0.7rem] ${
              isFounder ? 'bg-qsis text-white' : rankColors[rank] || 'bg-dark-bg3 text-dark-text2'
            }`}>
              {isFounder ? <i className="fas fa-crown text-[0.55rem]"></i> : `#${rank}`}
            </div>
          )}
          <Image src={c.avatar_url} alt={c.login} width={40} height={40} className={`w-10 h-10 rounded-full object-cover flex-shrink-0 ${isFounder ? 'border-2 border-qsis' : 'border-2 border-dark-border'}`} />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[0.85rem] text-dark-text truncate">{c.name || c.login}</div>
            <a href={c.html_url} target="_blank" rel="noopener noreferrer" className="text-[0.65rem] text-dark-text3 hover:text-qsis transition-colors no-underline">
              <i className="fab fa-github mr-1"></i>@{c.login}
            </a>
          </div>
          <button
            onClick={() => onShowHistory?.(c)}
            className="w-7 h-7 rounded-lg bg-dark-bg3 flex items-center justify-center text-dark-text3 hover:text-qsis hover:bg-qsis/10 transition-all flex-shrink-0"
            title="Contribution history"
            aria-label="Contribution history"
          >
            <i className="fas fa-circle-info text-[0.65rem]"></i>
          </button>
        </div>
        {/* Badges */}
        <div className="flex flex-wrap gap-1 mb-2.5">
          {isFounder && <span className="px-1.5 py-0.5 rounded-md bg-qsis/20 text-qsis text-[0.55rem] font-bold"><i className="fas fa-crown mr-0.5"></i>Founder</span>}
          {isDev && <span className="px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-400 text-[0.55rem] font-bold"><i className="fas fa-laptop-code mr-0.5"></i>Dev</span>}
          {isResource && <span className="px-1.5 py-0.5 rounded-md bg-orange-500/15 text-orange-400 text-[0.55rem] font-bold"><i className="fas fa-book-open mr-0.5"></i>Resource</span>}
          {c.profileComplete && <span className="px-1.5 py-0.5 rounded-md bg-green-500/15 text-green-400 text-[0.55rem] font-bold"><i className="fas fa-check-circle mr-0.5"></i>Complete</span>}
        </div>
        {/* Stats */}
        {settings.showStats && (
          <div className="flex items-center gap-2 mb-2.5 bg-dark-bg3/50 rounded-lg px-3 py-2">
            <div className="flex-1 text-center"><div className="text-[0.8rem] font-bold text-blue-400">{c.v2Contributions}</div><div className="text-[0.5rem] text-dark-text3">Code</div></div>
            <div className="w-px h-6 bg-dark-border"></div>
            <div className="flex-1 text-center"><div className="text-[0.8rem] font-bold text-orange-400">{c.dataContributions}</div><div className="text-[0.5rem] text-dark-text3">Data</div></div>
            <div className="w-px h-6 bg-dark-border"></div>
            <div className="flex-1 text-center"><div className="text-[0.8rem] font-bold text-accent">{c.prCount}</div><div className="text-[0.5rem] text-dark-text3">PRs</div></div>
            <div className="w-px h-6 bg-dark-border"></div>
            <div className="flex-1 text-center"><div className="text-[0.8rem] font-bold text-yellow-500">{c.v2Contributions + c.dataContributions}</div><div className="text-[0.5rem] text-dark-text3">Total</div></div>
          </div>
        )}
        {/* Info grid */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {(c as any).departmentShortName && (
            <div className="flex items-center gap-1.5">
              <i className="fas fa-building text-teal-400 text-[0.5rem] w-3 text-center flex-shrink-0"></i>
              <div className="min-w-0"><span className="text-[0.5rem] text-dark-text3 block leading-none">Dept</span><span className="text-[0.6rem] text-dark-text2 font-medium truncate block">{(c as any).departmentShortName}</span></div>
            </div>
          )}
          {c.universityId && !c.hideUniversityId && (
            <div className="flex items-center gap-1.5">
              <i className="fas fa-id-card text-qsis text-[0.5rem] w-3 text-center flex-shrink-0"></i>
              <div className="min-w-0"><span className="text-[0.5rem] text-dark-text3 block leading-none">ID</span><span className="text-[0.6rem] text-dark-text2 font-medium truncate block">{c.universityId}</span></div>
            </div>
          )}
          {c.semester && !c.hideSemester && (
            <div className="flex items-center gap-1.5">
              <i className="fas fa-graduation-cap text-accent text-[0.5rem] w-3 text-center flex-shrink-0"></i>
              <div className="min-w-0"><span className="text-[0.5rem] text-dark-text3 block leading-none">Sem</span><span className="text-[0.6rem] text-dark-text2 font-medium truncate block">{c.semester === 'graduated' ? '🎓 Grad' : config.semesters.find((s: any) => s.id === c.semester)?.label?.replace(' Semester', '') || c.semester}</span></div>
            </div>
          )}
          {(() => { const e = c.publicEmail || c.email; if (e && !c.hideEmail) return (
            <div className="flex items-center gap-1.5">
              <i className="fas fa-envelope text-blue-400 text-[0.5rem] w-3 text-center flex-shrink-0"></i>
              <div className="min-w-0"><span className="text-[0.5rem] text-dark-text3 block leading-none">Email</span><span className="text-[0.6rem] text-dark-text2 font-medium truncate block">{e}</span></div>
            </div>
          ); })()}
          {c.whatsapp && !c.hideWhatsapp && (
            <div className="flex items-center gap-1.5">
              <i className="fab fa-whatsapp text-green-400 text-[0.5rem] w-3 text-center flex-shrink-0"></i>
              <div className="min-w-0"><span className="text-[0.5rem] text-dark-text3 block leading-none">WhatsApp</span><span className="text-[0.6rem] text-dark-text2 font-medium truncate block">{c.whatsapp}</span></div>
            </div>
          )}
          {c.company && !c.hideCompany && (
            <div className="flex items-center gap-1.5">
              <i className="fas fa-briefcase text-purple-400 text-[0.5rem] w-3 text-center flex-shrink-0"></i>
              <div className="min-w-0"><span className="text-[0.5rem] text-dark-text3 block leading-none">Company</span><span className="text-[0.6rem] text-dark-text2 font-medium truncate block">{c.company}</span></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
