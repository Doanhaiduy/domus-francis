import React from "react";
import { Skeleton } from "@/components/ui/Skeleton";

export default function PhungVuLoading() {
  return (
    <div className="flex flex-col w-full gap-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="w-72 h-8 rounded-xl" />
          <Skeleton className="w-80 h-4 rounded-lg" />
        </div>
        <Skeleton className="w-40 h-10 rounded-xl" />
      </div>

      {/* 3 Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="w-24 h-4 rounded" />
              <Skeleton className="w-32 h-8 rounded-lg" />
              <Skeleton className="w-40 h-3 rounded" />
            </div>
            <Skeleton className="w-12 h-12 rounded-2xl" />
          </div>
        ))}
      </div>

      {/* 2 Columns: Liturgy schedule & Prayer intentions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white rounded-3xl p-6 border border-purple-50 shadow-xs space-y-4">
          <Skeleton className="w-48 h-6 rounded-lg" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>

        <div className="lg:col-span-5 bg-white rounded-3xl p-6 border border-purple-50 shadow-xs space-y-4">
          <Skeleton className="w-40 h-6 rounded-lg" />
          <Skeleton className="h-28 rounded-2xl" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
