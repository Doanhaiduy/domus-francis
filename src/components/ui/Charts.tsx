"use client";

import React, { useState } from "react";
import { formatVND } from "@/lib/utils";
import { cn } from "@/lib/utils";

// =========================================================================
// 1. GROUPED BAR CHART: THU VS CHI (MONTHLY COMPARISON)
// =========================================================================
export interface BarChartDataPoint {
  label: string;
  thu: number;
  chi: number;
}

interface BarChartProps {
  data: BarChartDataPoint[];
  height?: number;
  title?: string;
  subtitle?: string;
}

export const FinancialBarChart: React.FC<BarChartProps> = ({
  data,
  height = 240,
  title,
  subtitle,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const maxVal = Math.max(...data.map((d) => Math.max(d.thu, d.chi)), 1000000);
  const chartHeight = height - 50;

  return (
    <div className="flex flex-col w-full gap-3">
      {(title || subtitle) && (
        <div className="flex items-center justify-between">
          <div>
            {title && <h3 className="text-sm font-bold text-gray-900">{title}</h3>}
            {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
          </div>

          <div className="flex items-center gap-3 text-xs font-semibold">
            <span className="flex items-center gap-1.5 text-emerald-700">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
              Thu quỹ
            </span>
            <span className="flex items-center gap-1.5 text-purple-700">
              <span className="w-2.5 h-2.5 rounded-sm bg-purple-600" />
              Chi tiêu
            </span>
          </div>
        </div>
      )}

      {/* SVG Bar Canvas */}
      <div className="relative w-full" style={{ height: `${height}px` }}>
        {/* Background Grid Lines */}
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-6">
          {[1, 0.75, 0.5, 0.25, 0].map((ratio) => (
            <div key={ratio} className="w-full flex items-center gap-2">
              <span className="text-[10px] text-gray-400 font-mono w-14 text-right shrink-0">
                {ratio === 0 ? "0đ" : `${(Math.round((maxVal * ratio) / 100000) / 10).toFixed(1)}Tr`}
              </span>
              <div className="w-full h-px bg-gray-100" />
            </div>
          ))}
        </div>

        {/* Bars Container */}
        <div className="absolute inset-0 pl-16 pr-4 pb-6 flex items-end justify-between gap-2 sm:gap-4">
          {data.map((d, idx) => {
            const thuHeight = (d.thu / maxVal) * chartHeight;
            const chiHeight = (d.chi / maxVal) * chartHeight;
            const isHovered = hoveredIdx === idx;

            return (
              <div
                key={d.label}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="flex-1 flex flex-col items-center justify-end h-full relative cursor-pointer group"
              >
                {/* Hover Tooltip */}
                {isHovered && (
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-30 px-2.5 py-1.5 rounded-xl bg-gray-950 text-white text-[10px] font-medium shadow-xl pointer-events-none whitespace-nowrap animate-in fade-in duration-100 flex flex-col gap-0.5">
                    <span className="font-bold text-[#d1d5db]">{d.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400">Thu: {formatVND(d.thu)}</span>
                      <span>·</span>
                      <span className="text-[#d8b4fe]">Chi: {formatVND(d.chi)}</span>
                    </div>
                  </div>
                )}

                {/* Bars Pair */}
                <div className="w-full flex items-end justify-center gap-1 sm:gap-1.5 h-full">
                  {/* Thu Bar */}
                  <div
                    style={{ height: `${Math.max(thuHeight, 4)}px` }}
                    className={cn(
                      "w-1/2 max-w-[18px] rounded-t-md transition-all duration-300 bg-gradient-to-t from-emerald-600 to-emerald-400",
                      isHovered ? "opacity-100 scale-y-[1.02]" : "opacity-90"
                    )}
                  />
                  {/* Chi Bar */}
                  <div
                    style={{ height: `${Math.max(chiHeight, 4)}px` }}
                    className={cn(
                      "w-1/2 max-w-[18px] rounded-t-md transition-all duration-300 bg-gradient-to-t from-purple-700 to-purple-500",
                      isHovered ? "opacity-100 scale-y-[1.02]" : "opacity-90"
                    )}
                  />
                </div>

                {/* X-axis Label */}
                <span
                  className={cn(
                    "text-[10px] font-bold mt-2 truncate w-full text-center transition-colors",
                    isHovered ? "text-primary" : "text-gray-500"
                  )}
                >
                  {d.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// =========================================================================
// 2. DONUT PIE CHART: EXPENSE BREAKDOWN BY CATEGORY
// =========================================================================
export interface DonutDataPoint {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  data: DonutDataPoint[];
  size?: number;
  title?: string;
  subtitle?: string;
}

export const ExpenseDonutChart: React.FC<DonutChartProps> = ({
  data,
  size = 180,
  title,
  subtitle,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
  const radius = size * 0.38;
  const strokeWidth = size * 0.16;
  const circumference = 2 * Math.PI * radius;

  let currentOffset = 0;

  return (
    <div className="flex flex-col w-full gap-3">
      {(title || subtitle) && (
        <div>
          {title && <h3 className="text-sm font-bold text-gray-900">{title}</h3>}
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
        {/* SVG Donut Circle */}
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="transform -rotate-90">
            {/* Background Base Ring */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="transparent"
              stroke="#f3f4f6"
              strokeWidth={strokeWidth}
            />

            {/* Slices */}
            {data.map((slice, idx) => {
              const sliceRatio = slice.value / total;
              const strokeDasharray = `${sliceRatio * circumference} ${circumference}`;
              const strokeDashoffset = -currentOffset;
              currentOffset += sliceRatio * circumference;

              const isHovered = hoveredIdx === idx;

              return (
                <circle
                  key={slice.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="transparent"
                  stroke={slice.color}
                  strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  className="transition-all duration-200 cursor-pointer"
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
              );
            })}
          </svg>

          {/* Center Metric Text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-4">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              {hoveredIdx !== null ? data[hoveredIdx].label : "Tổng chi"}
            </span>
            <span className="text-xs font-black text-gray-900 mt-0.5">
              {hoveredIdx !== null
                ? formatVND(data[hoveredIdx].value)
                : formatVND(total)}
            </span>
            <span className="text-[9px] font-semibold text-primary">
              {hoveredIdx !== null
                ? `${Math.round((data[hoveredIdx].value / total) * 100)}%`
                : "100% ngân quỹ"}
            </span>
          </div>
        </div>

        {/* Legend List */}
        <div className="flex flex-col gap-2 flex-1 w-full min-w-0">
          {data.map((item, idx) => {
            const pct = Math.round((item.value / total) * 100);
            const isHovered = hoveredIdx === idx;

            return (
              <div
                key={item.label}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className={cn(
                  "flex items-center justify-between p-1.5 rounded-xl transition cursor-pointer text-xs",
                  isHovered ? "bg-purple-50" : "hover:bg-gray-50"
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="font-semibold text-gray-700 truncate">{item.label}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-gray-900 font-bold">{formatVND(item.value)}</span>
                  <span className="text-[10px] font-bold text-gray-400 w-8 text-right">
                    {pct}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// =========================================================================
// 3. CURVED AREA TREND CHART (FUND BALANCE & CASHFLOW OVER TIME)
// =========================================================================
export interface AreaDataPoint {
  label: string;
  value: number;
}

interface AreaTrendChartProps {
  data: AreaDataPoint[];
  height?: number;
  title?: string;
  subtitle?: string;
  color?: string;
}

export const AreaTrendChart: React.FC<AreaTrendChartProps> = ({
  data,
  height = 180,
  title,
  subtitle,
  color = "#5f3add",
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const values = data.map((d) => d.value);
  const minVal = Math.min(...values, 0);
  const maxVal = Math.max(...values, 1000000);
  const range = maxVal - minVal || 1;

  const width = 500;
  const paddingY = 20;
  const usableHeight = height - paddingY * 2;

  // Compute SVG Points
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - paddingY - ((d.value - minVal) / range) * usableHeight;
    return { x, y, ...d };
  });

  // Generate SVG Path
  const linePath = points.reduce((acc, pt, i, arr) => {
    if (i === 0) return `M ${pt.x},${pt.y}`;
    const prev = arr[i - 1];
    const cpX = (prev.x + pt.x) / 2;
    return `${acc} C ${cpX},${prev.y} ${cpX},${pt.y} ${pt.x},${pt.y}`;
  }, "");

  const areaPath = `${linePath} L ${width},${height} L 0,${height} Z`;

  return (
    <div className="flex flex-col w-full gap-2">
      {(title || subtitle) && (
        <div className="flex items-center justify-between">
          <div>
            {title && <h3 className="text-sm font-bold text-gray-900">{title}</h3>}
            {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
          </div>
          {hoveredIdx !== null ? (
            <div className="text-right">
              <span className="text-[10px] text-gray-400 font-bold block">
                {data[hoveredIdx].label}
              </span>
              <span className="text-sm font-black text-primary">
                {formatVND(data[hoveredIdx].value)}
              </span>
            </div>
          ) : (
            <span className="text-xs font-bold text-primary">
              Hiện tại: {formatVND(data[data.length - 1]?.value || 0)}
            </span>
          )}
        </div>
      )}

      <div className="relative w-full overflow-hidden" style={{ height: `${height}px` }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full overflow-visible"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="area-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={color} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Area Fill */}
          <path d={areaPath} fill="url(#area-gradient)" />

          {/* Line Stroke */}
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Points */}
          {points.map((pt, i) => (
            <circle
              key={pt.label}
              cx={pt.x}
              cy={pt.y}
              r={hoveredIdx === i ? 5 : 3.5}
              fill="#ffffff"
              stroke={color}
              strokeWidth="2"
              className="transition-all duration-150 cursor-pointer"
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          ))}
        </svg>

        {/* Labels below */}
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between text-[10px] font-bold text-gray-400 px-1 pointer-events-none">
          {data.map((d) => (
            <span key={d.label}>{d.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
};
