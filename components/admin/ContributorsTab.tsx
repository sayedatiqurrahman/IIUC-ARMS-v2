'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ContributorItem, ContributorSettings } from './types';
import { DEFAULT_SETTINGS } from './constants';

export default function ContributorsTab() {
  const [contributors, setContributors] = useState<ContributorItem[]>([]);
  const [settings, setSettings] = useState<ContributorSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/contributors');
      if (res.ok) {
        const data = await res.json();
        setContributors(data.contributors || []);
        if (data.settings) setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (newSettings: ContributorSettings) => {
    setSettings(newSettings);
    setSaving(true);
    try {
      await fetch('/api/settings/contributors', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      });
    } catch {}
    setSaving(false);
  };

  const toggleHide = (login: string) => {
    const hidden = settings.hiddenLogins.includes(login)
      ? settings.hiddenLogins.filter(l => l !== login)
      : [...settings.hiddenLogins, login];
    save({ ...settings, hiddenLogins: hidden });
  };

  const showAll = () => save({ ...settings, hiddenLogins: [] });
  const hideAll = () => save({ ...settings, hiddenLogins: contributors.map(c => c.login) });

  const filtered = contributors.filter(c =>
    !filter || c.login.toLowerCase().includes(filter.toLowerCase()) || c.name.toLowerCase().includes(filter.toLowerCase())
  );

  const totalCommits = contributors.reduce((s, c) => s + c.v2Contributions + c.dataContributions, 0);
  const totalPRs = contributors.reduce((s, c) => s + c.prCount, 0);
  const visibleCount = contributors.filter(c => !settings.hiddenLogins.includes(c.login)).length;

  if (loading) {
    return (
      <div className="text-center py-10">
        <i className="fas fa-spinner fa-spin text-2xl text-qsis"></i>
        <p className="text-dark-text2 mt-2 text-sm">Loading contributors...</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-dark-text mb-3">
        <i className="fas fa-users text-teal-400 mr-2"></i>Contributors Management
      </h3>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-gradient-to-br from-teal-500/10 to-teal-500/5 border border-dark-border rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-dark-text">{contributors.length}</p>
          <p className="text-[0.65rem] text-dark-text3">Total</p>
        </div>
        <div className="bg-gradient-to-br from-green-500/10 to-green-500/5 border border-dark-border rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-green-400">{visibleCount}</p>
          <p className="text-[0.65rem] text-dark-text3">Visible</p>
        </div>
        <div className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border border-dark-border rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-blue-400">{totalCommits}</p>
          <p className="text-[0.65rem] text-dark-text3">Commits</p>
        </div>
        <div className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border border-dark-border rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-purple-400">{totalPRs}</p>
          <p className="text-[0.65rem] text-dark-text3">PRs</p>
        </div>
      </div>

      {/* Settings */}
      <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-[0.8rem] font-semibold text-dark-text">
            <i className="fas fa-cog text-qsis mr-1"></i>Display Settings {saving && <span className="text-dark-text3 text-[0.65rem] ml-1">(saving...)</span>}
          </h4>
          <div className="flex gap-2">
            <button onClick={showAll} className="text-[0.7rem] px-2 py-1 rounded bg-dark-bg3 text-green-400 hover:bg-green-500/20 cursor-pointer border-none">
              <i className="fas fa-eye mr-1"></i>Show All
            </button>
            <button onClick={hideAll} className="text-[0.7rem] px-2 py-1 rounded bg-dark-bg3 text-red-400 hover:bg-red-500/20 cursor-pointer border-none">
              <i className="fas fa-eye-slash mr-1"></i>Hide All
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Sort By */}
          <div>
            <label className="text-[0.65rem] text-dark-text3 block mb-1">Sort By</label>
            <select
              value={settings.sortBy}
              onChange={e => save({ ...settings, sortBy: e.target.value as any })}
              className="w-full px-2 py-1.5 text-[0.75rem] bg-dark-bg3 border border-dark-border rounded-lg text-dark-text cursor-pointer"
            >
              <option value="contributions">Total Contributions</option>
              <option value="commits">Commits</option>
              <option value="prs">Pull Requests</option>
              <option value="name">Name</option>
            </select>
          </div>

          {/* View Mode */}
          <div>
            <label className="text-[0.65rem] text-dark-text3 block mb-1">View Mode</label>
            <select
              value={settings.viewMode}
              onChange={e => save({ ...settings, viewMode: e.target.value as any })}
              className="w-full px-2 py-1.5 text-[0.75rem] bg-dark-bg3 border border-dark-border rounded-lg text-dark-text cursor-pointer"
            >
              <option value="sectioned">Sectioned (by role)</option>
              <option value="grid">Grid (all ranked together)</option>
            </select>
          </div>

          {/* Section Count (only when sectioned) */}
          {settings.viewMode === 'sectioned' && (
            <div>
              <label className="text-[0.65rem] text-dark-text3 block mb-1">Sections</label>
              <select
                value={settings.sectionCount}
                onChange={e => save({ ...settings, sectionCount: Number(e.target.value) as 2 | 3 })}
                className="w-full px-2 py-1.5 text-[0.75rem] bg-dark-bg3 border border-dark-border rounded-lg text-dark-text cursor-pointer"
              >
                <option value={3}>3 (Both + Dev + Resource)</option>
                <option value={2}>2 (Dev + Resource)</option>
              </select>
            </div>
          )}

          {/* Toggles */}
          {[
            { key: 'showRanks', label: 'Show Ranks', icon: 'fa-trophy' },
            { key: 'showStats', label: 'Show Stats', icon: 'fa-chart-bar' },
            { key: 'showDeptFilter', label: 'Dept Filter', icon: 'fa-filter' },
            { key: 'showSearch', label: 'Show Search', icon: 'fa-search' },
            { key: 'showOnlyCommitters', label: 'Only Committers', icon: 'fa-code-branch' },
            { key: 'allowUserToggle', label: 'User View Toggle', icon: 'fa-toggle-on' },
          ].map(t => (
            <label key={t.key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!settings[t.key as keyof ContributorSettings]}
                onChange={e => save({ ...settings, [t.key]: e.target.checked })}
                className="w-3.5 h-3.5 accent-qsis cursor-pointer"
              />
              <span className="text-[0.72rem] text-dark-text2">
                <i className={`fas ${t.icon} text-dark-text3 mr-1`}></i>{t.label}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search contributors..."
        value={filter}
        onChange={e => setFilter(e.target.value)}
        className="w-full px-3 py-2 text-[0.8rem] bg-dark-bg2 border border-dark-border rounded-xl text-dark-text mb-4 placeholder:text-dark-text3 focus:outline-none focus:border-qsis"
      />

      {/* Contributor List */}
      <div className="space-y-2">
        {filtered.map((c, i) => {
          const isHidden = settings.hiddenLogins.includes(c.login);
          return (
            <div key={c.login} className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${isHidden ? 'bg-red-500/5 border-red-500/20 opacity-50' : 'bg-dark-bg2 border-dark-border hover:border-dark-text3'}`}>
              {/* Rank */}
              {settings.showRanks && (
                <span className="text-[0.7rem] font-bold text-dark-text3 w-5 text-center">#{i + 1}</span>
              )}

              {/* Avatar */}
              <img src={c.avatar_url} alt={c.login} className="w-9 h-9 rounded-full" />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-[0.8rem] font-semibold text-dark-text truncate">
                  {c.name || c.login} {c.role === 'Founder & Lead' && <span className="text-qsis text-[0.65rem] ml-1">(Founder)</span>}
                </p>
                <p className="text-[0.65rem] text-dark-text3">@{c.login} · {c.roleType} · {c.source}</p>
              </div>

              {/* Stats */}
              {settings.showStats && (
                <div className="flex gap-3 text-[0.7rem]">
                  <span className="text-blue-400" title="Commits to the QSIS-ARMS-v2 source-code repo — every commit counts as 1, and each merged pull request adds 1 too."><i className="fas fa-code-branch mr-1"></i>{c.v2Contributions}</span>
                  <span className="text-green-400" title="Files uploaded to the Academic Files data repo — every file you upload counts as 1 (merged pull requests there count too)."><i className="fas fa-database mr-1"></i>{c.dataContributions}</span>
                  <span className="text-purple-400" title="Pull requests you opened that got merged — counted across both the source-code repo and the data repo."><i className="fas fa-code-merge mr-1"></i>{c.prCount}</span>
                  <span className="text-dark-text3" title="Total"><i className="fas fa-star mr-1"></i>{c.contributions}</span>
                </div>
              )}

              {/* Hide/Show Toggle */}
              <button
                onClick={() => toggleHide(c.login)}
                className={`px-2 py-1 rounded text-[0.7rem] cursor-pointer border-none transition-colors ${isHidden ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'}`}
                title={isHidden ? 'Show on contributors page' : 'Hide from contributors page'}
              >
                <i className={`fas ${isHidden ? 'fa-eye-slash' : 'fa-eye'}`}></i>
              </button>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-dark-text3 text-sm text-center py-8">No contributors found</p>
      )}
    </div>
  );
}
