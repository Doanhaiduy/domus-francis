"use client";
// Hook dữ liệu + thao tác Điều chỉnh sổ quỹ (SWR)
import useSWR from "swr";
import { api, swrFetcher } from "../api";
import { FINANCE_KEY, refreshFinance } from "./finance";
import type { AdjustDirection, AdjustmentsDto } from "../types/finance-adjust";

export const ADJUST_KEY = `${FINANCE_KEY}/adjustments`;

/** Bút toán ghi tay gần đây (số dư đầu kỳ + điều chỉnh). `enabled` = người xem có quyền xem sổ quỹ. */
export function useManualEntries(enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<AdjustmentsDto>(enabled ? ADJUST_KEY : null, swrFetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  return { data, error, isLoading: isLoading && !data, mutate };
}

export interface AdjustmentPayload {
  fundId: string;
  direction: AdjustDirection;
  amountVnd: number;
  entryDate: string;
  reason: string;
  clientRequestId?: string;
}

export const adjustmentApi = {
  post: async (b: AdjustmentPayload) => {
    const r = await api.post<{ id: string }>(ADJUST_KEY, b);
    await refreshFinance(); // tồn quỹ, biểu đồ, số dư từng túi quỹ, lịch sử điều chỉnh đổi theo
    return r;
  },
};
