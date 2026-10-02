import React from "react";
import { Skeleton, StatCardSkeleton } from "@/components/ui/Skeleton";

export default function LichSuKienLoading() {
  return (
    <div className="flex flex-col w-full gap-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="w-48 h-4 rounded-md" />
          <Skeleton className="w-56 h-8 rounded-xl" />
          <Skeleton className="w-72 h-4 rounded-lg" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="w-32 h-10 rounded-xl" />
          <Skeleton className="w-36 h-10 rounded-xl" />
        </div>
      </div>

      {/* 2 Cols: Calendar & Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Calendar Grid Skeleton (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-4">
          <div className="flex justify-between items-center pb-2 border-b border-gray-100">
            <Skeleton className="w-36 h-6 rounded-lg" />
            <Skeleton className="w-20 h-6 rounded-lg" />
          </div>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 35 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        </div>

        {/* Day Details Skeleton (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-4">
          <Skeleton className="w-44 h-6 rounded-lg" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
