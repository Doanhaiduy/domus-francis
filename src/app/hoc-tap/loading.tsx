import React from "react";

export default function HocTapLoading() {
  return (
    <div className="flex flex-col w-full gap-6 max-w-7xl mx-auto animate-pulse pb-16">
      {/* Header skeleton */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="w-48 h-4 bg-purple-100 rounded-lg" />
          <div className="w-72 h-8 bg-gray-200 rounded-2xl" />
          <div className="w-96 h-3 bg-gray-100 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <div className="w-28 h-10 bg-gray-100 rounded-xl" />
          <div className="w-36 h-10 bg-purple-200 rounded-xl" />
        </div>
      </div>

      {/* KPI Cards skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-3xl p-5 border border-purple-50 h-24" />
        ))}
      </div>

      {/* Filter toolbar skeleton */}
      <div className="bg-white rounded-3xl p-5 border border-purple-50 h-20" />

      {/* Content list skeleton */}
      <div className="bg-white rounded-3xl p-6 border border-purple-50 space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="w-full h-16 bg-gray-50 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
