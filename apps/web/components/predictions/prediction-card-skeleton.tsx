"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function PredictionCardSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-[#1f1f1f] bg-[#141414] px-4 py-3">
      <Skeleton className="h-10 w-10 shrink-0 rounded-full bg-[#2a2a2a]" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4 rounded bg-[#2a2a2a]" />
        <div className="flex gap-3">
          <Skeleton className="h-3 w-12 rounded bg-[#2a2a2a]" />
          <Skeleton className="h-3 w-16 rounded bg-[#2a2a2a]" />
        </div>
      </div>
    </div>
  );
}
