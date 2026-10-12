"use client";
// Hook dữ liệu + thao tác phân hệ Hậu cần: trực vệ sinh sân nhà theo tuần + báo hỏng (SWR; mọi thao tác ghi xong thì làm mới các khóa liên quan)
import useSWR, { mutate as globalMutate } from "swr";
import { api, swrFetcher } from "../api";
import type {
  DutyBoardDto,
  DutyBulkResultDto,
  DutyHistoryDto,
  DutyPlanDto,
  DutyWeekEntryDto,
  IssueDto,
  IssuesDto,
  IssueStatus,
  IssueUrgency,
} from "../types/duty";

export const DUTY_KEY = "/api/v1/duty";
export const ISSUES_KEY = "/api/v1/issues";

const startsWith = (prefix: string) => (key: unknown) => typeof key === "string" && key.startsWith(prefix);

/** Làm mới mọi dữ liệu trực vệ sinh (bảng trực các tuần, tóm tắt Tổng quan). */
export const refreshDuty = () => globalMutate(startsWith(DUTY_KEY));
export const refreshIssues = () => Promise.all([globalMutate(startsWith(ISSUES_KEY)), globalMutate(`${DUTY_KEY}/summary`)]);

/** Bảng trực vệ sinh sân nhà theo tuần (week = một ngày bất kỳ trong tuần; bỏ trống = tuần này). */
export function useDutyBoard(week: string | null, enabled = true) {
  const key = enabled ? `${DUTY_KEY}/weeks${week ? `?week=${week}` : ""}` : null;
  const { data, error, isLoading, mutate } = useSWR<DutyBoardDto>(key, swrFetcher, { keepPreviousData: true });
  return { board: data, error, isLoading, mutate };
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
  sendZalo: (id: string) => api.post<ZaloPostResultDto & { text?: string }>(`${DUTY_KEY}/weeks/${id}/zalo`),
  /** Xem trước xếp lịch tự động `weeks` tuần từ tuần `from` (thứ tự công bằng); overwrite = thay cả tuần đã có người */
  plan: (from: string, weeks: number, overwrite: boolean) =>
    api.get<DutyPlanDto>(`${DUTY_KEY}/weeks/plan?from=${from}&weeks=${weeks}&overwrite=${overwrite ? 1 : 0}`),
  /** Lưu nhiều tuần trong MỘT thao tác (tuần đã có người bị bỏ qua trừ khi overwrite) */
  saveMany: (body: { weeks: { weekStart: string; memberIds: string[]; note?: string | null }[]; overwrite: boolean }) =>
    api.post<DutyBulkResultDto>(`${DUTY_KEY}/weeks/bulk`, body),
  /** Lịch trực + kết quả đánh giá theo khoảng ngày (xuất Excel) */
  history: (from: string, to: string) => api.get<DutyHistoryDto>(`${DUTY_KEY}/weeks/history?from=${from}&to=${to}`),
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
