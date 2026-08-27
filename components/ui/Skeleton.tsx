export default function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`animate-pulse bg-dark-border/50 rounded-lg ${className}`} style={style} />;
}

export function SkeletonText({ lines = 1, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? 'w-3/4' : 'w-full'}`} />
      ))}
    </div>
  );
}

export function SkeletonAvatar({ size = 40, className = '' }: { size?: number; className?: string }) {
  return <Skeleton className={`rounded-full flex-shrink-0`} style={{ width: size, height: size }} />;
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-dark-bg2 border border-dark-border rounded-2xl p-5 space-y-3 ${className}`}>
      <div className="flex items-center gap-3">
        <SkeletonAvatar size={48} />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <SkeletonText lines={2} />
      <div className="flex gap-4 pt-1">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}

export function ClubCardSkeleton() {
  return (
    <div className="bg-dark-bg2 border border-dark-border rounded-2xl overflow-hidden">
      <Skeleton className="h-32 w-full rounded-none" />
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-3 -mt-10">
          <SkeletonAvatar size={56} className="border-4 border-dark-bg2" />
          <div className="flex-1 space-y-1.5 pt-6">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
        <SkeletonText lines={2} />
        <div className="flex items-center justify-between pt-2">
          <div className="flex gap-4">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-12" />
          </div>
          <div className="flex items-center gap-2">
            <SkeletonAvatar size={20} />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ClubDetailSkeleton() {
  return (
    <div className="min-h-screen bg-dark-bg">
      <Skeleton className="h-[200px] sm:h-[300px] lg:h-[380px] w-full rounded-none" />

      <div className="max-w-[1100px] mx-auto px-4">
        <div className="relative -mt-16 sm:-mt-20 flex flex-col sm:flex-row items-start sm:items-end gap-4 pb-4">
          <SkeletonAvatar size={120} className="border-4 border-dark-bg2" />
          <div className="flex-1 space-y-2 pt-2">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-3 w-40" />
            <div className="flex gap-6 pt-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24 rounded-lg" />
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
        </div>

        <div className="flex gap-1 border-b border-dark-border mb-6 overflow-x-auto">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-24 rounded-t-lg flex-shrink-0" />
          ))}
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          <div className="hidden lg:block w-[360px] space-y-4 flex-shrink-0">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <div className="flex-1 space-y-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      </div>
    </div>
  );
}

export function MemberListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-dark-bg border border-dark-border rounded-xl p-3 flex items-center gap-3">
          <SkeletonAvatar size={40} />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-2.5 w-1/4" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
          <div className="flex gap-1.5">
            <Skeleton className="h-6 w-6 rounded-lg" />
            <Skeleton className="h-6 w-6 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
