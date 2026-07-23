'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAppStore } from '@/lib/store';
import { config } from '@/lib/config';

export default function ContributorsView() {
  const router = useRouter();
  const contributors = useAppStore(s => s.contributors);
  const contributorsLoading = useAppStore(s => s.contributorsLoading);
  const loadContributors = useAppStore(s => s.loadContributors);

  useEffect(() => {
    if (contributors.length === 0 && !contributorsLoading) {
      loadContributors();
    }
  }, [contributors.length, contributorsLoading, loadContributors]);

  return (
    <section className="mb-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold flex items-center gap-2"><i className="fas fa-users"></i> Contributors</h3>
        <button className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold" onClick={() => router.push('/')}>
          <i className="fas fa-arrow-left"></i> Back
        </button>
      </div>
      {contributorsLoading ? (
        <div className="loading-container">
          <div className="book-loader">
            <div className="book-base"></div>
            <div className="book-spine-loader"></div>
            <div className="book-cover"></div>
            <div className="book-page-stack">
              <div className="book-page"></div>
              <div className="book-page"></div>
              <div className="book-page"></div>
            </div>
            <div className="page-shadow"></div>
            <div className="page-shadow"></div>
            <div className="page-shadow"></div>
          </div>
          <div className="loading-text">Loading contributors<span className="loading-dots"></span></div>
        </div>
      ) : contributors.length === 0 ? (
        <div className="text-center py-12 text-dark-text2">
          <i className="fas fa-users text-4xl mb-3 block opacity-30"></i>
          <p className="text-[0.9rem]">No contributors found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {contributors.map((c: any) => {
            const isFounder = c.role === 'Founder & Lead';
            return (
              <div key={c.id} className={`${isFounder ? 'bg-gradient-to-br from-qsis/5 to-accent/5 border-qsis/40 ring-1 ring-qsis/20' : 'bg-dark-bg2 border-dark-border'} border rounded-2xl overflow-hidden hover:border-qsis hover:shadow-[0_4px_24px_rgba(34,197,94,0.15)] transition-all group`}>
                <div className={`relative ${isFounder ? 'bg-gradient-to-br from-qsis/20 to-accent/15' : 'bg-gradient-to-br from-qsis/10 to-accent/10'} px-5 pt-6 pb-4 text-center`}>
                  {isFounder && (
                    <div className="absolute top-3 left-3 px-2 py-0.5 rounded-full bg-qsis/20 text-qsis text-[0.6rem] font-bold flex items-center gap-1">
                      <i className="fas fa-star"></i> Programming Light
                    </div>
                  )}
                  {c.profileComplete && (
                    <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center" title="Profile Complete">
                      <i className="fas fa-check text-white text-[0.6rem]"></i>
                    </div>
                  )}
                  <Image
                    src={c.avatar_url}
                    alt={c.login}
                    width={72}
                    height={72}
                    className={`w-[72px] h-[72px] rounded-full mx-auto mb-3 object-cover ${isFounder ? 'border-[3px] border-qsis shadow-[0_0_20px_rgba(34,197,94,0.4)]' : 'border-[3px] border-qsis'}`}
                  />
                  <h4 className="text-[1rem] font-bold text-dark-text">{c.name || c.login}</h4>
                  {isFounder && (
                    <div className="text-[0.75rem] text-qsis font-medium mt-0.5">{config.founderName}</div>
                  )}
                  <a href={c.html_url} target="_blank" rel="noopener noreferrer" className="text-[0.75rem] text-dark-text2 hover:text-qsis transition-colors">@{c.login}</a>
                  <div className="mt-2">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[0.68rem] font-semibold ${
                      isFounder ? 'bg-qsis/25 text-qsis ring-1 ring-qsis/40' :
                      c.role === 'Developer & Resource Provider' ? 'bg-purple-500/15 text-purple-400' :
                      c.role === 'Developer' ? 'bg-blue-500/15 text-blue-400' :
                      c.role === 'Resource Provider' ? 'bg-orange-500/15 text-orange-400' :
                      'bg-dark-bg3 text-dark-text2'
                    }`}>
                      <i className={`fas ${
                        isFounder ? 'fa-crown' :
                        c.role === 'Developer & Resource Provider' ? 'fa-code-branch' :
                        c.role === 'Developer' ? 'fa-laptop-code' :
                        c.role === 'Resource Provider' ? 'fa-book-open' :
                        'fa-user'
                      }`}></i>
                      {c.role}
                    </span>
                    {c.roleType === 'both' && !isFounder && (
                      <span className="ml-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.6rem] font-medium bg-green-500/10 text-green-400">
                        <i className="fas fa-check-circle"></i> Both Repos
                      </span>
                    )}
                  </div>
                  {isFounder && (
                    <div className="mt-2 flex items-center justify-center gap-2 text-[0.65rem] text-dark-text2">
                      <span><i className="fas fa-laptop-code text-blue-400 mr-1"></i>Web App</span>
                      <span><i className="fas fa-book-open text-orange-400 mr-1"></i>Data Repo</span>
                      <span><i className="fas fa-database text-green-400 mr-1"></i>Database</span>
                    </div>
                  )}
                </div>

                {/* Profile details */}
                <div className="px-5 py-4">
                  {c.universityId && (
                    <div className="flex items-center gap-2.5 mb-2.5">
                      <div className="w-7 h-7 rounded-lg bg-qsis/10 flex items-center justify-center flex-shrink-0">
                        <i className="fas fa-id-card text-qsis text-[0.7rem]"></i>
                      </div>
                      <div>
                        <div className="text-[0.65rem] text-dark-text2 leading-tight">University ID</div>
                        <div className="text-[0.82rem] font-semibold text-qsis font-mono">{c.universityId}</div>
                      </div>
                    </div>
                  )}
                  {c.whatsapp && (
                    <div className="flex items-center gap-2.5 mb-2.5">
                      <div className="w-7 h-7 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
                        <i className="fab fa-whatsapp text-green-500 text-[0.7rem]"></i>
                      </div>
                      <div>
                        <div className="text-[0.65rem] text-dark-text2 leading-tight">WhatsApp</div>
                        <div className="text-[0.82rem] font-semibold">{c.whatsapp}</div>
                      </div>
                    </div>
                  )}
                  {c.semester && (
                    <div className="flex items-center gap-2.5 mb-2.5">
                      <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                        <i className="fas fa-graduation-cap text-accent text-[0.7rem]"></i>
                      </div>
                      <div>
                        <div className="text-[0.65rem] text-dark-text2 leading-tight">Semester</div>
                        <div className="text-[0.82rem] font-semibold">{config.semesters.find(s => s.id === c.semester)?.label || c.semester}</div>
                      </div>
                    </div>
                  )}
                  {c.email && (
                    <div className="flex items-center gap-2.5 mb-2.5">
                      <div className="w-7 h-7 rounded-lg bg-yellow-500/10 flex items-center justify-center flex-shrink-0">
                        <i className="fas fa-envelope text-yellow-500 text-[0.7rem]"></i>
                      </div>
                      <div className="min-w-0">
                        <div className="text-[0.65rem] text-dark-text2 leading-tight">Email</div>
                        <div className="text-[0.82rem] font-semibold truncate">{c.email}</div>
                      </div>
                    </div>
                  )}
                  {!c.universityId && !c.whatsapp && !c.semester && !c.email && (
                    <div className="text-center py-2 text-dark-text2 text-[0.78rem]">
                      <i className="fas fa-user-circle mr-1 opacity-40"></i> No profile info yet
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t border-dark-border">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      {c.contributions > 0 && (
                        <span className="text-[0.72rem] text-dark-text2">
                          <i className="fas fa-code-commit mr-1 text-qsis"></i>
                          {c.contributions} commit{c.contributions !== 1 ? 's' : ''}
                        </span>
                      )}
                      {c.prCount > 0 && (
                        <span className="text-[0.72rem] text-dark-text2">
                          <i className="fas fa-code-branch mr-1 text-accent"></i>
                          {c.prCount} PR{c.prCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <a href={c.html_url} target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-lg bg-dark-bg3 flex items-center justify-center text-dark-text2 hover:text-qsis hover:bg-qsis/10 transition-all" title="View GitHub Profile">
                      <i className="fab fa-github text-[0.9rem]"></i>
                    </a>
                  </div>
                  {(c.v2Contributions > 0 || c.dataContributions > 0) && (
                    <div className="flex items-center gap-3 mt-1.5">
                      {c.v2Contributions > 0 && (
                        <span className="text-[0.65rem] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
                          <i className="fas fa-laptop-code mr-1"></i>{c.v2Contributions} Web App
                        </span>
                      )}
                      {c.dataContributions > 0 && (
                        <span className="text-[0.65rem] text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full">
                          <i className="fas fa-book-open mr-1"></i>{c.dataContributions} Data
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Support Us Section */}
      {!contributorsLoading && contributors.length > 0 && (
        <div className="mt-8 bg-gradient-to-br from-qsis/5 to-accent/5 border border-qsis/20 rounded-2xl p-6 text-center">
          <h4 className="text-[1.05rem] font-bold text-dark-text mb-2">
            <i className="fas fa-heart text-red-400 mr-2"></i>Support Our Work
          </h4>
          <p className="text-[0.82rem] text-dark-text2 mb-4 max-w-md mx-auto">
            If this project helps you, please give us a star on GitHub. It motivates us to keep building and maintaining this resource for the IIUC community.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <a
              href={`https://github.com/${config.owner}/QSIS-ARMS-v2`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-qsis to-accent text-white font-semibold text-[0.85rem] no-underline hover:shadow-[0_4px_20px_rgba(34,197,94,0.3)] hover:scale-105 transition-all"
            >
              <i className="fas fa-star"></i> Star QSIS-ARMS v2
              <span className="text-[0.7rem] opacity-80">(Web App)</span>
            </a>
            <a
              href={`https://github.com/${config.owner}/QSIS-ACADEMIC-FILES-MANAFGER`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-yellow-500 text-white font-semibold text-[0.85rem] no-underline hover:shadow-[0_4px_20px_rgba(249,115,22,0.3)] hover:scale-105 transition-all"
            >
              <i className="fas fa-star"></i> Star Academic Files
              <span className="text-[0.7rem] opacity-80">(Data Repo)</span>
            </a>
          </div>
          <p className="text-[0.72rem] text-dark-text2 mt-3">
            <i className="fas fa-code-branch mr-1"></i>
            Fork either repo to contribute — check out the README for guidelines!
          </p>
        </div>
      )}
    </section>
  );
}
