"use client";
// Hook dữ liệu Cài đặt → Hệ thống + dải cảnh báo vận hành (OpsBanner) — chỉ Admin (quyền system.monitor).
import useSWR, { mutate as globalMutate } from "swr";
import { api, swrFetcher } from "../api";
import type { ErrorEventDto, ErrorListDto, ErrorSource, ErrorStatus, JobRunDto, OpsSummaryDto, SystemStatusDto } from "../types/system";

export const SYSTEM_STATUS_KEY = "/api/v1/system/status";
export const OPS_SUMMARY_KEY = `${SYSTEM_STATUS_KEY}?summary=1`;
const JOB_RUNS_KEY = "/api/v1/system/job-runs";
const ERRORS_KEY = "/api/v1/system/errors";

/** Bản đầy đủ cho tab Hệ thống. */
export function useSystemStatus(enabled = true) {
  const { data, error, isLoading, isValidating, mutate } = useSWR<SystemStatusDto>(enabled ? SYSTEM_STATUS_KEY : null, swrFetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
    refreshInterval: 120_000,
  });
  return { data, error, isLoading: isLoading && !data, isValidating, mutate };
}

/** Bản tóm tắt nhẹ cho dải cảnh báo (5 phút làm mới một lần; không gọi khi `enabled` = false — người không có quyền). */
export function useOpsSummary(enabled: boolean) {
  const { data, error } = useSWR<OpsSummaryDto>(enabled ? OPS_SUMMARY_KEY : null, swrFetcher, {
    refreshInterval: 5 * 60_000,
    revalidateOnFocus: true,
    dedupingInterval: 60_000,
    shouldRetryOnError: false,
  });
  return { summary: data ?? null, error };
}

export function useJobRuns(kind: string, limit = 30, enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<{ items: JobRunDto[] }>(enabled ? `${JOB_RUNS_KEY}?kind=${encodeURIComponent(kind)}&limit=${limit}` : null, swrFetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });
  return { runs: data?.items ?? [], error, isLoading: isLoading && !data, mutate };
}

export interface ErrorFilter {
  status: ErrorStatus | "all";
  source: ErrorSource | "";
  q: string;
}

export function errorsKey(f: ErrorFilter, limit = 100) {
  const sp = new URLSearchParams({ status: f.status, limit: String(limit) });
  if (f.source) sp.set("source", f.source);
  if (f.q.trim()) sp.set("q", f.q.trim());
  return `${ERRORS_KEY}?${sp.toString()}`;
}

export function useErrorEvents(f: ErrorFilter, enabled = true) {
  const { data, error, isLoading, isValidating, mutate } = useSWR<ErrorListDto>(enabled ? errorsKey(f) : null, swrFetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });
  return { list: data ?? null, error, isLoading: isLoading && !data, isValidating, mutate };
}

/**
 * Chuyển tab của trang Cài đặt khi ĐANG ở /cai-dat (trang chỉ đọc ?tab= lúc mở nên liên kết cùng trang không đổi được tab).
 * Trang Cài đặt nghe sự kiện này; ở trang khác thì dùng liên kết thường /cai-dat?tab=<tab>.
 */
export const SETTINGS_TAB_EVENT = "luuxa:settings-tab";
export function openSettingsTab(tab: string) {
  if (typeof window === "undefined") return;
  if (window.location.pathname === "/cai-dat") {
    window.dispatchEvent(new CustomEvent(SETTINGS_TAB_EVENT, { detail: tab }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else window.location.assign(`/cai-dat?tab=${encodeURIComponent(tab)}`);
}

/** Làm mới mọi số liệu của tab Hệ thống + dải cảnh báo (sau khi đổi trạng thái lỗi). */
export const refreshSystem = () => globalMutate((k) => typeof k === "string" && (k.startsWith(SYSTEM_STATUS_KEY) || k.startsWith(ERRORS_KEY) || k.startsWith(JOB_RUNS_KEY)));

export const systemApi = {
  setErrorStatus: (id: string, status: ErrorStatus) => api.patch<ErrorEventDto>(`${ERRORS_KEY}/${id}`, { status }),
  setErrorsStatus: (ids: string[], status: ErrorStatus) => api.patch<{ updated: number; items: ErrorEventDto[] }>(ERRORS_KEY, { ids, status }),
};
