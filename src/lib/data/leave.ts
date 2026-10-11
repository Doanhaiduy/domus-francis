"use client";
// Hook dữ liệu + thao tác đơn xin phép (SWR)
import useSWR, { mutate as globalMutate } from "swr";
import { api, swrFetcher } from "../api";
import type { LeaveAllDto, LeaveKind, LeaveListDto, LeaveStatus } from "../types/leave";

export const LEAVE_KEY = "/api/v1/leave";
const COUNT_KEY = `${LEAVE_KEY}/count`;

export function useLeave(enabled = true) {
  const { data, error, isLoading } = useSWR<LeaveListDto>(enabled ? LEAVE_KEY : null, swrFetcher, { keepPreviousData: true });
  return { data, error, isLoading: isLoading && !data };
}

export interface LeaveAllQuery {
  status?: LeaveStatus | "";
  kind?: LeaveKind | "";
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
}

/** Tab "Tất cả đơn": toàn bộ đơn (mọi trạng thái, mọi thời gian) cho người có quyền duyệt; lọc + phân trang. */
export function useLeaveAll(query: LeaveAllQuery, enabled = true) {
  const p = new URLSearchParams();
  if (query.status) p.set("status", query.status);
  if (query.kind) p.set("kind", query.kind);
  if (query.q?.trim()) p.set("q", query.q.trim());
  if (query.from) p.set("from", query.from);
  if (query.to) p.set("to", query.to);
  p.set("limit", String(query.limit ?? 30));
  const { data, error, isLoading } = useSWR<LeaveAllDto>(enabled ? `${LEAVE_KEY}/all?${p}` : null, swrFetcher, { keepPreviousData: true });
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
  /** Người được nhờ để cửa (đơn về muộn / ngủ ngoài) */
  doorMemberId?: string | null;
  /** Gửi thông báo cho cả nhà: tin vào nhóm Zalo + thông báo trong ứng dụng (mặc định bật với đơn về muộn / ngủ ngoài) */
  notify?: boolean;
}

const refresh = () => globalMutate((k) => typeof k === "string" && k.startsWith(LEAVE_KEY));

export const leaveApi = {
  create: async (b: LeavePayload) => {
    const r = await api.post<{ id: string }>(LEAVE_KEY, b);
    await refresh();
    return r;
  },
  /** Xin thêm giờ cho đơn về muộn / ngủ ngoài của mình (báo lại vào nhóm Zalo). */
  extend: async (id: string, b: { newEndsAt: string; reason: string }) => {
    await api.post(`${LEAVE_KEY}/${id}/extend`, b);
    await refresh();
  },
  /** Sửa nội dung đơn: chính chủ khi còn chờ duyệt, hoặc Admin bất kỳ lúc nào. */
  update: async (id: string, b: LeavePayload) => {
    await api.patch(`${LEAVE_KEY}/${id}`, { action: "edit", ...b });
    await refresh();
  },
  act: async (id: string, action: "cancel" | "approve" | "reject", note?: string | null) => {
    await api.patch(`${LEAVE_KEY}/${id}`, { action, note: note ?? null });
    await refresh();
  },
};
