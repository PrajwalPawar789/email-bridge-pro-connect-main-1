import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type SummaryCardsSkeletonProps = {
  cards?: number;
  className?: string;
};

type ListSkeletonProps = {
  rows?: number;
  className?: string;
};

type TableSkeletonProps = {
  rows?: number;
  columns?: number;
  className?: string;
};

export const SummaryCardsSkeleton = ({
  cards = 4,
  className,
}: SummaryCardsSkeletonProps) => (
  <div className={cn("grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4", className)}>
    {Array.from({ length: cards }).map((_, index) => (
      <div
        key={`summary-card-skeleton-${index}`}
        className="rounded-xl border border-slate-200/80 bg-white/80 p-4"
      >
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-3 h-8 w-24" />
        <Skeleton className="mt-2 h-3 w-32" />
      </div>
    ))}
  </div>
);

export const ListSkeleton = ({ rows = 6, className }: ListSkeletonProps) => (
  <div className={cn("space-y-3", className)}>
    {Array.from({ length: rows }).map((_, index) => (
      <div key={`list-skeleton-${index}`} className="space-y-2 rounded-xl border border-slate-200/70 bg-white/70 p-4">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    ))}
  </div>
);

export const TableSkeleton = ({
  rows = 6,
  columns = 5,
  className,
}: TableSkeletonProps) => (
  <div className={cn("rounded-xl border border-slate-200/80 bg-white/80 p-4", className)}>
    <div className="space-y-3">
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={`table-head-skeleton-${index}`} className="h-4 w-full" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={`table-row-skeleton-${rowIndex}`}
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={`table-cell-skeleton-${rowIndex}-${colIndex}`} className="h-4 w-full" />
          ))}
        </div>
      ))}
    </div>
  </div>
);
