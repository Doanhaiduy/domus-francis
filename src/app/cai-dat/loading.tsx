import React from "react";
import { Skeleton } from "@/components/ui/Skeleton";

export default function CaiDatLoading() {
  return (
    <div className="flex flex-col w-full gap-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="w-56 h-8 rounded-xl" />
          <Skeleton className="w-80 h-4 rounded-lg" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="w-32 h-10 rounded-xl" />
          <Skeleton className="w-36 h-10 rounded-xl" />
        </div>
      </div>

      {/* 3 Settings Sections */}
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-gray-100">
              <Skeleton className="w-48 h-6 rounded-lg" />
              <Skeleton className="w-20 h-5 rounded" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Skeleton className="h-12 rounded-xl" />
              <Skeleton className="h-12 rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
