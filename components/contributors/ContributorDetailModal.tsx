'use client';

import Image from 'next/image';
import { config } from '@/lib/config';
import Modal from '@/components/ui/Modal';
import SocialIcons from './SocialIcons';

export default function ContributorDetailModal({ c, onClose }: { c: any; onClose: () => void }) {
  const isFounder = c.role === 'Founder & Lead';
  const isDev = c.v2Contributions > 0;
  const isResource = c.dataContributions > 0;
  const isDesigner = (c.designContributions || 0) > 0;

  const e = c.publicEmail || c.email;

  return (
    <Modal onClose={onClose}>
      <div className="bg-dark-bg2 border border-dark-border rounded-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className={`relative px-5 pt-6 pb-4 text-center ${isFounder ? 'bg-gradient-to-b from-qsis/15 to-transparent' : 'bg-gradient-to-b from-qsis/5 to-transparent'}`}>
          <div className="relative inline-block mb-3">
            <Image src={c.avatar_url} alt={c.login} width={72} height={72} className={`w-[72px] h-[72px] rounded-full object-cover border-2 ${isFounder ? 'border-qsis shadow-[0_0_20px_rgba(34,197,94,0.3)]' : 'border-dark-border'}`} />
            {isFounder && (
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-qsis flex items-center justify-center shadow-lg ring-2 ring-dark-bg2">
                <i className="fas fa-crown text-white text-[0.55rem]"></i>
              </div>
            )}
          </div>
          <h3 className="text-[1rem] font-bold text-dark-text">{c.name || c.login}</h3>
          <a href={c.html_url} target="_blank" rel="noopener noreferrer" className="text-[0.72rem] text-dark-text3 hover:text-qsis transition-colors no-underline">
            @{c.login}
          </a>

          {/* Role badges */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2.5">
            {isFounder && <span className="px-2 py-0.5 rounded-full bg-qsis/20 text-qsis text-[0.62rem] font-bold"><i className="fas fa-crown mr-0.5"></i>Founder</span>}
            {isDev && <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 text-[0.62rem] font-semibold"><i className="fas fa-laptop-code mr-0.5"></i>Developer</span>}
            {isResource && <span className="px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 text-[0.62rem] font-semibold"><i className="fas fa-book-open mr-0.5"></i>Resource</span>}
            {isDesigner && <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[0.62rem] font-semibold"><i className="fas fa-palette mr-0.5"></i>Designer</span>}
            {c.systemRole && <span className="px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 text-[0.62rem] font-semibold">{c.systemRole}</span>}
          </div>
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-qsis/30 to-transparent mx-4"></div>

        {/* Details */}
        <div className="px-5 py-4 space-y-3">
          {/* Info grid */}
          <div className="grid grid-cols-2 gap-2">
            {c.departmentShortName && (
              <div className="bg-dark-bg3 rounded-lg px-3 py-2">
                <p className="text-[0.55rem] text-dark-text3 uppercase tracking-wider mb-0.5"><i className="fas fa-building mr-1 text-teal-400"></i>Department</p>
                <p className="text-[0.75rem] text-dark-text font-medium">{c.departmentShortName}</p>
              </div>
            )}
            {c.semester && !c.hideSemester && (
              <div className="bg-dark-bg3 rounded-lg px-3 py-2">
                <p className="text-[0.55rem] text-dark-text3 uppercase tracking-wider mb-0.5"><i className="fas fa-graduation-cap mr-1 text-accent"></i>Semester</p>
                <p className="text-[0.75rem] text-dark-text font-medium">{c.semester === 'graduated' ? '🎓 Graduated' : config.semesters.find((s: any) => s.id === c.semester)?.label || c.semester}</p>
              </div>
            )}
            {c.universityId && !c.hideUniversityId && (
              <div className="bg-dark-bg3 rounded-lg px-3 py-2">
                <p className="text-[0.55rem] text-dark-text3 uppercase tracking-wider mb-0.5"><i className="fas fa-id-card mr-1 text-qsis"></i>University ID</p>
                <p className="text-[0.75rem] text-dark-text font-medium">{c.universityId}</p>
              </div>
            )}
            {e && !c.hideEmail && (
              <div className="bg-dark-bg3 rounded-lg px-3 py-2">
                <p className="text-[0.55rem] text-dark-text3 uppercase tracking-wider mb-0.5"><i className="fas fa-envelope mr-1 text-blue-400"></i>Email</p>
                <a href={`mailto:${e}`} className="text-[0.75rem] text-qsis font-medium hover:underline break-all">{e}</a>
              </div>
            )}
            {c.whatsapp && !c.hideWhatsapp && (
              <div className="bg-dark-bg3 rounded-lg px-3 py-2">
                <p className="text-[0.55rem] text-dark-text3 uppercase tracking-wider mb-0.5"><i className="fab fa-whatsapp mr-1 text-green-400"></i>WhatsApp</p>
                <a href={`https://wa.me/${c.whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-[0.75rem] text-qsis font-medium hover:underline">{c.whatsapp}</a>
              </div>
            )}
            {c.company && !c.hideCompany && (
              <div className="bg-dark-bg3 rounded-lg px-3 py-2">
                <p className="text-[0.55rem] text-dark-text3 uppercase tracking-wider mb-0.5"><i className="fas fa-briefcase mr-1 text-purple-400"></i>Company</p>
                {c.companyUrl ? (
                  <a href={c.companyUrl} target="_blank" rel="noopener noreferrer" className="text-[0.75rem] text-qsis font-medium hover:underline">{c.company}</a>
                ) : (
                  <p className="text-[0.75rem] text-dark-text font-medium">{c.company}</p>
                )}
              </div>
            )}
          </div>

          {/* Social links */}
          <div className="flex items-center gap-2">
            <span className="text-[0.65rem] text-dark-text3 font-medium"><i className="fas fa-share-alt mr-1"></i>Social:</span>
            <SocialIcons c={c} />
          </div>

          {/* Stats */}
          <div className="bg-dark-bg3 rounded-lg px-3 py-2.5">
            <p className="text-[0.55rem] text-dark-text3 uppercase tracking-wider mb-1.5">Contributions</p>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[0.7rem] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
                <i className="fas fa-laptop-code mr-1"></i>{c.v2Contributions} Code
              </span>
              <span className="text-[0.7rem] text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full">
                <i className="fas fa-book-open mr-1"></i>{c.dataContributions} Data
              </span>
              <span className="text-[0.7rem] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                <i className="fas fa-palette mr-1"></i>{c.designContributions || 0} Design
              </span>
              <span className="text-[0.7rem] text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full">
                <i className="fas fa-bug mr-1"></i>{c.issueContributions || 0} Issues
              </span>
              <span className="text-[0.7rem] font-bold text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-full">
                <i className="fas fa-star mr-1"></i>{c.v2Contributions + c.dataContributions + (c.designContributions || 0) + (c.issueContributions || 0)} Total
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-dark-border flex items-center justify-between">
          <a href={c.html_url} target="_blank" rel="noopener noreferrer" className="text-[0.72rem] text-dark-text3 hover:text-qsis transition-colors no-underline">
            <i className="fab fa-github mr-1"></i>View GitHub Profile
          </a>
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg bg-dark-bg3 text-dark-text2 text-[0.72rem] font-semibold border border-dark-border hover:text-dark-text cursor-pointer transition-colors">
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
