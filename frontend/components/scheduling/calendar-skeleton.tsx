import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function CalendarSkeleton() {
  return (
    <div className="space-y-3 bg-card rounded-2xl border border-border/70 p-4 shadow-xs">
      {/* Top Toolbar Skeleton */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-16 rounded-lg" />
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-6 w-36 ml-2 rounded" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-60 rounded-xl" />
        </div>
      </div>

      {/* Week Header Skeleton */}
      <div className="grid grid-cols-7 gap-2 pt-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="text-center py-2 space-y-1">
            <Skeleton className="h-3 w-8 mx-auto" />
            <Skeleton className="h-5 w-5 mx-auto rounded-full" />
          </div>
        ))}
      </div>

      {/* Grid Content Skeleton */}
      <div className="grid grid-cols-7 gap-2 h-[480px]">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-border/50 p-2 space-y-2 bg-muted/10 flex flex-col justify-between"
          >
            <div className="space-y-2">
              <Skeleton className="h-10 w-full rounded-lg" />
              {i % 2 === 0 && <Skeleton className="h-12 w-full rounded-lg" />}
              {i % 3 === 0 && <Skeleton className="h-8 w-full rounded-lg" />}
            </div>
            <Skeleton className="h-4 w-12 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
