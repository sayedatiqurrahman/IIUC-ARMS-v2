'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAppStore } from '@/lib/store';
import { config } from '@/lib/config';
import { FACULTIES } from '@/lib/departments';
import CustomSelect from '@/components/CustomSelect';

interface Settings {
  viewMode: 'sectioned' | 'grid';
  sectionCount: 2 | 3;
  showRanks: boolean;
  showStats: boolean;
  showDeptFilter: boolean;
  showSearch: boolean;
  allowUserToggle: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  viewMode: 'sectioned',
  sectionCount: 3,
  showRanks: true,
  showStats: true,
  showDeptFilter: true,
  showSearch: true,
  allowUserToggle: true,
};

export default function ContributorsView() {
  const router = useRouter();
  const contributorsRaw = useAppStore(s => s.contributors);
  const contributors = Array.isArray(contributorsRaw) ? contributorsRaw : [];
  const contributorsLoading = useAppStore(s => s.contributorsLoading);
  const loadContributors = useAppStore(s => s.loadContributors);

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [userView, setUserView] = useState<'sectioned' | 'grid'>('sectioned');
  const [activeTab, setActiveTab] = useState<'all' | 'developers' | 'resources'>('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (contributors.length === 0 && !contributorsLoading) loadContributors();
  }, [contributors.length, contributorsLoading, loadContributors]);

  // Fetch admin settings
  useEffect(() => {
    fetch('/api/settings/contributors')
      .then(r => r.json())
      .then(d => {
        if (d && !d.error) {
          const s = { ...DEFAULT_SETTINGS, ...d };
          setSettings(s);
          setUserView(s.viewMode);
        }
      })
      .catch(() => {});
  }, []);

  const founder = useMemo(() => contributors.find((c: any) => c.role === 'Founder & Lead'), [contributors]);

  // Simple repo-based categories — ALL contributors including founder
  // Developers = anyone who contributed to QSIS-ARMS-v2 (code repo)
  const developers = useMemo(() =>
    contributors.filter((c: any) => c.v2Contributions > 0),
    [contributors]
  );
  // Resources = anyone who contributed to QSIS-ACADEMIC-FILES-MANAFGER (data repo)
  const resources = useMemo(() =>
    contributors.filter((c: any) => c.dataContributions > 0),
    [contributors]
  );
  // Both = people in both lists
  const bothRepos = useMemo(() =>
    contributors.filter((c: any) => c.v2Contributions > 0 && c.dataContributions > 0),
    [contributors]
  );

  // Departments
  const departments = useMemo(() => {
    const deptMap = new Map<string, string>();
    for (const c of contributors) {
      if (c.department && !deptMap.has(c.department)) {
        deptMap.set(c.department, (c as any).departmentLabel || c.department);
      }
    }
    return Array.from(deptMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [contributors]);

  // Apply filters
  const applyFilters = (list: any[]) => {
    let filtered = list;
    if (deptFilter !== 'all') filtered = filtered.filter((c: any) => c.department === deptFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((c: any) =>
        c.name?.toLowerCase().includes(q) || c.login?.toLowerCase().includes(q) || c.title?.toLowerCase().includes(q)
      );
    }
    return filtered;
  };

  const effectiveView = settings.allowUserToggle ? userView : settings.viewMode;

  // Tab-filtered lists with per-tab sorting
  const tabList = useMemo(() => {
    if (activeTab === 'developers') {
      return applyFilters(developers).sort((a: any, b: any) => b.v2Contributions - a.v2Contributions);
    }
    if (activeTab === 'resources') {
      return applyFilters(resources).sort((a: any, b: any) => b.dataContributions - a.dataContributions);
    }
    // 'all' = merged, ranked by combined total (v2 + data)
    const devLogins = new Set(developers.map((c: any) => c.login));
    const merged = [...developers, ...resources.filter((c: any) => !devLogins.has(c.login))];
    return applyFilters(merged).sort((a: any, b: any) => {
      return (b.v2Contributions + b.dataContributions) - (a.v2Contributions + a.dataContributions);
    });
  }, [activeTab, developers, resources, deptFilter, searchQuery]);

  return (
    <section className="mb-5">
      {/* Header */}
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
        <div>
          {/* Founder */}
          {founder && <FounderCard c={founder} />}

          {/* Stats Bar */}
          <div className="grid grid-cols-4 gap-3 mb-5">
            <div className="bg-dark-bg2 border border-dark-border rounded-xl p-3 text-center">
              <div className="text-[1.3rem] font-bold text-purple-400">{bothRepos.length}</div>
              <div className="text-[0.72rem] text-dark-text2"><i className="fas fa-code-branch mr-1"></i>Both</div>
            </div>
            <div className="bg-dark-bg2 border border-dark-border rounded-xl p-3 text-center">
              <div className="text-[1.3rem] font-bold text-blue-400">{developers.length}</div>
              <div className="text-[0.72rem] text-dark-text2"><i className="fas fa-laptop-code mr-1"></i>Developers</div>
            </div>
            <div className="bg-dark-bg2 border border-dark-border rounded-xl p-3 text-center">
              <div className="text-[1.3rem] font-bold text-orange-400">{resources.length}</div>
              <div className="text-[0.72rem] text-dark-text2"><i className="fas fa-book-open mr-1"></i>Resources</div>
            </div>
            <div className="bg-dark-bg2 border border-dark-border rounded-xl p-3 text-center">
              <div className="text-[1.3rem] font-bold text-qsis">{contributors.length}</div>
              <div className="text-[0.72rem] text-dark-text2"><i className="fas fa-users mr-1"></i>Total</div>
            </div>
          </div>

          {/* Controls Row */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              {/* View Toggle (user) */}
              {settings.allowUserToggle && (
                <div className="flex gap-1 p-1 bg-dark-bg2 border border-dark-border rounded-xl">
                  <button
                    onClick={() => setUserView('sectioned')}
                    className={`px-3 py-1.5 rounded-lg text-[0.72rem] font-semibold cursor-pointer border-none transition-all ${
                      userView === 'sectioned' ? 'bg-qsis text-white' : 'bg-transparent text-dark-text2 hover:text-dark-text'
                    }`}
                  >
                    <i className="fas fa-layer-group mr-1"></i>Sections
                  </button>
                  <button
                    onClick={() => setUserView('grid')}
                    className={`px-3 py-1.5 rounded-lg text-[0.72rem] font-semibold cursor-pointer border-none transition-all ${
                      userView === 'grid' ? 'bg-qsis text-white' : 'bg-transparent text-dark-text2 hover:text-dark-text'
                    }`}
                  >
                    <i className="fas fa-th-large mr-1"></i>Grid
                  </button>
                </div>
              )}

              {/* Sectioned Tabs */}
              {effectiveView === 'sectioned' && (
                <div className="flex gap-1 p-1 bg-dark-bg2 border border-dark-border rounded-xl">
                  <button
                    onClick={() => { setActiveTab('all'); setDeptFilter('all'); setSearchQuery(''); }}
                    className={`px-3 py-1.5 rounded-lg text-[0.72rem] font-semibold cursor-pointer border-none transition-all ${
                      activeTab === 'all' ? 'bg-purple-500/20 text-purple-400' : 'bg-transparent text-dark-text2 hover:text-dark-text'
                    }`}
                  >
                    <i className="fas fa-layer-group mr-1"></i>All
                    <span className="ml-1 text-[0.6rem] opacity-70">({developers.length + resources.length - bothRepos.length})</span>
                  </button>
                  {settings.sectionCount === 3 && (
                    <button
                      onClick={() => { setActiveTab('developers'); setDeptFilter('all'); setSearchQuery(''); }}
                      className={`px-3 py-1.5 rounded-lg text-[0.72rem] font-semibold cursor-pointer border-none transition-all ${
                        activeTab === 'developers' ? 'bg-blue-500/20 text-blue-400' : 'bg-transparent text-dark-text2 hover:text-dark-text'
                      }`}
                    >
                      <i className="fas fa-laptop-code mr-1"></i>Developers
                      <span className="ml-1 text-[0.6rem] opacity-70">({developers.length})</span>
                    </button>
                  )}
                  {settings.sectionCount === 3 && (
                    <button
                      onClick={() => { setActiveTab('resources'); setDeptFilter('all'); setSearchQuery(''); }}
                      className={`px-3 py-1.5 rounded-lg text-[0.72rem] font-semibold cursor-pointer border-none transition-all ${
                        activeTab === 'resources' ? 'bg-orange-500/20 text-orange-400' : 'bg-transparent text-dark-text2 hover:text-dark-text'
                      }`}
                    >
                      <i className="fas fa-book-open mr-1"></i>Resources
                      <span className="ml-1 text-[0.6rem] opacity-70">({resources.length})</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Search + Dept Filter */}
            <div className="flex gap-2 items-center w-full sm:w-auto">
              {settings.showSearch && (
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
              )}
              {settings.showDeptFilter && (
                <CustomSelect
                  value={deptFilter}
                  onChange={setDeptFilter}
                  placeholder="All Departments"
                  options={[
                    { value: 'all', label: 'All Departments', icon: 'fa-building' },
                    ...departments.map(([id, label]) => ({ value: id, label, icon: 'fa-building' })),
                  ]}
                  searchable
                />
              )}
            </div>
          </div>

          {/* ═══ SECTIONED VIEW ═══ */}
          {effectiveView === 'sectioned' ? (
            <div>
              {tabList.length === 0 ? (
                <div className="text-center py-6 text-dark-text2 text-[0.8rem]">No contributors found.</div>
              ) : (
                <div className="space-y-2">
                  {tabList.map((c: any, idx: number) => (
                    <RankedCard key={c.id} c={c} rank={idx + 1} settings={settings} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* ═══ GRID VIEW ═══ */
            <div>
              {tabList.length === 0 ? (
                <div className="text-center py-6 text-dark-text2 text-[0.8rem]">No contributors found.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {tabList.map((c: any) => (
                    <GridCard key={c.id} c={c} settings={settings} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* How to Become a Contributor */}
      {!contributorsLoading && contributors.length > 0 && (
        <div className="mt-24 pt-8 border-t  border-dark-border">
          <div className="bg-gradient-to-br from-qsis/10 to-accent/5 border border-qsis/25 rounded-2xl p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-qsis/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <i className="fas fa-trophy text-qsis text-[1.1rem]"></i>
              </div>
              <div>
                <h4 className="text-[0.95rem] font-bold text-dark-text mb-1">Want Your Name Here?</h4>
                <p className="text-[0.8rem] text-dark-text2 leading-relaxed">
                  Upload academic documents — notes, sheets, previous questions, or syllabus — for your department. Every valid contribution earns you a spot on this page.
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
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-qsis to-accent text-white font-semibold text-[0.8rem] cursor-pointer hover:shadow-[0_4px_16px_rgba(34,197,94,0.3)] hover:scale-[1.02] transition-all border-none" onClick={() => router.push('/')}>
              <i className="fas fa-upload"></i> Start Uploading
            </button>
          </div>
        </div>
      )}

      {/* Support Us */}
      {!contributorsLoading && contributors.length > 0 && (
        <div className="mt-10 pt-8 border-t border-dark-border">
          <div className="bg-gradient-to-br from-qsis/5 to-accent/5 border border-qsis/20 rounded-2xl p-6 text-center">
            <h4 className="text-[1.05rem] font-bold text-dark-text mb-2">
              <i className="fas fa-heart text-red-400 mr-2"></i>Support Our Work
            </h4>
            <p className="text-[0.82rem] text-dark-text2 mb-4 max-w-md mx-auto">
              If this project helps you, please give us a star on GitHub. It motivates us to keep building and maintaining this resource for the IIUC community.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <a href={`https://github.com/${config.owner}/QSIS-ARMS-v2`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-qsis to-accent text-white font-semibold text-[0.85rem] no-underline hover:shadow-[0_4px_20px_rgba(34,197,94,0.3)] hover:scale-105 transition-all">
                <i className="fas fa-star"></i> Star IIUC-ARMS v2
              </a>
              <a href={`https://github.com/${config.owner}/QSIS-ACADEMIC-FILES-MANAFGER`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-yellow-500 text-white font-semibold text-[0.85rem] no-underline hover:shadow-[0_4px_20px_rgba(249,115,22,0.3)] hover:scale-105 transition-all">
                <i className="fas fa-star"></i> Star Academic Files
              </a>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ═══════════ FOUNDER CARD ═══════════ */
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
            <span className="text-[0.65rem] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
              <i className="fas fa-laptop-code mr-1"></i>{c.v2Contributions} Code
            </span>
            <span className="text-[0.65rem] text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full">
              <i className="fas fa-book-open mr-1"></i>{c.dataContributions} Data
            </span>
            <span className="text-[0.65rem] text-accent bg-accent/10 px-2 py-0.5 rounded-full">
              <i className="fas fa-code-merge mr-1"></i>{c.prCount} PRs
            </span>
            <span className="text-[0.65rem] font-bold text-dark-text bg-dark-bg3 px-2 py-0.5 rounded-full">
              <i className="fas fa-star mr-1 text-yellow-500"></i>{c.v2Contributions + c.dataContributions} Total
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════ RANKED CARD (Sectioned View) ═══════════ */
function RankedCard({ c, rank, settings }: { c: any; rank: number; settings: Settings }) {
  const rankColors: Record<number, string> = {
    1: 'bg-yellow-500 text-white',
    2: 'bg-gray-400 text-white',
    3: 'bg-orange-600 text-white',
  };

  const isFounder = c.role === 'Founder & Lead';
  const isDev = c.v2Contributions > 0;
  const isResource = c.dataContributions > 0;
  const isBoth = isDev && isResource;

  return (
    <div className={`flex items-center gap-4 p-4 rounded-xl border transition-all hover:border-qsis/40 hover:shadow-[0_2px_12px_rgba(34,197,94,0.1)] ${
      isFounder ? 'bg-gradient-to-br from-qsis/10 to-accent/10 border-qsis/30' :
      rank <= 3 ? 'bg-dark-bg2 border-qsis/20' : 'bg-dark-bg2 border-dark-border'
    }`}>
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
          {isFounder && (
            <span className="px-1.5 py-0.5 rounded-md bg-qsis/20 text-qsis text-[0.58rem] font-bold"><i className="fas fa-crown mr-0.5"></i>Founder</span>
          )}
          {isDev && (
            <span className="px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-400 text-[0.58rem] font-bold"><i className="fas fa-laptop-code mr-0.5"></i>Developer</span>
          )}
          {isResource && (
            <span className="px-1.5 py-0.5 rounded-md bg-orange-500/15 text-orange-400 text-[0.58rem] font-bold"><i className="fas fa-book-open mr-0.5"></i>Resource Provider</span>
          )}
          {c.profileComplete && (
            <span className="px-1.5 py-0.5 rounded-md bg-green-500/15 text-green-400 text-[0.58rem] font-bold"><i className="fas fa-check-circle mr-0.5"></i>Complete</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          <a href={c.html_url} target="_blank" rel="noopener noreferrer" className="text-[0.72rem] text-dark-text3 hover:text-qsis transition-colors no-underline">
            <i className="fab fa-github mr-1"></i>@{c.login}
          </a>
          {(c as any).departmentLabel && (
            <span className="text-[0.65rem] text-dark-text3">
              <i className="fas fa-building mr-1 text-teal-400"></i>{(c as any).departmentShortName || c.department}
            </span>
          )}
          {c.universityId && !c.hideUniversityId && (
            <span className="text-[0.65rem] text-dark-text3">
              <i className="fas fa-id-card mr-1 text-qsis"></i>{c.universityId}
            </span>
          )}
          {c.semester && !c.hideSemester && (
            <span className="text-[0.65rem] text-dark-text3">
              <i className="fas fa-graduation-cap mr-1 text-accent"></i>{c.semester === 'graduated' ? '🎓 Graduated' : config.semesters.find((s: any) => s.id === c.semester)?.label || c.semester}
            </span>
          )}
          {((c.publicEmail && !c.hideEmail) || (c.email && !c.hideEmail && !c.publicEmail)) && (
            <span className="text-[0.65rem] text-dark-text3">
              <i className="fas fa-envelope mr-1 text-blue-400"></i>{c.publicEmail || c.email}
            </span>
          )}
          {c.whatsapp && !c.hideWhatsapp && (
            <span className="text-[0.65rem] text-dark-text3">
              <i className="fab fa-whatsapp mr-1 text-green-400"></i>{c.whatsapp}
            </span>
          )}
          {c.company && !c.hideCompany && (
            <span className="text-[0.65rem] text-dark-text3">
              <i className="fas fa-briefcase mr-1 text-purple-400"></i>{c.companyUrl ? <a href={c.companyUrl} target="_blank" rel="noopener noreferrer" className="text-dark-text3 hover:text-qsis no-underline transition-colors">{c.company}</a> : c.company}
            </span>
          )}
        </div>
      </div>
      {settings.showStats && (
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-center">
            <div className="text-[0.85rem] font-bold text-blue-400">{c.v2Contributions}</div>
            <div className="text-[0.58rem] text-dark-text3">Code</div>
          </div>
          <div className="text-center">
            <div className="text-[0.85rem] font-bold text-orange-400">{c.dataContributions}</div>
            <div className="text-[0.58rem] text-dark-text3">Data</div>
          </div>
          <div className="text-center">
            <div className="text-[0.85rem] font-bold text-accent">{c.prCount}</div>
            <div className="text-[0.58rem] text-dark-text3">PRs</div>
          </div>
          <div className="text-center border-l border-dark-border pl-3 ml-1">
            <div className="text-[0.85rem] font-bold text-yellow-500">{c.v2Contributions + c.dataContributions}</div>
            <div className="text-[0.58rem] text-dark-text3">Total</div>
          </div>
        </div>
      )}
      <a href={c.html_url} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-lg bg-dark-bg3 flex items-center justify-center text-dark-text2 hover:text-qsis hover:bg-qsis/10 transition-all flex-shrink-0">
        <i className="fab fa-github"></i>
      </a>
    </div>
  );
}

/* ═══════════ GRID CARD (Grid View) ═══════════ */
function GridCard({ c, settings }: { c: any; settings: Settings }) {
  const isDev = c.v2Contributions > 0;
  const isResource = c.dataContributions > 0;

  const infoItems: { icon: string; iconClass: string; text: string; color: string; link?: string }[] = [];
  if ((c as any).departmentShortName) {
    infoItems.push({ icon: '\uf1ad', iconClass: 'fas fa-building', text: (c as any).departmentShortName, color: 'text-teal-400' });
  }
  if (c.universityId && !c.hideUniversityId) {
    infoItems.push({ icon: '', iconClass: 'fas fa-id-card', text: c.universityId, color: 'text-qsis' });
  }
  if (c.semester && !c.hideSemester) {
    const semLabel = c.semester === 'graduated' ? 'Graduated' : config.semesters.find((s: any) => s.id === c.semester)?.label || c.semester;
    infoItems.push({ icon: '', iconClass: 'fas fa-graduation-cap', text: semLabel, color: 'text-accent' });
  }
  const displayEmail = c.publicEmail || c.email;
  if (displayEmail && !c.hideEmail) {
    infoItems.push({ icon: '', iconClass: 'fas fa-envelope', text: displayEmail, color: 'text-blue-400' });
  }
  if (c.whatsapp && !c.hideWhatsapp) {
    infoItems.push({ icon: '', iconClass: 'fab fa-whatsapp', text: c.whatsapp, color: 'text-green-400' });
  }
  if (c.company && !c.hideCompany) {
    infoItems.push({ icon: '', iconClass: 'fas fa-briefcase', text: c.company, color: 'text-purple-400', link: c.companyUrl || undefined });
  }

  return (
    <div className="bg-dark-bg2 border border-dark-border rounded-2xl overflow-hidden hover:border-qsis/50 hover:shadow-[0_4px_20px_rgba(34,197,94,0.12)] transition-all group flex flex-col">
      {/* Header */}
      <div className="relative px-4 pt-5 pb-3 text-center bg-gradient-to-b from-qsis/5 to-transparent">
        <div className="relative inline-block mb-2.5">
          <Image src={c.avatar_url} alt={c.login} width={64} height={64} className="w-16 h-16 rounded-full object-cover border-2 border-dark-border group-hover:border-qsis/50 transition-colors" />
          {isDev && isResource && (
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-qsis flex items-center justify-center" title="Developer & Resource Provider">
              <i className="fas fa-star text-white text-[0.45rem]"></i>
            </div>
          )}
        </div>
        <h4 className="text-[0.88rem] font-bold text-dark-text leading-tight truncate">{c.name || c.login}</h4>
        <a href={c.html_url} target="_blank" rel="noopener noreferrer" className="text-[0.7rem] text-dark-text3 hover:text-qsis transition-colors no-underline">
          @{c.login}
        </a>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-1">
          {isDev && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.62rem] font-semibold bg-blue-500/15 text-blue-400">
              <i className="fas fa-laptop-code text-[0.5rem]"></i>Dev
            </span>
          )}
          {isResource && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.62rem] font-semibold bg-orange-500/15 text-orange-400">
              <i className="fas fa-book-open text-[0.5rem]"></i>Resource
            </span>
          )}
          {c.profileComplete && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[0.58rem] font-medium bg-green-500/10 text-green-400">
              <i className="fas fa-check-circle text-[0.45rem]"></i>Complete
            </span>
          )}
        </div>
      </div>

      {/* Info list */}
      {infoItems.length > 0 && (
        <div className="px-4 pb-3 flex-1">
          <div className="space-y-1">
            {infoItems.map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-[0.65rem] text-dark-text3 min-w-0">
                <i className={`${item.iconClass} ${item.color} w-3.5 text-center flex-shrink-0 text-[0.6rem]`}></i>
                {item.link ? (
                  <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-dark-text3 hover:text-qsis truncate no-underline transition-colors">{item.text}</a>
                ) : (
                  <span className="truncate">{item.text}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats footer */}
      <div className="px-4 py-2.5 border-t border-dark-border bg-dark-bg3/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-[0.6rem] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
              <i className="fas fa-laptop-code mr-0.5"></i>{c.v2Contributions}
            </span>
            <span className="text-[0.6rem] text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded">
              <i className="fas fa-book-open mr-0.5"></i>{c.dataContributions}
            </span>
            <span className="text-[0.6rem] text-accent bg-accent/10 px-1.5 py-0.5 rounded">
              <i className="fas fa-code-merge mr-0.5"></i>{c.prCount}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[0.6rem] font-bold text-yellow-500">
              {c.v2Contributions + c.dataContributions}
            </span>
            <a href={c.html_url} target="_blank" rel="noopener noreferrer" className="w-6 h-6 rounded bg-dark-bg flex items-center justify-center text-dark-text3 hover:text-qsis hover:bg-qsis/10 transition-all" title="GitHub">
              <i className="fab fa-github text-[0.7rem]"></i>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
