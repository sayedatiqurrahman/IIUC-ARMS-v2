'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { config } from '@/lib/config';
import CustomSelect from '@/components/CustomSelect';
import { Settings, DEFAULT_SETTINGS } from './types';
import FounderCard from './FounderCard';
import PageLoader from '@/components/PageLoader';
import RankedCard from './RankedCard';
import HistoryModal from './HistoryModal';
import ContributorDetailModal from './ContributorDetailModal';
import ContributorDetailListModal from './ContributorDetailListModal';

export default function ContributorsView() {
  const router = useRouter();
  const contributorsRaw = useAppStore(s => s.contributors);
  const contributors = Array.isArray(contributorsRaw) ? contributorsRaw : [];
  const contributorsLoading = useAppStore(s => s.contributorsLoading);
  const loadContributors = useAppStore(s => s.loadContributors);

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [activeTab, setActiveTab] = useState<'all' | 'developers' | 'resources' | 'designers'>('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [historyFor, setHistoryFor] = useState<any>(null);
  const [detailFor, setDetailFor] = useState<any>(null);

  useEffect(() => {
    if (contributors.length === 0 && !contributorsLoading) loadContributors();
  }, [contributors.length, contributorsLoading, loadContributors]);

  // Fetch admin settings
  useEffect(() => {
    fetch('/api/settings/contributors')
      .then(r => r.json())
      .then(d => {
        if (d && !d.error) {
          setSettings({ ...DEFAULT_SETTINGS, ...d });
        }
      })
      .catch(() => {});
  }, []);

  const founder = useMemo(() => contributors.find((c: any) => c.role === 'Founder & Lead'), [contributors]);

  // Simple repo-based categories — ALL contributors including founder
  // Developers = anyone who contributed to IIUC-ARMS-v2 (code repo)
  const developers = useMemo(() =>
    contributors.filter((c: any) => c.v2Contributions > 0),
    [contributors]
  );
  // Resources = anyone who contributed to IIUC-ACADEMIC-FILES-MANAFGER (data repo)
  const resources = useMemo(() =>
    contributors.filter((c: any) => c.dataContributions > 0),
    [contributors]
  );
  // Both = people in both lists
  const issueContributors = useMemo(() =>
    contributors.filter((c: any) => (c.issueContributions || 0) > 0),
    [contributors]
  );
  // Designers = anyone who published a Creative Hub design (themes repo)
  const designers = useMemo(() =>
    contributors.filter((c: any) => (c.designContributions || 0) > 0),
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

  // Tab-filtered lists with per-tab sorting
  const tabList = useMemo(() => {
    if (activeTab === 'developers') {
      return applyFilters(developers).sort((a: any, b: any) => b.v2Contributions - a.v2Contributions);
    }
    if (activeTab === 'resources') {
      return applyFilters(resources).sort((a: any, b: any) => b.dataContributions - a.dataContributions);
    }
    if (activeTab === 'designers') {
      return applyFilters(designers).sort((a: any, b: any) => (b.designContributions || 0) - (a.designContributions || 0));
    }
    // 'all' = merged, ranked by combined total (v2 + data + design)
    const devLogins = new Set(developers.map((c: any) => c.login));
    const merged = [...developers, ...resources.filter((c: any) => !devLogins.has(c.login))];
    const resLogins = new Set(merged.map((c: any) => c.login));
    const mergedAll = [...merged, ...designers.filter((c: any) => !resLogins.has(c.login))];
    return applyFilters(mergedAll).sort((a: any, b: any) => {
      return (b.v2Contributions + b.dataContributions + (b.designContributions || 0)) -
        (a.v2Contributions + a.dataContributions + (a.designContributions || 0));
    });
  }, [activeTab, developers, resources, designers, deptFilter, searchQuery]);

  return (
    <section className="mb-5 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold flex items-center gap-2"><i className="fas fa-users"></i> Contributors</h3>
        <button className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold" onClick={() => router.push('/')}>
          <i className="fas fa-arrow-left"></i> Back
        </button>
      </div>

      {contributorsLoading ? (
        <div className="loading-container">
          <PageLoader />
        </div>
      ) : contributors.length === 0 ? (
        <div className="text-center py-12 text-dark-text2">
          <i className="fas fa-users text-4xl mb-3 block opacity-30"></i>
          <p className="text-[0.9rem]">No contributors found.</p>
        </div>
      ) : (
        <div>
          {/* Founder */}
          {founder && <FounderCard c={founder} onShowHistory={setHistoryFor} />}

          {/* Stats Bar */}
          <div className="mb-5">
            {/* Total — hero stat */}
            <div className="bg-dark-bg2 border border-dark-border rounded-xl p-3 sm:p-4 mb-2 sm:mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-qsis/10 flex items-center justify-center">
                  <i className="fas fa-users text-qsis text-lg"></i>
                </div>
                <div>
                  <div className="text-[1.4rem] sm:text-[1.6rem] font-bold text-dark-text leading-none">{contributors.length}</div>
                  <div className="text-[0.72rem] text-dark-text2">Total Contributors</div>
                </div>
              </div>
              <div className="text-[0.65rem] text-dark-text3 hidden sm:flex items-center gap-3">
                <span><i className="fas fa-bug mr-1"></i>{issueContributors.length} issues</span>
                <span className="w-px h-3 bg-dark-border"></span>
                <span><i className="fas fa-laptop-code mr-1"></i>{developers.length} devs</span>
                <span className="w-px h-3 bg-dark-border"></span>
                <span><i className="fas fa-book-open mr-1"></i>{resources.length} resources</span>
                <span className="w-px h-3 bg-dark-border"></span>
                <span><i className="fas fa-palette mr-1"></i>{designers.length} designers</span>
              </div>
            </div>
            {/* Category breakdown — clickable chips */}
            <div className="grid grid-cols-4 gap-2">
              <button onClick={() => { setActiveTab('all'); setDetailFor({ title: 'Issue Contributors', list: issueContributors }); }} className="bg-dark-bg2 border border-rose-500/20 rounded-xl p-2 sm:p-3 text-center cursor-pointer hover:border-rose-500/40 hover:bg-rose-500/5 transition-all">
                <div className="text-[1rem] sm:text-[1.2rem] font-bold text-rose-400">{issueContributors.length}</div>
                <div className="text-[0.6rem] sm:text-[0.68rem] text-dark-text2 font-medium"><i className="fas fa-bug mr-0.5"></i>Issues</div>
              </button>
              <button onClick={() => { setActiveTab('developers'); setDetailFor({ title: 'Developers', list: developers }); }} className="bg-dark-bg2 border border-blue-500/20 rounded-xl p-2 sm:p-3 text-center cursor-pointer hover:border-blue-500/40 hover:bg-blue-500/5 transition-all">
                <div className="text-[1rem] sm:text-[1.2rem] font-bold text-blue-400">{developers.length}</div>
                <div className="text-[0.6rem] sm:text-[0.68rem] text-dark-text2 font-medium"><i className="fas fa-laptop-code mr-0.5"></i>Devs</div>
              </button>
              <button onClick={() => { setActiveTab('resources'); setDetailFor({ title: 'Resource Providers', list: resources }); }} className="bg-dark-bg2 border border-orange-500/20 rounded-xl p-2 sm:p-3 text-center cursor-pointer hover:border-orange-500/40 hover:bg-orange-500/5 transition-all">
                <div className="text-[1rem] sm:text-[1.2rem] font-bold text-orange-400">{resources.length}</div>
                <div className="text-[0.6rem] sm:text-[0.68rem] text-dark-text2 font-medium truncate"><i className="fas fa-book-open mr-0.5"></i>Resources</div>
              </button>
              <button onClick={() => { setActiveTab('designers'); setDetailFor({ title: 'Designers', list: designers }); }} className="bg-dark-bg2 border border-emerald-500/20 rounded-xl p-2 sm:p-3 text-center cursor-pointer hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all">
                <div className="text-[1rem] sm:text-[1.2rem] font-bold text-emerald-400">{designers.length}</div>
                <div className="text-[0.6rem] sm:text-[0.68rem] text-dark-text2 font-medium truncate"><i className="fas fa-palette mr-0.5"></i>Designers</div>
              </button>
            </div>
          </div>

          {/* Controls Row */}
          <div className="mb-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Sectioned Tabs — scrollable on mobile */}
              <div className="flex gap-1 p-1 bg-dark-bg2 border border-dark-border rounded-xl overflow-x-auto no-scrollbar">
                  <button
                    onClick={() => { setActiveTab('all'); setDeptFilter('all'); setSearchQuery(''); }}
                    className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[0.72rem] font-semibold cursor-pointer border-none transition-all whitespace-nowrap shrink-0 ${
                      activeTab === 'all' ? 'bg-purple-500/20 text-purple-400' : 'bg-transparent text-dark-text2 hover:text-dark-text'
                    }`}
                  >
                    <i className="fas fa-layer-group mr-1"></i>All
                    <span className="ml-1 text-[0.6rem] opacity-70">({contributors.length})</span>
                  </button>
                  {settings.sectionCount === 3 && (
                    <button
                      onClick={() => { setActiveTab('developers'); setDeptFilter('all'); setSearchQuery(''); }}
                      className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[0.72rem] font-semibold cursor-pointer border-none transition-all whitespace-nowrap shrink-0 ${
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
                      className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[0.72rem] font-semibold cursor-pointer border-none transition-all whitespace-nowrap shrink-0 ${
                        activeTab === 'resources' ? 'bg-orange-500/20 text-orange-400' : 'bg-transparent text-dark-text2 hover:text-dark-text'
                      }`}
                    >
                      <i className="fas fa-book-open mr-1"></i>Resources
                      <span className="ml-1 text-[0.6rem] opacity-70">({resources.length})</span>
                    </button>
                  )}
                  <button
                    onClick={() => { setActiveTab('designers'); setDeptFilter('all'); setSearchQuery(''); }}
                    className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[0.72rem] font-semibold cursor-pointer border-none transition-all whitespace-nowrap shrink-0 ${
                      activeTab === 'designers' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-transparent text-dark-text2 hover:text-dark-text'
                    }`}
                  >
                    <i className="fas fa-palette mr-1"></i>Designers
                    <span className="ml-1 text-[0.6rem] opacity-70">({designers.length})</span>
                  </button>
              </div>
            </div>

            {/* Search + Dept Filter */}
            <div className="flex gap-2 items-center">
              {settings.showSearch && (
                <div className="relative flex-1">
                  <i className="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-text3 text-[0.7rem]"></i>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search..."
                    className="w-full pl-8 pr-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.78rem] outline-none focus:border-qsis transition-colors"
                  />
                </div>
              )}
              {settings.showDeptFilter && (
                <div className="w-44 shrink-0">
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
                </div>
              )}
            </div>
          </div>

          {/* ═══ SECTIONED VIEW ═══ */}
          <div>
            {tabList.length === 0 ? (
              <div className="text-center py-6 text-dark-text2 text-[0.8rem]">No contributors found.</div>
            ) : (
              <div className="space-y-2">
                {tabList.map((c: any, idx: number) => (
                  <RankedCard key={c.id} c={c} rank={idx + 1} settings={settings} onShowHistory={setHistoryFor} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contribution history modal */}
      {historyFor && <HistoryModal c={historyFor} onClose={() => setHistoryFor(null)} />}
      {detailFor && (
        <ContributorDetailListModal
          title={detailFor.title}
          list={detailFor.list}
          onClose={() => setDetailFor(null)}
          onShowHistory={(c) => { setDetailFor(null); setHistoryFor(c); }}
        />
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
                  Upload academic documents — notes, sheets, previous questions, or syllabus — for your department, or publish a Creative Hub design (thesis / assignment cover) from the Studio. Every valid contribution earns you a spot on this page.
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
              <a href={`https://github.com/${config.owner}/${config.sourceRepo}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-qsis to-accent text-white font-semibold text-[0.85rem] no-underline hover:shadow-[0_4px_20px_rgba(34,197,94,0.3)] hover:scale-105 transition-all">
                <i className="fas fa-star"></i> Star IIUC-ARMS v2
              </a>
              <a href={`https://github.com/${config.owner}/${config.repo}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-yellow-500 text-white font-semibold text-[0.85rem] no-underline hover:shadow-[0_4px_20px_rgba(249,115,22,0.3)] hover:scale-105 transition-all">
                <i className="fas fa-star"></i> Star Academic Files
              </a>
              <a href={`https://github.com/${config.creativeHub.owner}/${config.creativeHub.repo}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold text-[0.85rem] no-underline hover:shadow-[0_4px_20px_rgba(16,185,129,0.3)] hover:scale-105 transition-all">
                <i className="fas fa-palette"></i> Star Creative Hub Themes
              </a>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
