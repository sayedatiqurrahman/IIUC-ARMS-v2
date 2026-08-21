'use client';

import Image from 'next/image';
import Modal from '@/components/ui/Modal';
import SocialIcons from './SocialIcons';

export default function ContributorDetailListModal({ title, list, onClose, onShowHistory, isOpen = true }: { title: string; list: any[]; onClose: () => void; onShowHistory?: (c: any) => void; isOpen?: boolean }) {
  const sorted = [...list].sort((a: any, b: any) => {
    const aTotal = a.v2Contributions + a.dataContributions + (a.designContributions || 0) + (a.issueContributions || 0);
    const bTotal = b.v2Contributions + b.dataContributions + (b.designContributions || 0) + (b.issueContributions || 0);
    return bTotal - aTotal;
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-dark-bg2 border border-dark-border rounded-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        <div className="px-5 pt-4 pb-3 border-b border-dark-border flex items-center justify-between">
          <div>
            <h3 className="text-[0.95rem] font-bold text-dark-text">{title}</h3>
            <p className="text-[0.7rem] text-dark-text3">{list.length} contributor{list.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-dark-bg3 flex items-center justify-center text-dark-text3 hover:text-dark-text cursor-pointer border-none transition-colors">
            <i className="fas fa-times text-[0.8rem]"></i>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
          {sorted.map((c: any, i: number) => {
            const total = c.v2Contributions + c.dataContributions + (c.designContributions || 0) + (c.issueContributions || 0);
            return (
              <div key={c.login || c.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-dark-bg3 border border-dark-border hover:border-qsis/30 transition-colors">
                <span className="text-[0.7rem] font-bold text-dark-text3 w-5 text-center flex-shrink-0">#{i + 1}</span>
                <Image src={c.avatar_url} alt={c.login} width={36} height={36} className="w-9 h-9 rounded-full border-2 border-dark-border object-cover flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[0.78rem] font-semibold text-dark-text truncate">{c.name || c.login}</div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <a href={c.html_url} target="_blank" rel="noopener noreferrer" className="text-[0.6rem] text-dark-text3 hover:text-qsis no-underline">
                      <i className="fab fa-github mr-0.5"></i>@{c.login}
                    </a>
                    {c.departmentShortName && <span className="text-[0.55rem] text-dark-text3"><i className="fas fa-building mr-0.5 text-teal-400"></i>{c.departmentShortName}</span>}
                    {c.semester && !c.hideSemester && <span className="text-[0.55rem] text-dark-text3"><i className="fas fa-graduation-cap mr-0.5 text-accent"></i>{c.semester === 'graduated' ? 'Grad' : c.semester}</span>}
                    {c.universityId && !c.hideUniversityId && <span className="text-[0.55rem] text-dark-text3"><i className="fas fa-id-card mr-0.5 text-qsis"></i>{c.universityId}</span>}
                    {c.whatsapp && !c.hideWhatsapp && <a href={`https://wa.me/${c.whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-[0.55rem] text-green-400 no-underline"><i className="fab fa-whatsapp mr-0.5"></i>WhatsApp</a>}
                    {(c.publicEmail || c.email) && !c.hideEmail && <a href={`mailto:${c.publicEmail || c.email}`} className="text-[0.55rem] text-amber-400 no-underline"><i className="fas fa-envelope mr-0.5"></i>Email</a>}
                    <SocialIcons c={c} />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {c.v2Contributions > 0 && <span className="text-[0.55rem] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded"><i className="fas fa-laptop-code mr-0.5"></i>{c.v2Contributions}</span>}
                  {c.dataContributions > 0 && <span className="text-[0.55rem] text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded"><i className="fas fa-book-open mr-0.5"></i>{c.dataContributions}</span>}
                  {(c.designContributions || 0) > 0 && <span className="text-[0.55rem] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded"><i className="fas fa-palette mr-0.5"></i>{c.designContributions}</span>}
                  {(c.issueContributions || 0) > 0 && <span className="text-[0.55rem] text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded"><i className="fas fa-bug mr-0.5"></i>{c.issueContributions}</span>}
                </div>
                <span className="text-[0.65rem] font-bold text-yellow-500 flex-shrink-0">{total}</span>
                {onShowHistory && (
                  <button onClick={() => onShowHistory(c)} className="w-6 h-6 rounded bg-dark-bg flex items-center justify-center text-dark-text3 hover:text-qsis hover:bg-qsis/10 transition-all flex-shrink-0" title="History">
                    <i className="fas fa-circle-info text-[0.6rem]"></i>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
