import React from "react";
import { Skeleton, MemberCardSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col w-full gap-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="space-y-1.5">
          <Skeleton className="w-48 h-8 rounded-xl" />
          <Skeleton className="w-72 h-4 rounded-lg" />
        </div>
        <Skeleton className="w-36 h-9 rounded-xl" />
      </div>

      {/* 3 Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex justify-between items-center h-28">
            <div className="space-y-2">
              <Skeleton className="w-24 h-4" />
              <Skeleton className="w-32 h-6" />
            </div>
            <Skeleton className="w-10 h-10 rounded-2xl" />
          </div>
        ))}
      </div>

      {/* Member Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <MemberCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
