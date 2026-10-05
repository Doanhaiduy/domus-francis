"use client";
// Hook dữ liệu + thao tác Lịch Phụng vụ trên trang Lịch sự kiện (SWR — tự làm mới sau mỗi thao tác ghi)
import useSWR, { mutate as globalMutate } from "swr";
import { api, swrFetcher } from "../api";
import type {
  CalendarDayDetailDto,
  CalendarMonthDto,
  LectionaryStatusDto,
  MassCheckinDto,
  MassReportDto,
  SpecialDayDto,
  SpecialDayInput,
  UpcomingFeastDto,
} from "../types/liturgy";

export const LITURGY_CAL_KEY = "/api/v1/liturgy/calendar";
const BASE = "/api/v1/liturgy";
const pad = (n: number) => String(n).padStart(2, "0");

/** Lịch phụng vụ của một tháng (month: 0–11). */
export function useLiturgyMonth(year: number, month: number) {
  const last = new Date(year, month + 1, 0).getDate();
  const key = `${LITURGY_CAL_KEY}?from=${year}-${pad(month + 1)}-01&to=${year}-${pad(month + 1)}-${pad(last)}`;
  const { data, error, isLoading } = useSWR<CalendarMonthDto>(key, swrFetcher, { keepPreviousData: true, revalidateOnFocus: false });
  return { month: data, error, isLoading: isLoading && !data };
}

/** Chi tiết một ngày (toàn văn Lời Chúa, ý lễ, check-in). */
export function useLiturgyDay(date: string | null) {
  const { data, error, isLoading, mutate } = useSWR<CalendarDayDetailDto>(date ? `${LITURGY_CAL_KEY}/${date}` : null, swrFetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });
  return { day: data && data.date === date ? data : undefined, stale: data, error, isLoading, mutate };
}

export function useUpcomingFeasts(days = 45) {
  const { data } = useSWR<UpcomingFeastDto[]>(`${BASE}/upcoming?days=${days}`, swrFetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 });
  return data ?? [];
}

export function useSpecialDays(enabled = true) {
  const { data, error, isLoading } = useSWR<{ items: SpecialDayDto[]; patron: CalendarMonthDto["patron"]; canManage: boolean }>(
    enabled ? `${BASE}/special-days` : null,
    swrFetcher
  );
  return { items: data?.items ?? [], patron: data?.patron ?? null, canManage: !!data?.canManage, error, isLoading };
}

export function useLectionaryStatus(enabled = true) {
  const { data, mutate } = useSWR<LectionaryStatusDto>(enabled ? `${BASE}/lectionary` : null, swrFetcher, { revalidateOnFocus: false });
  return { status: data, mutate };
}

export function useMassReport(from: string, to: string, enabled: boolean) {
  const { data, error, isLoading } = useSWR<MassReportDto>(enabled ? `${BASE}/report?from=${from}&to=${to}` : null, swrFetcher, {
    keepPreviousData: true,
  });
  return { report: data, error, isLoading: isLoading && !data };
}

/** Làm mới mọi dữ liệu lịch phụng vụ (lịch tháng, chi tiết ngày, sắp tới, ngày đặc biệt, báo cáo). */
export const refreshLiturgy = () => globalMutate((key) => typeof key === "string" && key.startsWith(BASE) && !key.startsWith(`${BASE}/documents`));

export const liturgyCalendarApi = {
  saveNote: (date: string, body: { intention: string | null; note: string | null; version?: number | null }) =>
    api.put<{ ok: true }>(`${LITURGY_CAL_KEY}/${date}/note`, body),
  createSpecial: (body: SpecialDayInput) => api.post<SpecialDayDto>(`${BASE}/special-days`, body),
  updateSpecial: (id: string, body: SpecialDayInput) => api.put<SpecialDayDto>(`${BASE}/special-days/${id}`, body),
  deleteSpecial: (id: string) => api.del<{ ok: true }>(`${BASE}/special-days/${id}`),
  checkin: (body: { date: string; church?: string | null; note?: string | null; evidenceFileId?: string | null }) =>
    api.post<MassCheckinDto>(`${BASE}/checkins`, body),
  cancelCheckin: (id: string) => api.del<{ ok: true }>(`${BASE}/checkins/${id}`),
  review: (id: string, status: "approved" | "rejected" | "submitted", note?: string | null) =>
    api.post<{ ok: true }>(`${BASE}/checkins/${id}/review`, { status, note: note ?? null }),
  importLectionary: () => api.post<{ ok: true; entries: number; withText: number }>(`${BASE}/lectionary`),
};
