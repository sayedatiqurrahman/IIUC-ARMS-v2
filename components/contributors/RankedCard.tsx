'use client';

import Image from 'next/image';
import { Settings } from './types';
import StatTip from './StatTip';
import SystemRoleBadge from './SystemRoleBadge';
import ContactButton from './ContactButton';

const CODE_TIP = 'Commits to the IIUC-ARMS-v2 source-code repo.';
const DATA_TIP = 'Files you uploaded to the Academic Files data repo.';
const DESIGN_TIP = 'Designs you published on the Creative Hub.';
const BUG_TIP = 'Issues you opened on the IIUC-ARMS-v2 repo.';
const TOTAL_TIP = 'Code + Data + Design + Issues added together.';

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

  const total = c.v2Contributions + c.dataContributions + (c.designContributions || 0) + (c.issueContributions || 0);

  return (
    <div className={`rounded-xl border transition-all hover:border-qsis/40 hover:shadow-[0_2px_12px_rgba(34,197,94,0.1)] ${
      isFounder ? 'bg-gradient-to-br from-qsis/10 to-accent/10 border-qsis/30' :
      rank <= 3 ? 'bg-dark-bg2 border-qsis/20' : 'bg-dark-bg2 border-dark-border'
    }`}>
      {/* ─── Desktop ─── */}
      <div className="hidden sm:block p-3">
        {/* Row 1: Rank + Avatar + Name/Badges + Stats + History */}
        <div className="flex items-center gap-3">
          {settings.showRanks && (
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-[0.8rem] ${
              isFounder ? 'bg-qsis text-white' : rankColors[rank] || 'bg-dark-bg3 text-dark-text2'
            }`}>
              {isFounder ? <i className="fas fa-crown text-[0.65rem]"></i> : `#${rank}`}
            </div>
          )}
          <div className="relative flex-shrink-0">
            <Image src={c.avatar_url} alt={c.login} width={40} height={40} className={`w-10 h-10 rounded-full object-cover ${isFounder ? 'border-2 border-qsis' : 'border-2 border-dark-border'}`} />
            {c.profileComplete && (
              <div className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-sky-500 flex items-center justify-center shadow ring-2 ring-dark-bg2" title="Profile Completed & Verified">
                <i className="fas fa-check text-white text-[0.4rem]"></i>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[0.82rem] font-bold text-dark-text truncate max-w-[200px]">{c.name || c.login}</span>
              {isFounder && <span className="px-1.5 py-0.5 rounded-md bg-qsis/20 text-qsis text-[0.55rem] font-bold"><i className="fas fa-crown mr-0.5"></i>Founder</span>}
              {isDev && <span className="px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-400 text-[0.55rem] font-bold"><i className="fas fa-laptop-code mr-0.5"></i>Dev</span>}
              {isResource && <span className="px-1.5 py-0.5 rounded-md bg-orange-500/15 text-orange-400 text-[0.55rem] font-bold"><i className="fas fa-book-open mr-0.5"></i>Data</span>}
              {isDesigner && <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 text-[0.55rem] font-bold"><i className="fas fa-palette mr-0.5"></i>Design</span>}
              <SystemRoleBadge roleKey={c.systemRoleKey} label={c.systemRole} size="sm" />
            </div>
          </div>
          {settings.showStats && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <StatTip icon="fa-laptop-code" color="text-blue-400" value={c.v2Contributions} label="Code" tip={CODE_TIP} />
              <StatTip icon="fa-book-open" color="text-orange-400" value={c.dataContributions} label="Data" tip={DATA_TIP} />
              <StatTip icon="fa-palette" color="text-emerald-400" value={c.designContributions || 0} label="Design" tip={DESIGN_TIP} />
              <StatTip icon="fa-bug" color="text-rose-400" value={c.issueContributions || 0} label="Issues" tip={BUG_TIP} />
              <div className="border-l border-dark-border pl-2 ml-0.5">
                <StatTip icon="fa-star" color="text-yellow-500" value={total} label="Total" tip={TOTAL_TIP} />
              </div>
            </div>
          )}
          <button
            onClick={() => onShowHistory?.(c)}
            className="w-7 h-7 rounded-lg bg-dark-bg3 flex items-center justify-center text-dark-text2 hover:text-qsis hover:bg-qsis/10 transition-all flex-shrink-0"
            title="Contribution history"
          >
            <i className="fas fa-circle-info text-[0.7rem]"></i>
          </button>
        </div>

        {/* Row 2: Dept + Semester + Section + Contact */}
        <div className="flex items-center gap-2 mt-1 ml-[52px]">
          {c.departmentShortName && <span className="text-[0.62rem] text-dark-text3 truncate"><i className="fas fa-building mr-0.5 text-teal-400"></i>{c.departmentShortName}</span>}
          {c.semester && !c.hideSemester && <span className="text-[0.62rem] text-dark-text3"><i className="fas fa-graduation-cap mr-0.5 text-accent"></i>{c.semester === 'graduated' ? 'Grad' : c.semester}</span>}
          {c.section && <span className="text-[0.62rem] text-dark-text3"><i className="fas fa-users mr-0.5 text-purple-400"></i>{c.section}</span>}
          <ContactButton c={c} size="md" />
        </div>
      </div>

      {/* ─── Mobile ─── */}
      <div className="sm:hidden p-3">
        <div className="flex items-center gap-2.5 mb-1.5">
          {settings.showRanks && (
            <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 font-bold text-[0.65rem] ${
              isFounder ? 'bg-qsis text-white' : rankColors[rank] || 'bg-dark-bg3 text-dark-text2'
            }`}>
              {isFounder ? <i className="fas fa-crown text-[0.5rem]"></i> : `#${rank}`}
            </div>
          )}
          <div className="relative flex-shrink-0">
            <Image src={c.avatar_url} alt={c.login} width={36} height={36} className={`w-9 h-9 rounded-full object-cover ${isFounder ? 'border-2 border-qsis' : 'border-2 border-dark-border'}`} />
            {c.profileComplete && (
              <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-sky-500 flex items-center justify-center shadow ring-2 ring-dark-bg2" title="Profile Completed & Verified">
                <i className="fas fa-check text-white text-[0.35rem]"></i>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[0.8rem] text-dark-text truncate">{c.name || c.login}</div>
          </div>
          <button onClick={() => onShowHistory?.(c)} className="w-7 h-7 rounded-lg bg-dark-bg3 flex items-center justify-center text-dark-text3 hover:text-qsis hover:bg-qsis/10 transition-all flex-shrink-0" title="History">
            <i className="fas fa-circle-info text-[0.6rem]"></i>
          </button>
        </div>
        {/* Badges */}
        <div className="flex flex-wrap items-center gap-1 mb-1.5 ml-[46px]">
          {isFounder && <span className="px-1.5 py-0.5 rounded-md bg-qsis/20 text-qsis text-[0.5rem] font-bold"><i className="fas fa-crown mr-0.5"></i>Founder</span>}
          {isDev && <span className="px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-400 text-[0.5rem] font-bold"><i className="fas fa-laptop-code mr-0.5"></i>Dev</span>}
          {isResource && <span className="px-1.5 py-0.5 rounded-md bg-orange-500/15 text-orange-400 text-[0.5rem] font-bold"><i className="fas fa-book-open mr-0.5"></i>Data</span>}
          {isDesigner && <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 text-[0.5rem] font-bold"><i className="fas fa-palette mr-0.5"></i>Design</span>}
          <SystemRoleBadge roleKey={c.systemRoleKey} label={c.systemRole} size="sm" />
        </div>
        {/* Dept + Semester + Contact */}
        <div className="flex items-center gap-2 mb-1.5 ml-[46px]">
          {c.departmentShortName && <span className="text-[0.55rem] text-dark-text3 truncate"><i className="fas fa-building mr-0.5 text-teal-400"></i>{c.departmentShortName}</span>}
          {c.semester && !c.hideSemester && <span className="text-[0.55rem] text-dark-text3"><i className="fas fa-graduation-cap mr-0.5 text-accent"></i>{c.semester === 'graduated' ? 'Grad' : c.semester}</span>}
          {c.section && <span className="text-[0.55rem] text-dark-text3"><i className="fas fa-users mr-0.5 text-purple-400"></i>{c.section}</span>}
          <ContactButton c={c} />
        </div>
        {settings.showStats && (
          <div className="flex items-center gap-1.5 bg-dark-bg3/50 rounded-lg px-2 py-1.5">
            <StatTip size="sm" icon="fa-laptop-code" color="text-blue-400" value={c.v2Contributions} label="Code" tip={CODE_TIP} />
            <div className="w-px h-5 bg-dark-border"></div>
            <StatTip size="sm" icon="fa-book-open" color="text-orange-400" value={c.dataContributions} label="Data" tip={DATA_TIP} />
            <div className="w-px h-5 bg-dark-border"></div>
            <StatTip size="sm" icon="fa-palette" color="text-emerald-400" value={c.designContributions || 0} label="Design" tip={DESIGN_TIP} />
            <div className="w-px h-5 bg-dark-border"></div>
            <StatTip size="sm" icon="fa-bug" color="text-rose-400" value={c.issueContributions || 0} label="Issues" tip={BUG_TIP} />
            <div className="w-px h-5 bg-dark-border"></div>
            <StatTip size="sm" icon="fa-star" color="text-yellow-500" value={total} label="Total" tip={TOTAL_TIP} />
          </div>
        )}
      </div>
    </div>
  );
}
