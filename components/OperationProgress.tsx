'use client';

interface OperationProgressProps {
  label: string;
}

// Full-screen progress overlay shown while a long-running GitHub operation
// (delete / rename / move / copy / create course) is in flight. Renders nothing
// when `label` is empty, and disappears the moment the operation resolves.
export default function OperationProgress({ label }: OperationProgressProps) {
  if (!label) return null;
  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-[min(92vw,340px)] rounded-2xl border border-dark-border bg-dark-bg2 p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <i className="fas fa-spinner fa-spin text-qsis text-xl flex-shrink-0"></i>
          <div className="min-w-0">
            <p className="text-[0.9rem] font-semibold text-dark-text">{label}</p>
            <p className="text-[0.72rem] text-dark-text3">Please wait — this may take a moment.</p>
          </div>
        </div>
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-dark-bg3">
          <div className="progress-bar h-full rounded-full bg-gradient-to-r from-qsis to-accent" />
        </div>
      </div>
    </div>
  );
}
