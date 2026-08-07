'use client';

import Image from 'next/image';
import { config } from '@/lib/config';
import { Settings } from './types';

export default function GridCard({ c, settings, onShowHistory }: { c: any; settings: Settings; onShowHistory?: (c: any) => void }) {
  const isDev = c.v2Contributions > 0;
  const isResource = c.dataContributions > 0;
  const isFounder = c.role === 'Founder & Lead';

  return (
    <div className={`bg-dark-bg2 border rounded-2xl overflow-hidden transition-all group flex flex-col ${
      isFounder ? 'border-qsis/40 ring-1 ring-qsis/20' : 'border-dark-border hover:border-qsis/50 hover:shadow-[0_4px_20px_rgba(34,197,94,0.12)]'
    }`}>
      {/* Header */}
      <div className={`relative px-4 pt-5 pb-3 text-center via-qsis/40 ${isFounder ? 'bg-gradient-to-b from-qsis/15 to-transparent' : 'bg-gradient-to-b from-qsis/5 to-transparent'}`}>
        <div className="relative inline-block mb-2.5">
          <Image src={c.avatar_url} alt={c.login} width={64} height={64} className={`w-16 h-16 rounded-full object-cover border-2 transition-colors ${
            isFounder ? 'border-qsis shadow-[0_0_16px_rgba(34,197,94,0.3)]' : 'border-dark-border group-hover:border-qsis/50'
          }`} />
          {isFounder && (
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-qsis flex items-center justify-center shadow-lg ring-2 ring-dark-bg2" title="Founder & Lead">
              <i className="fas fa-crown text-white text-[0.55rem]"></i>
            </div>
          )}
          {!isFounder && isDev && isResource && (
            <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-qsis flex items-center justify-center" title="Developer & Resource Provider">
              <i className="fas fa-star text-white text-[0.45rem]"></i>
            </div>
          )}
        </div>
        <h4 className="text-[0.88rem] font-bold text-dark-text leading-tight truncate">{c.name || c.login}</h4>
        <a href={c.html_url} target="_blank" rel="noopener noreferrer" className="text-[0.7rem] text-dark-text3 hover:text-qsis transition-colors no-underline">
          @{c.login}
        </a>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-1">
          {isFounder && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.62rem] font-bold bg-qsis/20 text-qsis ring-1 ring-qsis/30">
              <i className="fas fa-crown text-[0.45rem]"></i>Founder
            </span>
          )}
          {isDev && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.62rem] font-semibold bg-blue-500/15 text-blue-400">
              <i className="fas fa-laptop-code text-[0.5rem]"></i>Developer
            </span>
          )}
          {isResource && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.62rem] font-semibold bg-orange-500/15 text-orange-400">
              <i className="fas fa-book-open text-[0.5rem]"></i>Resource
            </span>
          )}
          {c.profileComplete && !isFounder && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[0.58rem] font-medium bg-green-500/10 text-green-400">
              <i className="fas fa-check-circle text-[0.45rem]"></i>Complete
            </span>
          )}
        </div>
      </div>

      {/* Green separator line */}
      <div className="h-px bg-gradient-to-r from-transparent via-qsis/40 to-transparent mx-4"></div>

      {/* Info section with labels */}
      <div className="px-4 pb-3 flex-1 mt-3">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {(c as any).departmentShortName && (
            <div className="flex items-center gap-1.5 min-w-0">
              <i className="fas fa-building text-teal-400 text-[0.55rem] w-3 text-center flex-shrink-0"></i>
              <div className="min-w-0">
                <span className="text-[0.55rem] text-dark-text3 block leading-none">Dept</span>
                <span className="text-[0.65rem] text-dark-text2 font-medium truncate block">{(c as any).departmentShortName}</span>
              </div>
            </div>
          )}
          {c.universityId && !c.hideUniversityId && (
            <div className="flex items-center gap-1.5 min-w-0">
              <i className="fas fa-id-card text-qsis text-[0.55rem] w-3 text-center flex-shrink-0"></i>
              <div className="min-w-0">
                <span className="text-[0.55rem] text-dark-text3 block leading-none">ID</span>
                <span className="text-[0.65rem] text-dark-text2 font-medium truncate block">{c.universityId}</span>
              </div>
            </div>
          )}
          {c.semester && !c.hideSemester && (
            <div className="flex items-center gap-1.5 min-w-0">
              <i className="fas fa-graduation-cap text-accent text-[0.55rem] w-3 text-center flex-shrink-0"></i>
              <div className="min-w-0">
                <span className="text-[0.55rem] text-dark-text3 block leading-none">Semester</span>
                <span className="text-[0.65rem] text-dark-text2 font-medium truncate block">{c.semester === 'graduated' ? '🎓 Graduated' : config.semesters.find((s: any) => s.id === c.semester)?.label || c.semester}</span>
              </div>
            </div>
          )}
          {(() => {
            const displayEmail = c.publicEmail || c.email;
            if (displayEmail && !c.hideEmail) return (
              <div className="flex items-center gap-1.5 min-w-0">
                <i className="fas fa-envelope text-blue-400 text-[0.55rem] w-3 text-center flex-shrink-0"></i>
                <div className="min-w-0">
                  <span className="text-[0.55rem] text-dark-text3 block leading-none">Email</span>
                  <span className="text-[0.65rem] text-dark-text2 font-medium truncate block">{displayEmail}</span>
                </div>
              </div>
            );
          })()}
          {c.whatsapp && !c.hideWhatsapp && (
            <div className="flex items-center gap-1.5 min-w-0">
              <i className="fab fa-whatsapp text-green-400 text-[0.55rem] w-3 text-center flex-shrink-0"></i>
              <div className="min-w-0">
                <span className="text-[0.55rem] text-dark-text3 block leading-none">WhatsApp</span>
                <span className="text-[0.65rem] text-dark-text2 font-medium truncate block">{c.whatsapp}</span>
              </div>
            </div>
          )}
          {c.company && !c.hideCompany && (
            <div className="flex items-center gap-1.5 min-w-0">
              <i className="fas fa-briefcase text-purple-400 text-[0.55rem] w-3 text-center flex-shrink-0"></i>
              <div className="min-w-0">
                <span className="text-[0.55rem] text-dark-text3 block leading-none">Company</span>
                {c.companyUrl ? (
                  <a href={c.companyUrl} target="_blank" rel="noopener noreferrer" className="text-[0.65rem] text-dark-text2 font-medium truncate block hover:text-qsis no-underline transition-colors">{c.company}</a>
                ) : (
                  <span className="text-[0.65rem] text-dark-text2 font-medium truncate block">{c.company}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stats footer */}
      <div className="px-4 py-2.5 border-t border-dark-border bg-dark-bg3/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-[0.6rem] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded" title="Code commits">
              <i className="fas fa-laptop-code mr-0.5"></i>{c.v2Contributions}
            </span>
            <span className="text-[0.6rem] text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded" title="Data commits">
              <i className="fas fa-book-open mr-0.5"></i>{c.dataContributions}
            </span>
            <span className="text-[0.6rem] text-accent bg-accent/10 px-1.5 py-0.5 rounded" title="Pull requests">
              <i className="fas fa-code-merge mr-0.5"></i>{c.prCount}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[0.65rem] font-bold text-yellow-500" title="Total contributions">
              {c.v2Contributions + c.dataContributions}
            </span>
            <button
              onClick={() => onShowHistory?.(c)}
              className="w-6 h-6 rounded bg-dark-bg flex items-center justify-center text-dark-text3 hover:text-qsis hover:bg-qsis/10 transition-all"
              title="Contribution history"
              aria-label="Contribution history"
            >
              <i className="fas fa-circle-info text-[0.7rem]"></i>
            </button>
            <a href={c.html_url} target="_blank" rel="noopener noreferrer" className="w-6 h-6 rounded bg-dark-bg flex items-center justify-center text-dark-text3 hover:text-qsis hover:bg-qsis/10 transition-all" title="GitHub Profile">
              <i className="fab fa-github text-[0.7rem]"></i>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
