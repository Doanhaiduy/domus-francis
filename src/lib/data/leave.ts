"use client";
// Hook dữ liệu + thao tác đơn xin phép (SWR)
import useSWR, { mutate as globalMutate } from "swr";
import { api, swrFetcher } from "../api";
import type { LeaveKind, LeaveListDto } from "../types/leave";

export const LEAVE_KEY = "/api/v1/leave";
const COUNT_KEY = `${LEAVE_KEY}/count`;

export function useLeave(enabled = true) {
  const { data, error, isLoading } = useSWR<LeaveListDto>(enabled ? LEAVE_KEY : null, swrFetcher, { keepPreviousData: true });
  return { data, error, isLoading: isLoading && !data };
}

/** Số đơn chờ duyệt cho huy hiệu thanh bên (0 nếu không có quyền duyệt). */
export function usePendingLeaveCount(enabled = true) {
  const { data } = useSWR<{ pending: number }>(enabled ? COUNT_KEY : null, swrFetcher, { refreshInterval: 180_000, revalidateOnFocus: true });
  return data?.pending ?? 0;
}

export interface LeavePayload {
  kind: LeaveKind;
  eventId?: string | null;
  startsAt: string;
  endsAt: string;
  reason: string;
  destination?: string | null;
  contactPhone?: string | null;
}

const refresh = () => globalMutate((k) => typeof k === "string" && k.startsWith(LEAVE_KEY));

export const leaveApi = {
  create: async (b: LeavePayload) => {
    const r = await api.post<{ id: string }>(LEAVE_KEY, b);
    await refresh();
    return r;
  },
  act: async (id: string, action: "cancel" | "approve" | "reject", note?: string | null) => {
    await api.patch(`${LEAVE_KEY}/${id}`, { action, note: note ?? null });
    await refresh();
  },
};
