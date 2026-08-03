'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { config } from '@/lib/config';
import { FACULTIES } from '@/lib/departments';
import CustomSelect from '@/components/CustomSelect';
import { Settings, DEFAULT_SETTINGS } from './types';
import FounderCard from './FounderCard';
import RankedCard from './RankedCard';
import GridCard from './GridCard';

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
