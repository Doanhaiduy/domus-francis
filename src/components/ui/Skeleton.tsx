"use client";

import React from "react";
import { cn } from "@/lib/utils";

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => {
  return <div className={cn("shimmer-box rounded-xl", className)} />;
};

export const StatCardSkeleton: React.FC = () => {
  return (
    <div className="bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <Skeleton className="w-10 h-10 rounded-2xl" />
        <Skeleton className="w-16 h-5 rounded-md" />
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="w-24 h-3.5" />
        <Skeleton className="w-36 h-7 rounded-lg" />
      </div>
      <div className="mt-4 pt-2.5 flex items-center justify-between border-t border-purple-50/50">
        <Skeleton className="w-28 h-3.5" />
        <Skeleton className="w-14 h-4 rounded-md" />
      </div>
    </div>
  );
};

export const TableRowSkeleton: React.FC = () => {
  return (
    <tr className="border-b border-gray-50">
      <td className="py-3 pl-1">
        <div className="flex items-center gap-2.5">
          <Skeleton className="w-8 h-8 rounded-full shrink-0" />
          <div className="space-y-1">
            <Skeleton className="w-24 h-3.5" />
            <Skeleton className="w-12 h-2.5" />
          </div>
        </div>
      </td>
      <td className="py-3">
        <Skeleton className="w-16 h-4" />
      </td>
      <td className="py-3">
        <Skeleton className="w-20 h-3.5" />
      </td>
      <td className="py-3 text-center">
        <Skeleton className="w-16 h-5 rounded-md mx-auto" />
      </td>
      <td className="py-3 text-right pr-1">
        <Skeleton className="w-16 h-7 rounded-xl ml-auto" />
      </td>
    </tr>
  );
};

export const MemberCardSkeleton: React.FC = () => {
  return (
    <div className="bg-white rounded-3xl p-4 border border-purple-50 shadow-xs flex flex-col justify-between space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="w-12 h-5 rounded-md" />
        <Skeleton className="w-16 h-5 rounded-md" />
      </div>
      <div className="flex items-center gap-3">
        <Skeleton className="w-11 h-11 rounded-2xl shrink-0" />
        <div className="space-y-1.5 flex-1">
          <Skeleton className="w-3/4 h-4" />
          <Skeleton className="w-1/2 h-3" />
        </div>
      </div>
      <div className="pt-3 border-t border-purple-50 flex items-center justify-between">
        <Skeleton className="w-20 h-3" />
        <Skeleton className="w-14 h-3.5" />
      </div>
    </div>
  );
};

export const ThreadCardSkeleton: React.FC = () => {
  return (
    <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="w-20 h-5 rounded-md" />
        <Skeleton className="w-16 h-3" />
      </div>
      <Skeleton className="w-4/5 h-5 rounded-lg" />
      <Skeleton className="w-full h-3.5" />
      <Skeleton className="w-2/3 h-3.5" />
      <div className="pt-3 border-t border-purple-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="w-6 h-6 rounded-full" />
          <Skeleton className="w-24 h-3" />
        </div>
        <Skeleton className="w-16 h-4 rounded-md" />
      </div>
    </div>
  );
};

export const FeedItemSkeleton: React.FC = () => {
  return (
    <div className="flex items-start gap-3">
      <Skeleton className="w-8 h-8 rounded-xl shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="w-full h-3.5" />
        <Skeleton className="w-20 h-2.5" />
      </div>
    </div>
  );
};

export const DashboardSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col w-full gap-6 animate-pulseSubtle">
      {/* Top Header Skeleton */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="w-36 h-8 rounded-xl" />
            <Skeleton className="w-28 h-6 rounded-full" />
          </div>
          <Skeleton className="w-64 h-4 rounded-lg" />
        </div>
        <Skeleton className="w-48 h-10 rounded-2xl hidden sm:block" />
      </div>

      {/* 3 Stat Cards Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>

      {/* 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Modules Grid (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-3">
          <div className="space-y-1">
            <Skeleton className="w-32 h-5 rounded-lg" />
            <Skeleton className="w-48 h-3.5 rounded-lg" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="p-4 rounded-2xl bg-white border border-purple-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-11 h-11 rounded-2xl" />
                  <div className="space-y-1.5">
                    <Skeleton className="w-24 h-4" />
                    <Skeleton className="w-32 h-3" />
                  </div>
                </div>
                <Skeleton className="w-4 h-4 rounded-full" />
              </div>
            ))}
          </div>

          <Skeleton className="w-full h-12 rounded-2xl mt-1" />
        </div>

        {/* Feed (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex flex-col gap-4">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <div className="space-y-1">
              <Skeleton className="w-28 h-5" />
              <Skeleton className="w-40 h-3" />
            </div>
            <Skeleton className="w-3 h-3 rounded-full" />
          </div>

          <div className="space-y-3.5">
            <FeedItemSkeleton />
            <FeedItemSkeleton />
            <FeedItemSkeleton />
            <FeedItemSkeleton />
          </div>

          <Skeleton className="w-full h-9 rounded-xl mt-2" />
        </div>
      </div>

      {/* Reminder Banner Skeleton */}
      <Skeleton className="w-full h-20 rounded-2xl" />
    </div>
  );
};
