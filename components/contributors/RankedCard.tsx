'use client';

import Image from 'next/image';
import { config } from '@/lib/config';
import { Settings } from './types';
import StatTip from './StatTip';
import SystemRoleBadge from './SystemRoleBadge';

const CODE_TIP = 'Commits to the IIUC-ARMS-v2 source-code repo. Every commit you push there counts as 1, and every pull request you get merged into it also counts as 1.';
const DATA_TIP = 'Files you uploaded to the Academic Files data repo. Every file you upload is committed to that repo and counts as 1 (merged pull requests there count too).';
const DESIGN_TIP = 'Designs you published on the Creative Hub. Each design/theme you publish counts as 1.';
const PR_TIP = 'Pull requests you opened that got merged — counted across both the source-code repo and the data repo.';
const BUG_TIP = 'Issues (bug reports, feature requests) you opened on the IIUC-ARMS-v2 repo — every issue you file, such as reporting a broken Studio app, counts as 1.';
const TOTAL_TIP = 'Code + Data + Design + Issues added together. (Pull requests are already counted inside Code and Data.)';

export default function RankedCard({ c, rank, settings, onShowHistory }: { c: any; rank: number; settings: Settings; onShowHistory?: (c: any) => void }) {
  const rankColors: Record<number, string> = {
    1: 'bg-yellow-500 text-white',
    2: 'bg-gray-400 text-white',
    3: 'bg-orange-600 text-white',
  };

  const isFounder = c.role === 'Founder & Lead';
  const isDev = c.v2Contributions > 0;
  const isResource = c.dataContributions > 0;
  const isDesigner = (c.designContributions || 0) > 0;

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
            {isDesigner && <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 text-[0.58rem] font-bold"><i className="fas fa-palette mr-0.5"></i>Designer</span>}
            {c.profileComplete && <span className="px-1.5 py-0.5 rounded-md bg-green-500/15 text-green-400 text-[0.58rem] font-bold"><i className="fas fa-check-circle mr-0.5"></i>Complete</span>}
            <SystemRoleBadge roleKey={c.systemRoleKey} label={c.systemRole} size="sm" />
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
            <StatTip icon="fa-laptop-code" color="text-blue-400" value={c.v2Contributions} label="Code" tip={CODE_TIP} />
            <StatTip icon="fa-book-open" color="text-orange-400" value={c.dataContributions} label="Data" tip={DATA_TIP} />
            <StatTip icon="fa-palette" color="text-emerald-400" value={c.designContributions || 0} label="Design" tip={DESIGN_TIP} />
            <StatTip icon="fa-code-merge" color="text-accent" value={c.prCount} label="PRs" tip={PR_TIP} />
            <StatTip icon="fa-bug" color="text-rose-400" value={c.issueContributions || 0} label="Issues" tip={BUG_TIP} />
            <div className="border-l border-dark-border pl-3 ml-1">
              <StatTip icon="fa-star" color="text-yellow-500" value={c.v2Contributions + c.dataContributions + (c.designContributions || 0) + (c.issueContributions || 0)} label="Total" tip={TOTAL_TIP} />
            </div>
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
          {isDesigner && <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 text-[0.55rem] font-bold"><i className="fas fa-palette mr-0.5"></i>Design</span>}
          {c.profileComplete && <span className="px-1.5 py-0.5 rounded-md bg-green-500/15 text-green-400 text-[0.55rem] font-bold"><i className="fas fa-check-circle mr-0.5"></i>Complete</span>}
          <SystemRoleBadge roleKey={c.systemRoleKey} label={c.systemRole} size="sm" />
        </div>
        {/* Stats */}
        {settings.showStats && (
          <div className="flex items-center gap-2 mb-2.5 bg-dark-bg3/50 rounded-lg px-3 py-2">
            <StatTip size="sm" icon="fa-laptop-code" color="text-blue-400" value={c.v2Contributions} label="Code" tip={CODE_TIP} />
            <div className="w-px h-6 bg-dark-border"></div>
            <StatTip size="sm" icon="fa-book-open" color="text-orange-400" value={c.dataContributions} label="Data" tip={DATA_TIP} />
            <div className="w-px h-6 bg-dark-border"></div>
            <StatTip size="sm" icon="fa-palette" color="text-emerald-400" value={c.designContributions || 0} label="Design" tip={DESIGN_TIP} />
            <div className="w-px h-6 bg-dark-border"></div>
            <StatTip size="sm" icon="fa-code-merge" color="text-accent" value={c.prCount} label="PRs" tip={PR_TIP} />
            <div className="w-px h-6 bg-dark-border"></div>
            <StatTip size="sm" icon="fa-bug" color="text-rose-400" value={c.issueContributions || 0} label="Issues" tip={BUG_TIP} />
            <div className="w-px h-6 bg-dark-border"></div>
            <StatTip size="sm" icon="fa-star" color="text-yellow-500" value={c.v2Contributions + c.dataContributions + (c.designContributions || 0) + (c.issueContributions || 0)} label="Total" tip={TOTAL_TIP} />
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
