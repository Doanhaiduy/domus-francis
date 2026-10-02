import React from "react";
import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col w-full gap-6">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="w-56 h-3.5" />
        <Skeleton className="w-36 h-8 rounded-xl" />
        <Skeleton className="w-72 h-4 rounded-lg" />
      </div>

      {/* Hero & Meal Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <Skeleton className="lg:col-span-5 h-64 rounded-3xl" />
        <Skeleton className="lg:col-span-7 h-64 rounded-3xl" />
      </div>

      {/* Attendance Check-in Grid */}
      <div className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs space-y-4">
        <div className="flex justify-between items-center pb-3 border-b border-gray-100">
          <Skeleton className="w-48 h-5" />
          <Skeleton className="w-36 h-4" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="p-3.5 rounded-2xl bg-surface-container-low/60 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="space-y-1">
                  <Skeleton className="w-28 h-3.5" />
                  <Skeleton className="w-20 h-2.5" />
                </div>
              </div>
              <div className="flex gap-2">
                <Skeleton className="w-14 h-7 rounded-xl" />
                <Skeleton className="w-14 h-7 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
