'use client';

import Image from 'next/image';
import { Settings } from './types';
import SystemRoleBadge from './SystemRoleBadge';
import SocialIcons from './SocialIcons';
import ContactButton from './ContactButton';

export default function GridCard({ c, settings, onShowHistory }: { c: any; settings: Settings; onShowHistory?: (c: any) => void }) {
  const isDev = c.v2Contributions > 0;
  const isResource = c.dataContributions > 0;
  const isDesigner = (c.designContributions || 0) > 0;
  const isFounder = c.role === 'Founder & Lead';
  const total = c.v2Contributions + c.dataContributions + (c.designContributions || 0) + (c.issueContributions || 0);

  return (
    <div className={`bg-dark-bg2 border rounded-xl transition-all group flex flex-col ${
      isFounder ? 'border-qsis/40 ring-1 ring-qsis/20' : 'border-dark-border hover:border-qsis/50 hover:shadow-[0_4px_20px_rgba(34,197,94,0.12)]'
    }`}>
      {/* Header */}
      <div className={`relative px-4 pt-4 pb-2.5 text-center rounded-t-xl ${isFounder ? 'bg-gradient-to-b from-qsis/15 to-transparent' : 'bg-gradient-to-b from-qsis/5 to-transparent'}`}>
        <div className="relative inline-block mb-2 group/avatar">
          <Image src={c.avatar_url} alt={c.login} width={56} height={56} className={`w-14 h-14 rounded-full object-cover border-2 transition-colors ${
            isFounder ? 'border-qsis shadow-[0_0_16px_rgba(34,197,94,0.3)]' : 'border-dark-border group-hover:border-qsis/50'
          }`} />
          {isFounder && (
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-qsis flex items-center justify-center shadow-lg ring-2 ring-dark-bg2">
              <i className="fas fa-crown text-white text-[0.45rem]"></i>
            </div>
          )}
          {!isFounder && c.profileComplete && (
            <div className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-sky-500 flex items-center justify-center shadow ring-2 ring-dark-bg2">
              <i className="fas fa-check text-white text-[0.4rem]"></i>
            </div>
          )}
        </div>
        <h4 className="text-[0.82rem] font-bold text-dark-text leading-tight truncate">{c.name || c.login}</h4>
        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1">
          {isFounder && <span className="px-1.5 py-0.5 rounded-full text-[0.55rem] font-bold bg-qsis/20 text-qsis ring-1 ring-qsis/30"><i className="fas fa-crown text-[0.4rem] mr-0.5"></i>Founder</span>}
          {isDev && <span className="px-1.5 py-0.5 rounded-full text-[0.55rem] font-semibold bg-blue-500/15 text-blue-400"><i className="fas fa-laptop-code text-[0.45rem] mr-0.5"></i>Dev</span>}
          {isResource && <span className="px-1.5 py-0.5 rounded-full text-[0.55rem] font-semibold bg-orange-500/15 text-orange-400"><i className="fas fa-book-open text-[0.45rem] mr-0.5"></i>Data</span>}
          {isDesigner && <span className="px-1.5 py-0.5 rounded-full text-[0.55rem] font-semibold bg-emerald-500/15 text-emerald-400"><i className="fas fa-palette text-[0.45rem] mr-0.5"></i>Design</span>}
          <SystemRoleBadge roleKey={c.systemRoleKey} label={c.systemRole} />
        </div>
      </div>

      <div className="h-px bg-gradient-to-r from-transparent via-qsis/30 to-transparent mx-4"></div>

      {/* Info section — all info shown by default */}
      <div className="px-4 pb-2.5 pt-2 flex-1 space-y-1.5">
        {/* Academic info */}
        <div className="flex items-center gap-2 flex-wrap">
          {c.departmentShortName && (
            <span className="text-[0.6rem] text-dark-text3 truncate"><i className="fas fa-building text-teal-400 mr-0.5"></i>{c.departmentShortName}</span>
          )}
          {c.semester && !c.hideSemester && (
            <span className="text-[0.6rem] text-dark-text3"><i className="fas fa-graduation-cap text-accent mr-0.5"></i>{c.semester === 'graduated' ? 'Grad' : c.semester}</span>
          )}
          {c.section && (
            <span className="text-[0.6rem] text-dark-text3"><i className="fas fa-users text-purple-400 mr-0.5"></i>{c.section}</span>
          )}
        </div>
        {/* IDs & info */}
        <div className="flex items-center gap-2 flex-wrap">
          {c.universityId && !c.hideUniversityId && (
            <span className="text-[0.6rem] text-dark-text3"><i className="fas fa-id-card text-qsis mr-0.5"></i>{c.universityId}</span>
          )}
          {c.title && (
            <span className="text-[0.6rem] text-dark-text3 truncate max-w-[150px]"><i className="fas fa-briefcase text-amber-400 mr-0.5"></i>{c.title}</span>
          )}
          {c.company && !c.hideCompany && (
            <a href={c.companyUrl || undefined} target={c.companyUrl ? '_blank' : undefined} rel="noopener noreferrer" className="text-[0.6rem] text-dark-text3 truncate max-w-[120px] hover:text-qsis transition-colors no-underline">
              <i className="fas fa-building text-rose-400 mr-0.5"></i>{c.company}
            </a>
          )}
        </div>
        {/* Social + Contact */}
        <div className="flex items-center gap-1.5">
          <SocialIcons c={c} />
          <ContactButton c={c} />
        </div>
      </div>

      {/* Stats footer */}
      <div className="px-4 py-2 border-t border-dark-border bg-dark-bg3/50 rounded-b-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <span className="text-[0.55rem] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded" title="Commits to IIUC-ARMS-v2 source-code repo">
              <i className="fas fa-laptop-code mr-0.5"></i>{c.v2Contributions}
            </span>
            <span className="text-[0.55rem] text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded" title="Files uploaded to Academic Files data repo">
              <i className="fas fa-book-open mr-0.5"></i>{c.dataContributions}
            </span>
            <span className="text-[0.55rem] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded" title="Designs published on Creative Hub">
              <i className="fas fa-palette mr-0.5"></i>{c.designContributions || 0}
            </span>
            <span className="text-[0.55rem] text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded" title="Issues opened on IIUC-ARMS-v2 repo">
              <i className="fas fa-bug mr-0.5"></i>{c.issueContributions || 0}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[0.6rem] font-bold text-yellow-500" title="Total contributions">
              {total}
            </span>
            <button onClick={() => onShowHistory?.(c)} className="w-5 h-5 rounded bg-dark-bg flex items-center justify-center text-dark-text3 hover:text-qsis hover:bg-qsis/10 transition-all" title="History">
              <i className="fas fa-circle-info text-[0.6rem]"></i>
            </button>
            <a href={c.html_url} target="_blank" rel="noopener noreferrer" className="w-5 h-5 rounded bg-dark-bg flex items-center justify-center text-dark-text3 hover:text-qsis hover:bg-qsis/10 transition-all" title="GitHub">
              <i className="fab fa-github text-[0.6rem]"></i>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
