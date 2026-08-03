'use client';

import { config } from '@/lib/config';

interface CategoriesViewProps {
  currentMidFinal: string | null;
  goBack: () => void;
  filteredCategories: any[];
  navigateToMidFinal: (mf: string) => void;
  navigateToCategory: (cat: string) => void;
}

export default function CategoriesView({
  currentMidFinal, goBack, filteredCategories, navigateToMidFinal, navigateToCategory,
}: CategoriesViewProps) {
  return (
    <section className="mb-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[1.05rem] font-semibold flex items-center gap-2">
          <i className="fas fa-folder-open"></i> {currentMidFinal || 'Folders'}
        </h3>
        <button className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold" onClick={goBack}>
          <i className="fas fa-arrow-left"></i> Back
        </button>
      </div>

      {filteredCategories.length === 0 && (
        <div className="text-center py-8 text-dark-text2">
          <i className="fas fa-folder-open text-3xl mb-3 block opacity-40"></i>
          <p>No folders found.</p>
        </div>
      )}

      {filteredCategories.some(c => c.key === '_mid' || c.key === '_final') && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
          {filteredCategories.filter(c => c.key === '_mid' || c.key === '_final').map(cat => {
            if (cat.key === '_mid') {
              return (
                <div key={cat.key} className="flex items-center gap-3.5 p-[14px_18px] bg-dark-bg2 border border-dark-border rounded-xl cursor-pointer hover:border-yellow-400/50 hover:bg-yellow-400/5 hover:shadow-[0_0_16px_rgba(250,204,21,.15)] hover:translate-x-1 transition-all" onClick={() => navigateToMidFinal('Mid')}>
                  <div className="text-[1.5rem] text-yellow-400"><i className="fas fa-pen-fancy"></i></div>
                  <div className="text-[0.95rem] font-semibold">Mid</div>
                  <div className="flex items-center gap-2 ml-auto">
                    {(cat as any).hasLinks && <span className="text-[0.7rem] px-1.5 py-[2px] rounded bg-pink-500/15 text-pink-400"><i className="fas fa-link mr-1"></i>Links</span>}
                    {(cat as any).hasMd && !(cat as any).hasLinks && <span className="text-[0.7rem] px-1.5 py-[2px] rounded bg-blue-500/15 text-blue-400"><i className="fas fa-file-alt mr-1"></i>.md</span>}
                    <div className="text-[0.75rem] text-dark-text2">{cat.count} files</div>
                  </div>
                </div>
              );
            }
            return (
              <div key={cat.key} className="flex items-center gap-3.5 p-[14px_18px] bg-dark-bg2 border border-dark-border rounded-xl cursor-pointer hover:border-green-400/50 hover:bg-green-400/5 hover:shadow-[0_0_16px_rgba(34,197,94,.15)] hover:translate-x-1 transition-all" onClick={() => navigateToMidFinal('Final')}>
                <div className="text-[1.5rem] text-green-400"><i className="fas fa-graduation-cap"></i></div>
                <div className="text-[0.95rem] font-semibold">Final</div>
                <div className="flex items-center gap-2 ml-auto">
                  {(cat as any).hasLinks && <span className="text-[0.7rem] px-1.5 py-[2px] rounded bg-pink-500/15 text-pink-400"><i className="fas fa-link mr-1"></i>Links</span>}
                  {(cat as any).hasMd && !(cat as any).hasLinks && <span className="text-[0.7rem] px-1.5 py-[2px] rounded bg-blue-500/15 text-blue-400"><i className="fas fa-file-alt mr-1"></i>.md</span>}
                  <div className="text-[0.75rem] text-dark-text2">{cat.count} files</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {filteredCategories.filter(c => c.key !== '_mid' && c.key !== '_final').map(cat => {
          const catConfig = config.categories[cat.key as keyof typeof config.categories] || config.categories.other;
          return (
            <div key={cat.key} className="flex items-center gap-3.5 p-[14px_18px] bg-dark-bg2 border border-dark-border rounded-xl cursor-pointer hover:border-accent hover:shadow-[0_0_16px_rgba(16,185,129,.2)] hover:translate-x-1 transition-all" onClick={() => navigateToCategory(cat.key)}>
              <div className="text-[1.5rem]" style={{color: catConfig.color}}><i className={`fas ${catConfig.icon}`}></i></div>
              <div className="text-[0.95rem] font-semibold">{cat.label}</div>
              <div className="flex items-center gap-2 ml-auto">
                {(cat as any).hasLinks && <span className="text-[0.7rem] px-1.5 py-[2px] rounded bg-pink-500/15 text-pink-400"><i className="fas fa-link mr-1"></i>Links</span>}
                {(cat as any).hasMd && !(cat as any).hasLinks && <span className="text-[0.7rem] px-1.5 py-[2px] rounded bg-blue-500/15 text-blue-400"><i className="fas fa-file-alt mr-1"></i>.md</span>}
                <div className="text-[0.75rem] text-dark-text2">{cat.count} files</div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
