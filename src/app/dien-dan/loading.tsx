import React from "react";
import { Skeleton, ThreadCardSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col w-full gap-6">
      <div className="flex justify-between items-center">
        <div className="space-y-1.5">
          <Skeleton className="w-36 h-8 rounded-xl" />
          <Skeleton className="w-64 h-4 rounded-lg" />
        </div>
        <Skeleton className="w-36 h-9 rounded-xl" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex justify-between items-center h-28">
            <div className="space-y-2">
              <Skeleton className="w-24 h-4" />
              <Skeleton className="w-28 h-6" />
            </div>
            <Skeleton className="w-10 h-10 rounded-2xl" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <ThreadCardSkeleton key={i} />
          ))}
        </div>

        <div className="lg:col-span-5 bg-white rounded-3xl p-6 border border-purple-50 shadow-xs space-y-4">
          <div className="flex justify-between pb-3 border-b border-gray-100">
            <Skeleton className="w-20 h-5" />
            <Skeleton className="w-16 h-4" />
          </div>
          <Skeleton className="w-4/5 h-6 rounded-lg" />
          <Skeleton className="w-full h-24 rounded-2xl" />
          <Skeleton className="w-full h-10 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
