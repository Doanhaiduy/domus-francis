import React from "react";
import { Skeleton, StatCardSkeleton, TableRowSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col w-full gap-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="w-48 h-8 rounded-xl" />
          <Skeleton className="w-72 h-4 rounded-lg" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="w-28 h-9 rounded-xl" />
          <Skeleton className="w-32 h-9 rounded-xl" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-purple-50 pb-2">
        <Skeleton className="w-24 h-8 rounded-xl" />
        <Skeleton className="w-36 h-8 rounded-xl" />
        <Skeleton className="w-28 h-8 rounded-xl" />
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex flex-col justify-between h-36">
            <div className="flex justify-between items-center">
              <Skeleton className="w-24 h-4" />
              <Skeleton className="w-9 h-9 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Skeleton className="w-32 h-7 rounded-lg" />
              <Skeleton className="w-20 h-4" />
            </div>
          </div>
        ))}
      </div>

      {/* 2 Columns: Table & Recent Expenses */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex flex-col gap-4">
          <div className="flex justify-between items-center pb-2 border-b border-gray-100">
            <div className="space-y-1">
              <Skeleton className="w-36 h-5" />
              <Skeleton className="w-48 h-3.5" />
            </div>
            <Skeleton className="w-48 h-8 rounded-xl" />
          </div>

          <table className="w-full">
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRowSkeleton key={i} />
              ))}
            </tbody>
          </table>
        </div>

        <div className="lg:col-span-5 bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex flex-col gap-4">
          <div className="flex justify-between items-center pb-2 border-b border-gray-100">
            <Skeleton className="w-32 h-5" />
            <Skeleton className="w-16 h-4" />
          </div>

          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex justify-between items-center p-3 rounded-xl bg-surface-container-low/60">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-9 h-9 rounded-xl" />
                  <div className="space-y-1">
                    <Skeleton className="w-36 h-3.5" />
                    <Skeleton className="w-24 h-2.5" />
                  </div>
                </div>
                <Skeleton className="w-20 h-4 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
