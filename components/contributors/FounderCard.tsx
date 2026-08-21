'use client';

import Image from 'next/image';
import { config } from '@/lib/config';
import StatTip from './StatTip';
import SocialIcons from './SocialIcons';

const CODE_TIP = 'Commits to the IIUC-ARMS-v2 source-code repo.';
const DATA_TIP = 'Files you uploaded to the Academic Files data repo.';
const BUG_TIP = 'Issues you opened on the IIUC-ARMS-v2 repo.';
const TOTAL_TIP = 'Code + Data + Issues combined.';

export default function FounderCard({ c, onShowHistory }: { c: any; onShowHistory?: (c: any) => void }) {
  return (
    <div className="bg-gradient-to-br from-qsis/10 to-accent/10 border-2 border-qsis/40 rounded-2xl p-4 sm:p-5 mb-5 ring-1 ring-qsis/20">
      {/* Mobile */}
      <div className="sm:hidden text-center">
        <div className="relative inline-block mb-3">
          <Image src={c.avatar_url} alt={c.login} width={72} height={72} className="w-[72px] h-[72px] rounded-full border-[3px] border-qsis shadow-[0_0_24px_rgba(34,197,94,0.4)] object-cover" />
          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-qsis flex items-center justify-center shadow-lg ring-2 ring-dark-bg2" title="Founder & Lead">
            <i className="fas fa-crown text-white text-[0.6rem]"></i>
          </div>
        </div>
        <h3 className="text-[1rem] font-bold text-dark-text">{c.name || c.login}</h3>
        <p className="text-[0.75rem] text-qsis font-medium mb-1">{config.founderName}</p>
        <div className="flex items-center justify-center gap-2 mb-1.5 flex-wrap">
          <a href={c.html_url} target="_blank" rel="noopener noreferrer" className="text-[0.7rem] text-dark-text2 hover:text-qsis transition-colors no-underline">
            <i className="fab fa-github mr-1"></i>@{c.login}
          </a>
          {c.departmentShortName && <span className="text-[0.65rem] text-dark-text3"><i className="fas fa-building mr-0.5 text-teal-400"></i>{c.departmentShortName}</span>}
          {c.semester && !c.hideSemester && <span className="text-[0.65rem] text-dark-text3"><i className="fas fa-graduation-cap mr-0.5 text-accent"></i>{c.semester === 'graduated' ? 'Grad' : c.semester}</span>}
          {c.universityId && !c.hideUniversityId && <span className="text-[0.65rem] text-dark-text3"><i className="fas fa-id-card mr-0.5 text-qsis"></i>{c.universityId}</span>}
          {c.section && <span className="text-[0.65rem] text-dark-text3"><i className="fas fa-users mr-0.5 text-purple-400"></i>{c.section}</span>}
          {c.company && !c.hideCompany && <span className="text-[0.65rem] text-dark-text3"><i className="fas fa-briefcase mr-0.5 text-purple-400"></i>{c.company}</span>}
        </div>
        <div className="flex items-center justify-center gap-2 mb-2">
          <SocialIcons c={c} />
          {onShowHistory && (
            <button onClick={() => onShowHistory(c)} className="w-7 h-7 rounded-lg bg-dark-bg3 flex items-center justify-center text-dark-text2 hover:text-qsis hover:bg-qsis/10 transition-all" title="History">
              <i className="fas fa-circle-info text-[0.7rem]"></i>
            </button>
          )}
        </div>
        <div className="flex items-center justify-center gap-1 flex-wrap mb-1">
          <span className="px-2 py-0.5 rounded-full bg-qsis/25 text-qsis text-[0.6rem] font-bold ring-1 ring-qsis/40">
            <i className="fas fa-crown mr-1"></i>Founder & Lead
          </span>
        </div>
        <div className="flex items-center justify-center gap-2 bg-dark-bg3/50 rounded-xl px-3 py-2.5 mt-2">
          <StatTip size="sm" icon="fa-laptop-code" color="text-blue-400" value={c.v2Contributions} label="Code" tip={CODE_TIP} />
          <div className="w-px h-6 bg-dark-border"></div>
          <StatTip size="sm" icon="fa-book-open" color="text-orange-400" value={c.dataContributions} label="Data" tip={DATA_TIP} />
          <div className="w-px h-6 bg-dark-border"></div>
          <StatTip size="sm" icon="fa-bug" color="text-rose-400" value={c.issueContributions || 0} label="Issues" tip={BUG_TIP} />
          <div className="w-px h-6 bg-dark-border"></div>
          <StatTip size="sm" icon="fa-star" color="text-yellow-500" value={c.v2Contributions + c.dataContributions + (c.issueContributions || 0)} label="Total" tip={TOTAL_TIP} />
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden sm:flex items-center gap-4">
        <div className="relative flex-shrink-0">
          <Image src={c.avatar_url} alt={c.login} width={80} height={80} className="w-20 h-20 rounded-full border-[3px] border-qsis shadow-[0_0_24px_rgba(34,197,94,0.4)] object-cover" />
          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-qsis flex items-center justify-center shadow-lg ring-2 ring-dark-bg2" title="Founder & Lead">
            <i className="fas fa-crown text-white text-[0.6rem]"></i>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[1.1rem] font-bold text-dark-text">{c.name || c.login}</h3>
            <span className="px-2.5 py-0.5 rounded-full bg-qsis/25 text-qsis text-[0.68rem] font-bold ring-1 ring-qsis/40">
              <i className="fas fa-crown mr-1"></i>Founder & Lead
            </span>
          </div>
          <p className="text-[0.82rem] text-qsis font-medium">{config.founderName}</p>
          <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
            <a href={c.html_url} target="_blank" rel="noopener noreferrer" className="text-[0.72rem] text-dark-text2 hover:text-qsis transition-colors no-underline">
              <i className="fab fa-github mr-1"></i>@{c.login}
            </a>
            {c.departmentShortName && <span className="text-[0.68rem] text-dark-text3"><i className="fas fa-building mr-0.5 text-teal-400"></i>{c.departmentShortName}</span>}
            {c.semester && !c.hideSemester && <span className="text-[0.68rem] text-dark-text3"><i className="fas fa-graduation-cap mr-0.5 text-accent"></i>{c.semester === 'graduated' ? 'Grad' : c.semester}</span>}
            {c.universityId && !c.hideUniversityId && <span className="text-[0.68rem] text-dark-text3"><i className="fas fa-id-card mr-0.5 text-qsis"></i>{c.universityId}</span>}
            {c.section && <span className="text-[0.68rem] text-dark-text3"><i className="fas fa-users mr-0.5 text-purple-400"></i>{c.section}</span>}
            {c.company && !c.hideCompany && <span className="text-[0.68rem] text-dark-text3"><i className="fas fa-briefcase mr-0.5 text-purple-400"></i>{c.company}</span>}
          </div>
          <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
            <SocialIcons c={c} />
            {onShowHistory && (
              <button onClick={() => onShowHistory(c)} className="w-6 h-6 rounded-lg bg-dark-bg3 flex items-center justify-center text-dark-text3 hover:text-qsis hover:bg-qsis/10 transition-all" title="History">
                <i className="fas fa-circle-info text-[0.65rem]"></i>
              </button>
            )}
            <div className="w-px h-4 bg-dark-border"></div>
            <span className="text-[0.65rem] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full" title={CODE_TIP}>
              <i className="fas fa-laptop-code mr-1"></i>{c.v2Contributions} Code
            </span>
            <span className="text-[0.65rem] text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full" title={DATA_TIP}>
              <i className="fas fa-book-open mr-1"></i>{c.dataContributions} Data
            </span>
            <span className="text-[0.65rem] text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full" title={BUG_TIP}>
              <i className="fas fa-bug mr-1"></i>{c.issueContributions || 0} Issues
            </span>
            <span className="text-[0.65rem] font-bold text-dark-text bg-dark-bg3 px-2 py-0.5 rounded-full" title={TOTAL_TIP}>
              <i className="fas fa-star mr-1 text-yellow-500"></i>{c.v2Contributions + c.dataContributions + (c.issueContributions || 0)} Total
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
