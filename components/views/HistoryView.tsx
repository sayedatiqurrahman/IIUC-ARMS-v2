'use client';

import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { getMimeFromExt, getFileIconByType, timeAgo } from '@/lib/utils';

export default function HistoryView() {
  const router = useRouter();
  const recentReads = useAppStore(s => s.recentReads);
  const openRecentFile = useAppStore(s => s.openRecentFile);

  return (
    <section className="mb-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold flex items-center gap-2"><i className="fas fa-history"></i> Reading History</h3>
        <button className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold" onClick={() => router.push('/')}>
          <i className="fas fa-arrow-left"></i> Back
        </button>
      </div>
      {recentReads.length === 0 ? (
        <div className="text-center py-12 text-dark-text2">
          <i className="fas fa-clock text-4xl mb-3 block opacity-30"></i>
          <p className="text-[0.9rem]">No reading history yet.</p>
          <p className="text-[0.78rem] mt-1 opacity-60">Files you open will appear here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {recentReads.map((item: any) => {
            const name = item.path?.split('/').pop() || item.name || 'Unknown';
            const ext = name.split('.').pop()?.toLowerCase() || '';
            const mime = getMimeFromExt(ext);
            return (
              <div key={item.path} className="flex items-center gap-3 p-[14px_18px] bg-dark-bg2 border border-dark-border rounded-xl hover:border-qsis hover:shadow-[0_0_12px_rgba(34,197,94,0.15)] transition-all cursor-pointer" onClick={() => openRecentFile(item)}>
                <div className="text-[1.3rem] flex-shrink-0">{getFileIconByType(mime)}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[0.85rem] truncate">{name}</div>
                  <div className="text-[0.7rem] text-dark-text2 truncate">{item.path}</div>
                </div>
                <div className="text-[0.68rem] text-dark-text2 flex-shrink-0">{item.lastRead ? timeAgo(item.lastRead) : ''}</div>
                <button className="w-8 h-8 rounded-lg bg-qsis/10 text-qsis border-none cursor-pointer flex items-center justify-center text-[0.8rem] hover:bg-qsis/20 transition-all flex-shrink-0" onClick={(e) => { e.stopPropagation(); openRecentFile(item); }}>
                  <i className="fas fa-external-link-alt"></i>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}