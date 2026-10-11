"use client";
// Hook dữ liệu trang "Dung lượng" (SWR) — chỉ Admin (system.monitor)
import { useCallback, useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { api, swrFetcher } from "../api";
import type { ProvidersDto, StorageOverviewDto } from "../types/storage-monitor";

export const MONITOR_KEY = "/api/v1/system/storage";
export const MONITOR_PROVIDERS_KEY = `${MONITOR_KEY}/providers`;

/** Số liệu CSDL + tệp (nhanh). `days` = số ngày của biểu đồ theo ngày. */
export function useStorageOverview(days: number, enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<StorageOverviewDto>(enabled ? `${MONITOR_KEY}?days=${days}` : null, swrFetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });
  return { data, error, isLoading: isLoading && !data, mutate };
}

/** Số đo Supabase Storage + Cloudinary (chậm hơn, tải riêng; máy chủ nhớ 10 phút). `refresh()` đo lại ngay. */
export function useStorageProviders(enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<ProvidersDto>(enabled ? MONITOR_PROVIDERS_KEY : null, swrFetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const fresh = await api.get<ProvidersDto>(`${MONITOR_PROVIDERS_KEY}?refresh=1`);
      await mutate(fresh, { revalidate: false });
      return fresh;
    } finally {
      setRefreshing(false);
    }
  }, [mutate]);
  return { data, error, isLoading: isLoading && !data, refreshing, refresh };
}

export const refreshStorageOverview = () => globalMutate((k) => typeof k === "string" && k.startsWith(MONITOR_KEY) && !k.includes("/providers"));
