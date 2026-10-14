"use client";
// Hook dữ liệu + thao tác Quỹ riêng của chuyến đi / sự kiện (SWR). Địa chỉ nằm dưới /api/v1/finance nên refreshFinance() cũng làm mới các màn hình này.
import useSWR from "swr";
import { api, swrFetcher } from "../api";
import { refreshFinance } from "./finance";
import type { EventFundDetailDto, EventFundListDto } from "../types/event-funds";
import type { PaymentMethod } from "../types/finance";

export const EVENT_FUNDS_KEY = "/api/v1/finance/event-funds";

export function useEventFunds(enabled = true) {
  const { data, error, isLoading } = useSWR<EventFundListDto>(enabled ? EVENT_FUNDS_KEY : null, swrFetcher, { keepPreviousData: true });
  return { data, error, isLoading: isLoading && !data };
}

export function useEventFund(id: string | null) {
  const { data, error, isLoading } = useSWR<EventFundDetailDto>(id ? `${EVENT_FUNDS_KEY}/${id}` : null, swrFetcher, { keepPreviousData: false });
  return { data, error, isLoading: isLoading && !data };
}

/** Một dòng danh sách tham gia gửi lên: thành viên (memberId) hoặc người ngoài (guestName); có id ⇒ sửa / gỡ dòng đó */
export interface ParticipantPayload {
  id?: string;
  memberId?: string;
  guestName?: string | null;
  guestPhone?: string | null;
  dueVnd?: number;
  note?: string | null;
  remove?: boolean;
}

export interface CreateEventFundPayload {
  eventId: string;
  name: string;
  managerIds: string[];
  defaultDueVnd: number;
  participants: ParticipantPayload[];
  description?: string | null;
}

export interface ReceiptPayload {
  participantId?: string | null;
  payerName?: string | null;
  amountVnd: number;
  method: PaymentMethod;
  paidOn: string;
  referenceCode?: string | null;
  note?: string | null;
  clientRequestId?: string;
}

export const eventFundsApi = {
  create: async (b: CreateEventFundPayload) => {
    const r = await api.post<{ fundId: string; code: string; name: string }>(EVENT_FUNDS_KEY, b);
    await refreshFinance();
    return r;
  },
  setParticipants: async (id: string, items: ParticipantPayload[], defaultDueVnd = 0) => {
    const r = await api.put<{ changed: number }>(`${EVENT_FUNDS_KEY}/${id}/participants`, { items, defaultDueVnd });
    await refreshFinance();
    return r;
  },
  setManagers: async (id: string, managerIds: string[]) => {
    await api.put(`${EVENT_FUNDS_KEY}/${id}/managers`, { managerIds });
    await refreshFinance();
  },
  receive: async (id: string, b: ReceiptPayload) => {
    const r = await api.post<{ id: string }>(`${EVENT_FUNDS_KEY}/${id}/receipts`, b);
    await refreshFinance();
    return r;
  },
  voidReceipt: async (id: string, receiptId: string, reason: string) => {
    await api.post(`${EVENT_FUNDS_KEY}/${id}/receipts/${receiptId}/void`, { reason });
    await refreshFinance();
  },
  close: async (id: string, b: { mode: "refund" | "to_house"; note?: string | null }) => {
    const r = await api.post<{ settlementId: string; mode: string; balanceVnd: number; lines: number }>(`${EVENT_FUNDS_KEY}/${id}/close`, b);
    await refreshFinance();
    return r;
  },
  subsidy: async (id: string, b: { amountVnd: number; reason: string }) => {
    await api.post(`${EVENT_FUNDS_KEY}/${id}/subsidy`, b);
    await refreshFinance();
  },
};
