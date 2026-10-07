"use client";
import useSWR from "swr";
import { swrFetcher } from "../api";
import type { MemberReportDto, MemberReportKind, MemberReportScope } from "../types/member-report";

export interface MemberReportParams {
  kind: MemberReportKind;
  year: number;
  month: number;
  quarter: number;
  scope: MemberReportScope;
}

export function memberReportUrl(p: MemberReportParams): string {
  const extra = p.kind === "month" ? `&month=${p.month}` : p.kind === "quarter" ? `&quarter=${p.quarter}` : "";
  return `/api/v1/reports/members?kind=${p.kind}&year=${p.year}${extra}&scope=${p.scope}`;
}

export function useMemberReport(p: MemberReportParams, enabled = true) {
  const { data, error, isLoading } = useSWR<MemberReportDto>(enabled ? memberReportUrl(p) : null, swrFetcher, { keepPreviousData: true, revalidateOnFocus: false });
  return { report: data, error, isLoading: isLoading && !data };
}
