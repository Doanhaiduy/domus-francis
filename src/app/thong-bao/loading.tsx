import React from "react";
import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col w-full gap-6">
      <div className="flex justify-between items-center">
        <div className="space-y-1.5">
          <Skeleton className="w-36 h-8 rounded-xl" />
          <Skeleton className="w-64 h-4 rounded-lg" />
        </div>
        <Skeleton className="w-32 h-9 rounded-xl" />
      </div>

      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="w-24 h-7 rounded-xl" />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white rounded-3xl p-4 border border-purple-50 shadow-xs space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-3.5 rounded-2xl bg-surface-container-low/50 space-y-2">
              <div className="flex justify-between">
                <Skeleton className="w-16 h-4" />
                <Skeleton className="w-12 h-3" />
              </div>
              <Skeleton className="w-4/5 h-4" />
              <Skeleton className="w-full h-3" />
            </div>
          ))}
        </div>

        <div className="lg:col-span-7 bg-white rounded-3xl p-8 border border-purple-50 shadow-xs space-y-4">
          <div className="flex justify-between">
            <Skeleton className="w-20 h-5 rounded-md" />
            <Skeleton className="w-28 h-4" />
          </div>
          <Skeleton className="w-3/4 h-7 rounded-xl" />
          <Skeleton className="w-full h-16 rounded-2xl" />
          <div className="space-y-2 pt-4 border-t border-gray-100">
            <Skeleton className="w-full h-4" />
            <Skeleton className="w-full h-4" />
            <Skeleton className="w-4/5 h-4" />
            <Skeleton className="w-2/3 h-4" />
          </div>
        </div>
      </div>
    </div>
  );
}
