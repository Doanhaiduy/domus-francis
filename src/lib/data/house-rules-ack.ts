"use client";
// Xác nhận "Tôi đã đọc Luật nhà phiên bản …" + danh sách ai đã / chưa xác nhận (người quản lý) — GET/POST /api/v1/house-rules/ack.
import useSWR, { mutate as globalMutate } from "swr";
import { api, swrFetcher } from "../api";
import type { HouseRulesAckDto } from "../types/house-rules-ack";
import { refreshMyToday } from "./me-today";

export const HOUSE_RULES_ACK_KEY = "/api/v1/house-rules/ack";

export function useHouseRulesAck(enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<HouseRulesAckDto>(enabled ? HOUSE_RULES_ACK_KEY : null, swrFetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
  return { ack: data, error, isLoading: isLoading && !data, mutate };
}

export const refreshHouseRulesAck = () => globalMutate(HOUSE_RULES_ACK_KEY);

export const houseRulesAckApi = {
  acknowledge: async (version: string) => {
    const r = await api.post<HouseRulesAckDto>(HOUSE_RULES_ACK_KEY, { version });
    await globalMutate(HOUSE_RULES_ACK_KEY, r, { revalidate: false });
    refreshMyToday(0);
    return r;
  },
  remind: () => api.post<{ reminded: number; pending: number }>(`${HOUSE_RULES_ACK_KEY}/remind`),
};
