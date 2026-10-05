"use client";
// Hook dữ liệu + thao tác phân hệ Hậu cần & Trực nhật (SWR; mọi thao tác ghi xong thì làm mới các khóa liên quan)
import useSWR, { mutate as globalMutate } from "swr";
import { api, swrFetcher } from "../api";
import type {
  DutyAssignmentDto,
  DutyBoardDto,
  DutyWeekEntryDto,
  DutySummaryDto,
  DutySwapsDto,
  DutyWeekDto,
  IssueDto,
  IssuesDto,
  IssueStatus,
  IssueUrgency,
} from "../types/duty";

export const DUTY_KEY = "/api/v1/duty";
export const ISSUES_KEY = "/api/v1/issues";

const startsWith = (prefix: string) => (key: unknown) => typeof key === "string" && key.startsWith(prefix);

/** Làm mới mọi dữ liệu trực nhật (roster tuần, đơn đổi ca, tóm tắt Tổng quan). */
export const refreshDuty = () => globalMutate(startsWith(DUTY_KEY));
export const refreshIssues = () => Promise.all([globalMutate(startsWith(ISSUES_KEY)), globalMutate(`${DUTY_KEY}/summary`)]);

export function useDutyWeek(week: string | null, enabled = true) {
  const key = enabled ? `${DUTY_KEY}${week ? `?week=${week}` : ""}` : null;
  const { data, error, isLoading, mutate } = useSWR<DutyWeekDto>(key, swrFetcher, { keepPreviousData: true });
  return { week: data, error, isLoading, mutate };
}

/** Bảng trực vệ sinh sân nhà theo tuần (week = một ngày bất kỳ trong tuần; bỏ trống = tuần này). */
export function useDutyBoard(week: string | null, enabled = true) {
  const key = enabled ? `${DUTY_KEY}/weeks${week ? `?week=${week}` : ""}` : null;
  const { data, error, isLoading, mutate } = useSWR<DutyBoardDto>(key, swrFetcher, { keepPreviousData: true });
  return { board: data, error, isLoading, mutate };
}

export function useDutySummary(enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<DutySummaryDto>(enabled ? `${DUTY_KEY}/summary` : null, swrFetcher);
  return { summary: data, error, isLoading, mutate };
}

export function useDutySwaps(enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<DutySwapsDto>(enabled ? `${DUTY_KEY}/swaps` : null, swrFetcher);
  return { swaps: data, error, isLoading, mutate };
}

export function useIssues(enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<IssuesDto>(enabled ? ISSUES_KEY : null, swrFetcher, { keepPreviousData: true });
  return { issues: data?.issues ?? [], categories: data?.categories ?? [], areas: data?.areas ?? [], loaded: !!data, error, isLoading, mutate };
}

export interface ZaloPostResultDto {
  sent: boolean;
  reason?: string;
}

export const dutyWeeksApi = {
  save: (body: { weekStart: string; memberIds: string[]; note?: string | null; notifyZalo?: boolean }) =>
    api.post<{ entry: DutyWeekEntryDto; zalo: ZaloPostResultDto | null }>(`${DUTY_KEY}/weeks`, body),
  remove: (id: string) => api.del(`${DUTY_KEY}/weeks/${id}`),
  remind: (id: string) => api.post<{ reminded: number }>(`${DUTY_KEY}/weeks/${id}/remind`),
  review: (id: string, body: { score: number; comment?: string | null; redo: boolean; redoNote?: string | null }) =>
    api.post<DutyWeekEntryDto>(`${DUTY_KEY}/weeks/${id}/review`, body),
  sendZalo: (id: string) => api.post<ZaloPostResultDto>(`${DUTY_KEY}/weeks/${id}/zalo`),
};

export const dutyApi = {
  createRoster: (weekStart: string, copyFromWeek?: string | null, notes?: string | null) =>
    api.post<{ rosterId: string; copied: number; skipped: string[] }>(`${DUTY_KEY}/rosters`, { weekStart, copyFromWeek: copyFromWeek ?? null, notes: notes ?? null }),
  publishRoster: (rosterId: string) => api.post<{ ok: true; count: number }>(`${DUTY_KEY}/rosters/${rosterId}/publish`),
  deleteRoster: (rosterId: string) => api.del(`${DUTY_KEY}/rosters/${rosterId}`),
  createAssignment: (body: { date: string; areaId: string; shiftId: string; roomCode?: string | null; memberIds: string[]; overrideReason?: string | null }) =>
    api.post<DutyAssignmentDto>(`${DUTY_KEY}/assignments`, body),
  updateAssignment: (
    id: string,
    body: { memberIds?: string[]; roomCode?: string | null; overrideReason?: string | null; date?: string; areaId?: string; shiftId?: string }
  ) => api.patch<DutyAssignmentDto>(`${DUTY_KEY}/assignments/${id}`, body),
  cancelAssignment: (id: string, reason?: string) =>
    api.del<{ ok: true; result: string }>(`${DUTY_KEY}/assignments/${id}${reason ? `?reason=${encodeURIComponent(reason)}` : ""}`),
  checkIn: (id: string, body: { fileId: string; doneItemIds: string[]; note?: string | null; clientCapturedAt?: string | null }) =>
    api.post<DutyAssignmentDto>(`${DUTY_KEY}/assignments/${id}/checkin`, body),
  review: (id: string, body: { decision: "approved" | "rework"; score?: number | null; feedback?: string | null }) =>
    api.post<DutyAssignmentDto>(`${DUTY_KEY}/assignments/${id}/review`, body),
  requestSwap: (assignmentId: string, toMemberId: string, reason: string) =>
    api.post<{ id: string }>(`${DUTY_KEY}/swaps`, { assignmentId, toMemberId, reason }),
  respondSwap: (id: string, accept: boolean, note?: string | null) => api.post(`${DUTY_KEY}/swaps/${id}/respond`, { accept, note: note ?? null }),
  decideSwap: (id: string, approve: boolean, note?: string | null) => api.post(`${DUTY_KEY}/swaps/${id}/decide`, { approve, note: note ?? null }),
  cancelSwap: (id: string) => api.post(`${DUTY_KEY}/swaps/${id}/cancel`),
};

export const issuesApi = {
  create: (body: {
    title: string;
    description?: string | null;
    roomCode?: string | null;
    locationText?: string | null;
    urgency: IssueUrgency;
    categoryId?: string | null;
    photoFileId?: string | null;
  }) => api.post<{ id: string; code: string }>(ISSUES_KEY, body),
  update: (id: string, body: { status?: IssueStatus; reason?: string | null; urgency?: IssueUrgency; categoryId?: string | null }) =>
    api.patch<IssueDto>(`${ISSUES_KEY}/${id}`, body),
  assign: (id: string, memberId: string, note?: string | null) => api.post<IssueDto>(`${ISSUES_KEY}/${id}/assign`, { memberId, note: note ?? null }),
  addCost: (id: string, amount: number, description: string) => api.post<IssueDto>(`${ISSUES_KEY}/${id}/costs`, { amount, description }),
  deleteCost: (id: string, costId: string) => api.del<IssueDto>(`${ISSUES_KEY}/${id}/costs/${costId}`),
  verify: (id: string) => api.post<IssueDto>(`${ISSUES_KEY}/${id}/verify`),
  addPhoto: (id: string, fileId: string, purpose: "before_photo" | "after_photo") => api.post<IssueDto>(`${ISSUES_KEY}/${id}/photos`, { fileId, purpose }),
};
