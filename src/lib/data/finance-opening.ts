"use client";
// Hook dữ liệu + thao tác Số dư quỹ khởi đầu (SWR)
import useSWR from "swr";
import { api, swrFetcher } from "../api";
import { FINANCE_KEY, refreshFinance } from "./finance";
import type { OpeningBalanceDto } from "../types/finance-opening";

export const OPENING_KEY = `${FINANCE_KEY}/opening-balance`;

/** Số dư từng túi quỹ + trạng thái nhập số dư đầu kỳ. `enabled` = người xem có quyền xem sổ quỹ. */
export function useOpeningBalances(enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<OpeningBalanceDto>(enabled ? OPENING_KEY : null, swrFetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  return { data, error, isLoading: isLoading && !data, mutate };
}

export interface OpeningBalancePayload {
  fundId: string;
  amountVnd: number;
  entryDate: string;
  note?: string | null;
  clientRequestId?: string;
}

export const openingBalanceApi = {
  post: async (b: OpeningBalancePayload) => {
    const r = await api.post<{ id: string }>(OPENING_KEY, b);
    await refreshFinance(); // tồn quỹ, biểu đồ, số dư từng túi quỹ đổi theo
    return r;
  },
};
