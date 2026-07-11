/**
 * PageSkeleton — reusable loading skeleton for portal pages.
 * Renders a header bar + configurable rows of shimmer blocks.
 */
import { Skeleton } from '@/components/ui/skeleton';

interface PageSkeletonProps {
  /** Number of card/row skeletons to render in the body. Default 6. */
  rows?: number;
  /** Show a stats row of 4 KPI cards above the list. Default false. */
  showStats?: boolean;
}

export default function PageSkeleton({ rows = 6, showStats = false }: PageSkeletonProps) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden animate-pulse">
      {/* Header bar */}
      <div className="h-16 bg-white border-b border-slate-200 flex items-center px-6 gap-3 shrink-0">
        <Skeleton className="h-5 w-5 rounded-md" />
        <Skeleton className="h-5 w-32 rounded-md" />
        <Skeleton className="h-5 w-12 rounded-full ml-1" />
        <div className="flex-1" />
        <Skeleton className="h-8 w-24 rounded-lg" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-4">
        {/* Optional stats row */}
        {showStats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
                <Skeleton className="h-3 w-20 rounded" />
                <Skeleton className="h-7 w-12 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* Search / filter bar */}
        <div className="flex gap-2">
          <Skeleton className="h-9 flex-1 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>

        {/* List rows */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48 rounded" />
                <Skeleton className="h-3 w-32 rounded" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
