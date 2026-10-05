"use client";
// Hook danh mục tỉnh/thành, xã/phường (qua /api/v1/geo — máy chủ gọi provinces.open-api.vn và đệm lại).
import useSWR from "swr";
import { swrFetcher } from "../api";
import type { GeoEdition, GeoListDto, GeoProvinceDto, GeoWardDto } from "../types/geo";

const OPTS = { revalidateOnFocus: false, revalidateIfStale: false, dedupingInterval: 3600_000, shouldRetryOnError: false } as const;

export function useProvinces(edition: GeoEdition = "2025", enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<GeoListDto<GeoProvinceDto>>(
    enabled ? `/api/v1/geo/provinces${edition === "legacy" ? "?edition=legacy" : ""}` : null,
    swrFetcher,
    OPTS,
  );
  return { provinces: data?.items ?? [], stale: !!data?.stale, error, isLoading, retry: () => mutate() };
}

export function useWards(provinceCode: number | null) {
  const { data, error, isLoading, mutate } = useSWR<GeoListDto<GeoWardDto>>(
    provinceCode ? `/api/v1/geo/provinces/${provinceCode}/wards` : null,
    swrFetcher,
    OPTS,
  );
  return { wards: data?.items ?? [], error, isLoading, retry: () => mutate() };
}
