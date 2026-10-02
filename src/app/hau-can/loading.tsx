import React from "react";
import { Skeleton } from "@/components/ui/Skeleton";

export default function HauCanLoading() {
  return (
    <div className="flex flex-col w-full gap-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="w-48 h-4 rounded-md" />
          <Skeleton className="w-64 h-8 rounded-xl" />
          <Skeleton className="w-80 h-4 rounded-lg" />
        </div>
        <Skeleton className="w-36 h-10 rounded-xl" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-purple-50 pb-2">
        <Skeleton className="w-36 h-8 rounded-xl" />
        <Skeleton className="w-40 h-8 rounded-xl" />
        <Skeleton className="w-36 h-8 rounded-xl" />
      </div>

      {/* 2 Columns: Issue list & Issue detail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 bg-white rounded-3xl p-5 border border-purple-50 shadow-xs space-y-3">
          <Skeleton className="w-36 h-5 rounded-lg" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>

        <div className="lg:col-span-7 bg-white rounded-3xl p-6 border border-purple-50 shadow-xs space-y-4">
          <Skeleton className="w-48 h-6 rounded-lg" />
          <Skeleton className="w-full h-32 rounded-2xl" />
          <Skeleton className="w-full h-24 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
