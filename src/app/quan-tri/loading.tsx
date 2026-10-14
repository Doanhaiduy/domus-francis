import React from "react";
import { Skeleton } from "@/components/ui/Skeleton";

export default function QuanTriLoading() {
  return (
    <div className="flex flex-col w-full gap-6">
      <div className="page-head">
        <div className="space-y-2">
          <Skeleton className="w-64 h-8 rounded-xl" />
          <Skeleton className="w-96 max-w-full h-4 rounded-lg" />
        </div>
      </div>
      <Skeleton className="w-full h-14 rounded-2xl" />
      <div className="space-y-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs space-y-4">
            <Skeleton className="w-48 h-6 rounded-lg" />
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
