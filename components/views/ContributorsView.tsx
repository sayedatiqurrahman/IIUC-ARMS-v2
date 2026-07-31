'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAppStore } from '@/lib/store';
import { config } from '@/lib/config';
import { FACULTIES } from '@/lib/departments';
import CustomSelect from '@/components/CustomSelect';

type ContributorTab = 'developers' | 'resources';

export default function ContributorsView() {
  const router = useRouter();
  const contributors = useAppStore(s => s.contributors);
  const contributorsLoading = useAppStore(s => s.contributorsLoading);
  const loadContributors = useAppStore(s => s.loadContributors);

  const [activeTab, setActiveTab] = useState<ContributorTab>('developers');
  const [deptFilter, setDeptFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (contributors.length === 0 && !contributorsLoading) {
      loadContributors();
    }
  }, [contributors.length, contributorsLoading, loadContributors]);

  const founder = useMemo(() => contributors.find((c: any) => c.role === 'Founder & Lead'), [contributors]);
  const totalCount = contributors.length;
  const useSmartLayout = totalCount > 10;

  // Separate into developers and resource providers
  const developers = useMemo(() =>
    contributors.filter((c: any) => c.role !== 'Founder & Lead' && (c.v2Contributions > 0 || c.roleType === 'developer')),
    [contributors]
  );
  const resourceProviders = useMemo(() =>
    contributors.filter((c: any) => c.role !== 'Founder & Lead' && (c.dataContributions > 0 || c.roleType === 'resource_provider')),
    [contributors]
  );

  // Get unique departments from contributors
  const departments = useMemo(() => {
    const deptMap = new Map<string, string>();
    for (const c of contributors) {
      if (c.department && !deptMap.has(c.department)) {
        deptMap.set(c.department, (c as any).departmentLabel || c.department);
      }
    }
    return Array.from(deptMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [contributors]);

  // Filtered list for smart layout
  const filteredList = useMemo(() => {
    const list = activeTab === 'developers' ? developers : resourceProviders;
    let filtered = list;
    if (deptFilter !== 'all') {
      filtered = filtered.filter((c: any) => c.department === deptFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((c: any) =>
        c.name?.toLowerCase().includes(q) || c.login?.toLowerCase().includes(q) || c.title?.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [activeTab, developers, resourceProviders, deptFilter, searchQuery]);

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
      ) : useSmartLayout ? (
        /* ═══════════ SMART LAYOUT (>10 contributors) ═══════════ */
        <div>
          {/* Founder Section */}
          {founder && <FounderCard c={founder} />}

          {/* Stats Bar */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-dark-bg2 border border-dark-border rounded-xl p-3 text-center">
              <div className="text-[1.3rem] font-bold text-blue-400">{developers.length}</div>
              <div className="text-[0.72rem] text-dark-text2"><i className="fas fa-laptop-code mr-1"></i>Developers</div>
            </div>
            <div className="bg-dark-bg2 border border-dark-border rounded-xl p-3 text-center">
              <div className="text-[1.3rem] font-bold text-orange-400">{resourceProviders.length}</div>
              <div className="text-[0.72rem] text-dark-text2"><i className="fas fa-book-open mr-1"></i>Resource Providers</div>
            </div>
            <div className="bg-dark-bg2 border border-dark-border rounded-xl p-3 text-center">
              <div className="text-[1.3rem] font-bold text-qsis">{contributors.length}</div>
              <div className="text-[0.72rem] text-dark-text2"><i className="fas fa-users mr-1"></i>Total</div>
            </div>
          </div>

          {/* Tabs + Filters */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            {/* Tab Buttons */}
            <div className="flex gap-1 p-1 bg-dark-bg2 border border-dark-border rounded-xl">
              <button
                onClick={() => { setActiveTab('developers'); setDeptFilter('all'); setSearchQuery(''); }}
                className={`px-4 py-2 rounded-lg text-[0.78rem] font-semibold cursor-pointer border-none transition-all ${
                  activeTab === 'developers'
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'bg-transparent text-dark-text2 hover:text-dark-text'
                }`}
              >
                <i className="fas fa-laptop-code mr-1.5"></i>Web App Developers
                <span className="ml-1.5 text-[0.65rem] opacity-70">({developers.length})</span>
              </button>
              <button
                onClick={() => { setActiveTab('resources'); setDeptFilter('all'); setSearchQuery(''); }}
                className={`px-4 py-2 rounded-lg text-[0.78rem] font-semibold cursor-pointer border-none transition-all ${
                  activeTab === 'resources'
                    ? 'bg-orange-500/20 text-orange-400'
                    : 'bg-transparent text-dark-text2 hover:text-dark-text'
                }`}
              >
                <i className="fas fa-book-open mr-1.5"></i>Resource Providers
                <span className="ml-1.5 text-[0.65rem] opacity-70">({resourceProviders.length})</span>
              </button>
            </div>

            {/* Search + Dept Filter */}
            <div className="flex gap-2 items-center w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-none">
                <i className="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-text3 text-[0.7rem]"></i>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="w-full sm:w-44 pl-8 pr-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.78rem] outline-none focus:border-qsis transition-colors"
                />
              </div>
              <CustomSelect
                value={deptFilter}
                onChange={setDeptFilter}
                placeholder="All Departments"
                options={[
                  { value: 'all', label: 'All Departments', icon: 'fa-building' },
                  ...departments.map(([id, label]) => ({
                    value: id,
                    label,
                    icon: 'fa-building',
                  })),
                ]}
                searchable
              />
            </div>
          </div>

          {/* Ranked List */}
          {filteredList.length === 0 ? (
            <div className="text-center py-8 text-dark-text2">
              <i className="fas fa-search text-2xl mb-2 block opacity-30"></i>
              <p className="text-[0.82rem]">No contributors found with current filters.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredList.map((c: any, idx: number) => (
                <RankedCard key={c.id} c={c} rank={idx + 1} />
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ═══════════ SIMPLE LAYOUT (≤10 contributors) ═══════════ */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {contributors.map((c: any) => (
            <SimpleCard key={c.id} c={c} />
          ))}
        </div>
      )}

      {/* How to Become a Contributor */}
      {!contributorsLoading && contributors.length > 0 && (
        <div className="mt-8 bg-gradient-to-br from-qsis/10 to-accent/5 border border-qsis/25 rounded-2xl p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-qsis/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <i className="fas fa-trophy text-qsis text-[1.1rem]"></i>
            </div>
            <div>
              <h4 className="text-[0.95rem] font-bold text-dark-text mb-1">Want Your Name Here?</h4>
              <p className="text-[0.8rem] text-dark-text2 leading-relaxed">
                Upload academic documents — notes, sheets, previous questions, or syllabus — for your department. Every valid contribution earns you a spot on this page with your profile, stats, and GitHub link.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-dark-bg border border-dark-border">
              <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center flex-shrink-0">
                <i className="fas fa-upload text-blue-400 text-[0.75rem]"></i>
              </div>
              <div>
                <div className="text-[0.75rem] font-semibold">1. Upload Files</div>
                <div className="text-[0.62rem] text-dark-text2">Notes, sheets, questions</div>
              </div>
            </div>
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-dark-bg border border-dark-border">
              <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center flex-shrink-0">
                <i className="fas fa-check-circle text-accent text-[0.75rem]"></i>
              </div>
              <div>
                <div className="text-[0.75rem] font-semibold">2. Get Reviewed</div>
                <div className="text-[0.62rem] text-dark-text2">Team verifies quality</div>
              </div>
            </div>
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-dark-bg border border-dark-border">
              <div className="w-8 h-8 rounded-lg bg-green-500/15 flex items-center justify-center flex-shrink-0">
                <i className="fas fa-user-check text-green-400 text-[0.75rem]"></i>
              </div>
              <div>
                <div className="text-[0.75rem] font-semibold">3. Get Listed</div>
                <div className="text-[0.62rem] text-dark-text2">Your name &amp; profile here</div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-qsis to-accent text-white font-semibold text-[0.8rem] cursor-pointer hover:shadow-[0_4px_16px_rgba(34,197,94,0.3)] hover:scale-[1.02] transition-all border-none" onClick={() => router.push('/')}>
              <i className="fas fa-upload"></i> Start Uploading
            </button>
            <span className="text-[0.7rem] text-dark-text2">or visit <strong className="text-qsis">Dashboard</strong> to get started</span>
          </div>
        </div>
      )}

      {/* Policy Warning */}
      {!contributorsLoading && contributors.length > 0 && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 mt-4">
          <div className="flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-red-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
              <i className="fas fa-exclamation-triangle text-red-400 text-[0.7rem]"></i>
            </div>
            <div>
              <h5 className="text-[0.82rem] font-semibold text-red-400 mb-1">Contribution Policy</h5>
              <ul className="text-[0.72rem] text-dark-text2 space-y-1 list-none">
                <li><i className="fas fa-check text-green-400 mr-1.5"></i>Upload only original academic documents relevant to IIUC</li>
                <li><i className="fas fa-check text-green-400 mr-1.5"></i>One account per person — no duplicate accounts</li>
                <li><i className="fas fa-times text-red-400 mr-1.5"></i>No spam, irrelevant content, or copied work claimed as own</li>
                <li><i className="fas fa-times text-red-400 mr-1.5"></i>Duplicate submissions or malicious activity will result in a <strong>permanent ban</strong></li>
              </ul>
            </div>
          </div>
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
               <i className="fas fa-star"></i> Star IIUC-ARMS v2
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

/* ═══════════ FOUNDER CARD (Smart Layout) ═══════════ */
function FounderCard({ c }: { c: any }) {
  return (
    <div className="bg-gradient-to-br from-qsis/10 to-accent/10 border-2 border-qsis/40 rounded-2xl p-5 mb-5 ring-1 ring-qsis/20">
      <div className="flex items-center gap-4">
        <div className="relative flex-shrink-0">
          <Image src={c.avatar_url} alt={c.login} width={80} height={80} className="w-20 h-20 rounded-full border-[3px] border-qsis shadow-[0_0_24px_rgba(34,197,94,0.4)] object-cover" />
          <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-qsis flex items-center justify-center shadow-lg">
            <i className="fas fa-crown text-white text-[0.7rem]"></i>
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
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <a href={c.html_url} target="_blank" rel="noopener noreferrer" className="text-[0.75rem] text-dark-text2 hover:text-qsis transition-colors no-underline">
              <i className="fab fa-github mr-1"></i>@{c.login}
            </a>
            {c.contributions > 0 && (
              <span className="text-[0.72rem] text-dark-text2">
                <i className="fas fa-code-commit mr-1 text-qsis"></i>{c.contributions} commits
              </span>
            )}
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
          <div className="flex items-center gap-2 mt-2 text-[0.68rem] text-dark-text2">
            <span><i className="fas fa-laptop-code text-blue-400 mr-1"></i>Web App</span>
            <span><i className="fas fa-book-open text-orange-400 mr-1"></i>Data Repo</span>
            <span><i className="fas fa-database text-green-400 mr-1"></i>Database</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════ RANKED CARD (Smart Layout) ═══════════ */
function RankedCard({ c, rank }: { c: any; rank: number }) {
  const isTop3 = rank <= 3;
  const rankColors: Record<number, string> = {
    1: 'bg-yellow-500 text-white',
    2: 'bg-gray-400 text-white',
    3: 'bg-orange-600 text-white',
  };

  return (
    <div className={`flex items-center gap-4 p-4 rounded-xl border transition-all hover:border-qsis/40 hover:shadow-[0_2px_12px_rgba(34,197,94,0.1)] ${
      isTop3 ? 'bg-dark-bg2 border-qsis/20' : 'bg-dark-bg2 border-dark-border'
    }`}>
      {/* Rank Number */}
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-[0.85rem] ${
        rankColors[rank] || 'bg-dark-bg3 text-dark-text2'
      }`}>
        #{rank}
      </div>

      {/* Avatar */}
      <Image src={c.avatar_url} alt={c.login} width={48} height={48} className="w-12 h-12 rounded-full border-2 border-dark-border object-cover flex-shrink-0" />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[0.9rem] font-bold text-dark-text truncate">{c.name || c.login}</span>
          {c.roleType === 'both' && (
            <span className="px-1.5 py-0.5 rounded-md bg-purple-500/15 text-purple-400 text-[0.58rem] font-bold">Both</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          <a href={c.html_url} target="_blank" rel="noopener noreferrer" className="text-[0.72rem] text-dark-text3 hover:text-qsis transition-colors no-underline">
            <i className="fab fa-github mr-1"></i>@{c.login}
          </a>
          {c.title && <span className="text-[0.68rem] text-qsis italic">{c.title}</span>}
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          {(c as any).departmentLabel && (
            <span className="text-[0.65rem] text-dark-text3">
              <i className="fas fa-building mr-1 text-teal-400"></i>{(c as any).departmentShortName || c.department}
            </span>
          )}
          {c.semester && !c.hideSemester && (
            <span className="text-[0.65rem] text-dark-text3">
              <i className="fas fa-graduation-cap mr-1 text-accent"></i>{c.semester === 'graduated' ? '🎓 Graduated' : config.semesters.find(s => s.id === c.semester)?.label || c.semester}
            </span>
          )}
        </div>
      </div>

      {/* Contribution Stats */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {c.v2Contributions > 0 && (
          <div className="text-center">
            <div className="text-[0.85rem] font-bold text-blue-400">{c.v2Contributions}</div>
            <div className="text-[0.58rem] text-dark-text3">Web App</div>
          </div>
        )}
        {c.dataContributions > 0 && (
          <div className="text-center">
            <div className="text-[0.85rem] font-bold text-orange-400">{c.dataContributions}</div>
            <div className="text-[0.58rem] text-dark-text3">Data</div>
          </div>
        )}
        {c.prCount > 0 && (
          <div className="text-center">
            <div className="text-[0.85rem] font-bold text-accent">{c.prCount}</div>
            <div className="text-[0.58rem] text-dark-text3">PRs</div>
          </div>
        )}
      </div>

      {/* GitHub Link */}
      <a href={c.html_url} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-lg bg-dark-bg3 flex items-center justify-center text-dark-text2 hover:text-qsis hover:bg-qsis/10 transition-all flex-shrink-0" title="View GitHub Profile">
        <i className="fab fa-github"></i>
      </a>
    </div>
  );
}

/* ═══════════ SIMPLE CARD (Simple Layout) ═══════════ */
function SimpleCard({ c }: { c: any }) {
  const isFounder = c.role === 'Founder & Lead';
  return (
    <div className={`${isFounder ? 'bg-gradient-to-br from-qsis/5 to-accent/5 border-qsis/40 ring-1 ring-qsis/20' : 'bg-dark-bg2 border-dark-border'} border rounded-2xl overflow-hidden hover:border-qsis hover:shadow-[0_4px_24px_rgba(34,197,94,0.15)] transition-all group`}>
      <div className={`relative ${isFounder ? 'bg-gradient-to-br from-qsis/20 to-accent/15' : 'bg-gradient-to-br from-qsis/10 to-accent/10'} px-5 pt-6 pb-4 text-center`}>
        {c.company && (
          <div className="absolute top-3 left-3 px-2 py-0.5 rounded-full bg-qsis/20 text-qsis text-[0.6rem] font-bold flex items-center gap-1">
            {c.companyUrl ? (
              <a href={c.companyUrl} target="_blank" rel="noopener noreferrer" className="text-qsis hover:underline no-underline"><i className="fas fa-star mr-0.5"></i>{c.company}</a>
            ) : (
              <><i className="fas fa-star"></i> {c.company}</>
            )}
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
        {c.title ? (
          <p className="text-[0.75rem] text-qsis font-medium mt-0.5 italic">{c.title}</p>
        ) : (
          <a href={c.html_url} target="_blank" rel="noopener noreferrer" className="text-[0.75rem] text-dark-text2 hover:text-qsis transition-colors">@{c.login}</a>
        )}
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
      <div className="px-5 py-4">
        {(c.universityId && !c.hideUniversityId) || (c.semester && !c.hideSemester) ? (
          <div className="grid grid-cols-2 gap-2.5 mb-2.5">
            {c.universityId && !c.hideUniversityId && (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-qsis/10 flex items-center justify-center flex-shrink-0">
                  <i className="fas fa-id-card text-qsis text-[0.7rem]"></i>
                </div>
                <div className="min-w-0">
                  <div className="text-[0.65rem] text-dark-text2 leading-tight">University ID</div>
                  <div className="text-[0.82rem] font-semibold text-qsis font-mono truncate">{c.universityId}</div>
                </div>
              </div>
            )}
            {c.semester && !c.hideSemester && (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <i className="fas fa-graduation-cap text-accent text-[0.7rem]"></i>
                </div>
                <div className="min-w-0">
                  <div className="text-[0.65rem] text-dark-text2 leading-tight">Semester</div>
                  <div className="text-[0.82rem] font-semibold truncate">{c.semester === 'graduated' ? '🎓 Graduated' : config.semesters.find(s => s.id === c.semester)?.label || c.semester}</div>
                </div>
              </div>
            )}
          </div>
        ) : null}
        {c.whatsapp && !c.hideWhatsapp && (() => {
          const cleaned = c.whatsapp.replace(/[^0-9]/g, '');
          const waNumber = cleaned.startsWith('0') ? '880' + cleaned.slice(1) : cleaned.startsWith('880') ? cleaned : cleaned;
          const waMessage = encodeURIComponent(`Hi! I came across your profile on IIUC-ARMS and would like to connect with you.`);
          const waUrl = `https://wa.me/${waNumber}?text=${waMessage}`;
          return (
            <a href={waUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 mb-2.5 group cursor-pointer no-underline">
              <div className="w-7 h-7 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-green-500/20 transition-colors">
                <i className="fab fa-whatsapp text-green-500 text-[0.7rem]"></i>
              </div>
              <div>
                <div className="text-[0.65rem] text-dark-text2 leading-tight">WhatsApp</div>
                <div className="text-[0.82rem] font-semibold text-dark-text group-hover:text-green-400 transition-colors">{c.whatsapp} <i className="fas fa-external-link-alt text-[0.55rem] ml-1 text-dark-text2"></i></div>
              </div>
            </a>
          );
        })()}
        {c.email && !c.hideEmail && (
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
        {(c.website || c.facebook || c.twitter || c.linkedin) && (
          <div className="flex items-center justify-center gap-1.5 mb-2.5">
            {c.website && <a href={c.website} target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-full bg-dark-bg border border-dark-border flex items-center justify-center text-dark-text2 hover:text-white hover:bg-sky-500/20 hover:border-sky-400/50 transition-all" title={c.website.replace(/https?:\/\//, '')}><i className="fas fa-globe text-[0.72rem]"></i></a>}
            {c.facebook && <a href={c.facebook} target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-full bg-dark-bg border border-dark-border flex items-center justify-center text-dark-text2 hover:text-white hover:bg-blue-600/20 hover:border-blue-500/50 transition-all" title="Facebook"><i className="fab fa-facebook-f text-[0.72rem]"></i></a>}
            {c.twitter && <a href={c.twitter} target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-full bg-dark-bg border border-dark-border flex items-center justify-center text-dark-text2 hover:text-white hover:bg-sky-400/20 hover:border-sky-300/50 transition-all" title="Twitter / X"><i className="fab fa-x-twitter text-[0.72rem]"></i></a>}
            {c.linkedin && <a href={c.linkedin} target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-full bg-dark-bg border border-dark-border flex items-center justify-center text-dark-text2 hover:text-white hover:bg-blue-700/20 hover:border-blue-600/50 transition-all" title="LinkedIn"><i className="fab fa-linkedin-in text-[0.72rem]"></i></a>}
          </div>
        )}
        {!c.universityId && !c.whatsapp && !c.semester && !c.email && (
          <div className="text-center py-2 text-dark-text2 text-[0.78rem]">
            <i className="fas fa-user-circle mr-1 opacity-40"></i> No profile info yet
          </div>
        )}
      </div>
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
}
