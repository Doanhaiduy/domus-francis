"use client";
import useSWR from "swr";
import { swrFetcher } from "../api";
import type { ActivityReportDto, ReportKind } from "../types/activity-report";

export function useActivityReport(kind: ReportKind, year: number, quarter: number, enabled = true) {
  const key = enabled ? `/api/v1/reports/activity?kind=${kind}&year=${year}${kind === "quarter" ? `&quarter=${quarter}` : ""}` : null;
  const { data, error, isLoading } = useSWR<ActivityReportDto>(key, swrFetcher, { keepPreviousData: true, revalidateOnFocus: false });
  return { report: data, error, isLoading: isLoading && !data };
}
