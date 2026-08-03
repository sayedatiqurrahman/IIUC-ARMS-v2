'use client';

import type { FileWithMeta } from '@/components/upload/types';

interface MergeDialogProps {
  courseId: number;
  mergeImages: FileWithMeta[];
  mergeSession: string;
  mergeYear: string;
  mergeMerging: boolean;
  profileName: string;
  email: string;
  onMerge: (courseId: number) => void;
  onDismiss: () => void;
}

export default function MergeDialog({
  courseId,
  mergeImages,
  mergeSession,
  mergeYear,
  mergeMerging,
  profileName,
  email,
  onMerge,
  onDismiss,
}: MergeDialogProps) {
  if (mergeImages.length < 2) return null;

  const authorName = profileName || email.split('@')[0] || 'Unknown';

  return (
    <div className="mt-2 p-3 rounded-xl bg-blue-500/10 border border-blue-500/30">
      <div className="flex items-start gap-2 mb-2">
        <i className="fas fa-images text-blue-400 mt-0.5"></i>
        <div className="flex-1">
          <p className="text-[0.78rem] font-semibold text-blue-300">Merge {mergeImages.length} images into one PDF?</p>
          <p className="text-[0.68rem] text-dark-text3 mt-0.5">
            These images appear to be parts of the same question paper ({mergeSession} {mergeYear}).
          </p>
          <p className="text-[0.65rem] text-dark-text3 mt-0.5">
            Will be saved as: <span className="text-blue-300 font-semibold">{mergeSession} {mergeYear} - {authorName}.pdf</span>
          </p>
        </div>
      </div>
      <div className="flex gap-2 ml-5">
        <button
          className="px-3 py-1 rounded-lg bg-blue-500 text-white text-[0.72rem] font-semibold border-none cursor-pointer hover:bg-blue-600 transition-colors disabled:opacity-50"
          onClick={() => onMerge(courseId)}
          disabled={mergeMerging}
        >
          {mergeMerging ? <><i className="fas fa-spinner fa-spin mr-1"></i>Merging...</> : <><i className="fas fa-compress-alt mr-1"></i>Merge into PDF</>}
        </button>
        <button
          className="px-3 py-1 rounded-lg bg-dark-bg3 text-dark-text2 text-[0.72rem] font-semibold border border-dark-border cursor-pointer hover:bg-dark-bg2 transition-colors"
          onClick={onDismiss}
          disabled={mergeMerging}
        >
          Keep Separate
        </button>
      </div>
    </div>
  );
}
