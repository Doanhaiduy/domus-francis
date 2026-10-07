"use client";
// Hook dữ liệu + thao tác Ủng hộ / quyên góp vào quỹ (SWR)
import useSWR, { mutate as globalMutate } from "swr";
import { api, swrFetcher } from "../api";
import type { DonationListDto, DonationMethod, DonationQuery } from "../types/donations";

export const DONATIONS_KEY = "/api/v1/donations";
// Sau khi ghi/xác nhận: làm mới danh sách ủng hộ + số liệu thu chi (tổng quan quỹ đổi theo)
const refresh = () => globalMutate((k) => typeof k === "string" && (k.startsWith(DONATIONS_KEY) || k.startsWith("/api/v1/finance")));

function listUrl(q: DonationQuery): string {
  const p = new URLSearchParams();
  if (q.mine) p.set("mine", "1");
  if (q.from) p.set("from", q.from);
  if (q.to) p.set("to", q.to);
  if (q.status) p.set("status", q.status);
  if (q.q?.trim()) p.set("q", q.q.trim());
  const s = p.toString();
  return `${DONATIONS_KEY}${s ? `?${s}` : ""}`;
}

export function useDonations(q: DonationQuery, enabled = true) {
  const { data, error, isLoading } = useSWR<DonationListDto>(enabled ? listUrl(q) : null, swrFetcher, { keepPreviousData: true });
  return { data, error, isLoading: isLoading && !data };
}

export interface DonationRecordPayload {
  donorMemberId?: string | null;
  donorName?: string | null;
  amountVnd: number;
  donatedOn: string;
  method: DonationMethod;
  fundId?: string | null;
  referenceCode?: string | null;
  note?: string | null;
  received: boolean;
  clientRequestId?: string;
}

export const donationsApi = {
  record: async (b: DonationRecordPayload) => {
    const r = await api.post<{ id: string }>(DONATIONS_KEY, b);
    await refresh();
    return r;
  },
  report: async (b: { amountVnd: number; donatedOn: string; method: DonationMethod; referenceCode?: string | null; note?: string | null }) => {
    const r = await api.post<{ id: string }>(`${DONATIONS_KEY}/report`, b);
    await refresh();
    return r;
  },
  act: async (id: string, action: "confirm" | "reject" | "cancel" | "withdraw", opts: { fundId?: string | null; note?: string | null } = {}) => {
    await api.patch(`${DONATIONS_KEY}/${id}`, { action, fundId: opts.fundId ?? null, note: opts.note ?? null });
    await refresh();
  },
};
