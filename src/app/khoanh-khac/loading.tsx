import React from "react";

export default function KhoanhKhacLoading() {
  return (
    <div className="flex flex-col w-full gap-6 max-w-7xl mx-auto animate-pulse">
      {/* HEADER SKELETON */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-64 bg-gray-200 rounded-xl" />
          <div className="h-4 w-96 bg-gray-200 rounded-xl" />
        </div>
        <div className="h-10 w-36 bg-gray-200 rounded-xl" />
      </div>

      {/* KPI METRICS SKELETON */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-white rounded-3xl p-5 border border-purple-50 shadow-xs space-y-2">
            <div className="h-4 w-20 bg-gray-200 rounded" />
            <div className="h-7 w-14 bg-gray-200 rounded" />
          </div>
        ))}
      </div>

      {/* FEATURED BANNER SKELETON */}
      <div className="h-72 w-full bg-gray-200 rounded-3xl" />

      {/* FILTER TOOLBAR SKELETON */}
      <div className="h-16 bg-white rounded-3xl p-4 border border-purple-50 shadow-xs" />

      {/* ALBUM CARDS GRID SKELETON */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-80 bg-white rounded-3xl overflow-hidden border border-purple-50 shadow-xs flex flex-col">
            <div className="h-48 bg-gray-200" />
            <div className="p-4 space-y-2">
              <div className="h-5 w-3/4 bg-gray-200 rounded" />
              <div className="h-3 w-1/2 bg-gray-200 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
