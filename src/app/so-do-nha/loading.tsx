import React from "react";
import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col w-full gap-6">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1.5">
          <Skeleton className="w-56 h-8 rounded-xl" />
          <Skeleton className="w-80 h-4 rounded-lg" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="w-32 h-10 rounded-xl" />
          <Skeleton className="w-36 h-10 rounded-xl" />
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex justify-between items-center h-28">
            <div className="space-y-2">
              <Skeleton className="w-20 h-4" />
              <Skeleton className="w-28 h-6" />
            </div>
            <Skeleton className="w-10 h-10 rounded-2xl" />
          </div>
        ))}
      </div>

      {/* Floor Filter Tabs */}
      <div className="flex items-center gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="w-28 h-10 rounded-xl" />
        ))}
      </div>

      {/* Room Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl p-5 border border-purple-50 shadow-xs space-y-4">
            <div className="flex justify-between items-start">
              <div className="space-y-1.5">
                <Skeleton className="w-28 h-5 rounded-lg" />
                <Skeleton className="w-20 h-3 rounded-md" />
              </div>
              <Skeleton className="w-16 h-6 rounded-full" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="w-8 h-8 rounded-full" />
              <Skeleton className="w-8 h-8 rounded-full" />
              <Skeleton className="w-20 h-4" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="w-16 h-5 rounded-md" />
              <Skeleton className="w-20 h-5 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
