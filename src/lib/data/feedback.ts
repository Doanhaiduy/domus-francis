"use client";
// Hook dữ liệu + thao tác góp ý về ứng dụng (SWR)
import useSWR, { mutate as globalMutate } from "swr";
import { api, swrFetcher } from "../api";
import type { FeedbackCategory, FeedbackListDto, FeedbackStatus } from "../types/feedback";

export const FEEDBACK_KEY = "/api/v1/feedback";

export function useFeedback(enabled = true) {
  const { data, error, isLoading } = useSWR<FeedbackListDto>(enabled ? FEEDBACK_KEY : null, swrFetcher, { keepPreviousData: true });
  return { data, error, isLoading: isLoading && !data };
}

export interface FeedbackPayload {
  category: FeedbackCategory;
  content: string;
  pagePath?: string | null;
  isAnonymous?: boolean;
  evidenceFileId?: string | null;
}

const refresh = () => globalMutate((k) => typeof k === "string" && k.startsWith(FEEDBACK_KEY));

export const feedbackApi = {
  create: async (b: FeedbackPayload) => {
    const r = await api.post<{ id: string }>(FEEDBACK_KEY, b);
    await refresh();
    return r;
  },
  /** Người quản lý: đổi trạng thái và/hoặc trả lời */
  update: async (id: string, b: { status?: FeedbackStatus; response?: string | null }) => {
    await api.patch(`${FEEDBACK_KEY}/${id}`, b);
    await refresh();
  },
  remove: async (id: string) => {
    await api.del(`${FEEDBACK_KEY}/${id}`);
    await refresh();
  },
};
