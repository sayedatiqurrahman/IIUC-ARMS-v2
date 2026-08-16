'use client';

import Image from 'next/image';
import { config } from '@/lib/config';
import StatTip from './StatTip';

const CODE_TIP = 'Commits to the QSIS-ARMS-v2 source-code repo. Every commit you push there counts as 1, and every pull request you get merged into it also counts as 1.';
const DATA_TIP = 'Files you uploaded to the Academic Files data repo. Every file you upload is committed to that repo and counts as 1 (merged pull requests there count too).';
const PR_TIP = 'Pull requests you opened that got merged — counted across both the source-code repo and the data repo.';
const TOTAL_TIP = 'Code + Data added together. (Pull requests are already counted inside Code and Data.)';

export default function FounderCard({ c, onShowHistory }: { c: any; onShowHistory?: (c: any) => void }) {
  return (
    <div className="bg-gradient-to-br from-qsis/10 to-accent/10 border-2 border-qsis/40 rounded-2xl p-4 sm:p-5 mb-5 ring-1 ring-qsis/20">
      {/* Mobile: vertical centered layout */}
      <div className="sm:hidden text-center">
        <div className="relative inline-block mb-3 group/avatar">
          <Image src={c.avatar_url} alt={c.login} width={72} height={72} className="w-[72px] h-[72px] rounded-full border-[3px] border-qsis shadow-[0_0_24px_rgba(34,197,94,0.4)] object-cover" />
          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-qsis flex items-center justify-center shadow-lg ring-2 ring-dark-bg2 cursor-help" title="Founder & Lead">
            <i className="fas fa-crown text-white text-[0.6rem]"></i>
          </div>
          <span className="pointer-events-none absolute bottom-8 right-0 z-50 w-60 rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-left opacity-0 translate-y-1 transition-all duration-150 group-hover/avatar:opacity-100 group-hover/avatar:translate-y-0 shadow-xl">
            <span className="block text-[0.7rem] font-bold text-qsis mb-0.5">
              <i className="fas fa-crown mr-1"></i>Founder
            </span>
            <span className="block text-[0.65rem] leading-snug text-neutral-300">
              This crown marks the founder who created this platform. It isn't an earned badge —
              it belongs only to the founding account. Top contributors rise through the
              contributors leaderboard instead.
            </span>
          </span>
        </div>
        <h3 className="text-[1rem] font-bold text-dark-text">{c.name || c.login}</h3>
        <p className="text-[0.75rem] text-qsis font-medium mb-1">{config.founderName}</p>
        <a href={c.html_url} target="_blank" rel="noopener noreferrer" className="text-[0.7rem] text-dark-text2 hover:text-qsis transition-colors no-underline inline-block mb-2.5">
          <i className="fab fa-github mr-1"></i>@{c.login}
        </a>
        <div className="flex items-center justify-center mb-1">
          <button
            onClick={() => onShowHistory?.(c)}
            className="w-7 h-7 rounded-lg bg-dark-bg3 flex items-center justify-center text-dark-text2 hover:text-qsis hover:bg-qsis/10 transition-all"
            title="Contribution history"
            aria-label="Contribution history"
          >
            <i className="fas fa-circle-info text-[0.7rem]"></i>
          </button>
        </div>
        <div className="flex items-center justify-center gap-2 flex-wrap mb-1">
          <span className="px-2 py-0.5 rounded-full bg-qsis/25 text-qsis text-[0.6rem] font-bold ring-1 ring-qsis/40">
            <i className="fas fa-crown mr-1"></i>Founder & Lead
          </span>
        </div>
        <div className="flex items-center justify-center gap-2 bg-dark-bg3/50 rounded-xl px-3 py-2.5 mt-2">
          <StatTip size="sm" icon="fa-laptop-code" color="text-blue-400" value={c.v2Contributions} label="Code" tip={CODE_TIP} />
          <div className="w-px h-6 bg-dark-border"></div>
          <StatTip size="sm" icon="fa-book-open" color="text-orange-400" value={c.dataContributions} label="Data" tip={DATA_TIP} />
          <div className="w-px h-6 bg-dark-border"></div>
          <StatTip size="sm" icon="fa-code-merge" color="text-accent" value={c.prCount} label="PRs" tip={PR_TIP} />
          <div className="w-px h-6 bg-dark-border"></div>
          <StatTip size="sm" icon="fa-star" color="text-yellow-500" value={c.v2Contributions + c.dataContributions} label="Total" tip={TOTAL_TIP} />
        </div>
      </div>

      {/* Desktop: horizontal layout */}
      <div className="hidden sm:flex items-center gap-4">
        <div className="relative flex-shrink-0 group/avatar">
          <Image src={c.avatar_url} alt={c.login} width={80} height={80} className="w-20 h-20 rounded-full border-[3px] border-qsis shadow-[0_0_24px_rgba(34,197,94,0.4)] object-cover" />
          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-qsis flex items-center justify-center shadow-lg ring-2 ring-dark-bg2 cursor-help" title="Founder & Lead">
            <i className="fas fa-crown text-white text-[0.6rem]"></i>
          </div>
          <span className="pointer-events-none absolute bottom-8 right-0 z-50 w-60 rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-left opacity-0 translate-y-1 transition-all duration-150 group-hover/avatar:opacity-100 group-hover/avatar:translate-y-0 shadow-xl">
            <span className="block text-[0.7rem] font-bold text-qsis mb-0.5">
              <i className="fas fa-crown mr-1"></i>Founder
            </span>
            <span className="block text-[0.65rem] leading-snug text-neutral-300">
              This crown marks the founder who created this platform. It isn't an earned badge —
              it belongs only to the founding account. Top contributors rise through the
              contributors leaderboard instead.
            </span>
          </span>
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
            <button
              onClick={() => onShowHistory?.(c)}
              className="w-6 h-6 rounded-lg bg-dark-bg3 flex items-center justify-center text-dark-text3 hover:text-qsis hover:bg-qsis/10 transition-all"
              title="Contribution history"
              aria-label="Contribution history"
            >
              <i className="fas fa-circle-info text-[0.65rem]"></i>
            </button>
            <span className="text-[0.65rem] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full" title={CODE_TIP}>
              <i className="fas fa-laptop-code mr-1"></i>{c.v2Contributions} Code
            </span>
            <span className="text-[0.65rem] text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full" title={DATA_TIP}>
              <i className="fas fa-book-open mr-1"></i>{c.dataContributions} Data
            </span>
            <span className="text-[0.65rem] text-accent bg-accent/10 px-2 py-0.5 rounded-full" title={PR_TIP}>
              <i className="fas fa-code-merge mr-1"></i>{c.prCount} PRs
            </span>
            <span className="text-[0.65rem] font-bold text-dark-text bg-dark-bg3 px-2 py-0.5 rounded-full" title={TOTAL_TIP}>
              <i className="fas fa-star mr-1 text-yellow-500"></i>{c.v2Contributions + c.dataContributions} Total
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
