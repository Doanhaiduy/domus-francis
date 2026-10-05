"use client";
// Hook dữ liệu + thao tác phân hệ AI hỗ trợ. AI chỉ gợi ý; mọi chỗ dùng đều có đường làm thủ công khi AI tắt/lỗi.
import useSWR, { mutate as globalMutate } from "swr";
import { api, swrFetcher } from "../api";
import type { AiConsentPurpose, AiInputMap, AiResultDto, AiStatusDto, AiSuggestionDto, AiTaskCode, AiUsageDto } from "../types/ai";

export const AI_STATUS_KEY = "/api/v1/ai/status";
export const AI_USAGE_KEY = "/api/v1/ai/usage";

export function useAiStatus(enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<AiStatusDto>(enabled ? AI_STATUS_KEY : null, swrFetcher, {
    shouldRetryOnError: false,
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  });
  return { status: data, error, isLoading, mutate };
}

/** Trạng thái dùng được của một tác vụ + lý do (để hiện gợi ý "bật AI" cho người quản trị). */
export function useAiTask(code: AiTaskCode) {
  const { status, mutate } = useAiStatus();
  const task = status?.tasks.find((t) => t.code === code);
  const available = !!status?.available.includes(code);
  const reason = !status
    ? null
    : !status.canUse
    ? "Bạn chưa có quyền dùng AI."
    : !status.masterEnabled
    ? "Tính năng AI đang tắt."
    : !status.configured
    ? "Chưa cấu hình khóa API cho AI."
    : !task?.enabled
    ? "Tác vụ này đang tắt."
    : null;
  // Đúng mục đích đồng ý mà tác vụ yêu cầu (ai_processing, ai_academic_summary…); máy chủ cũ chưa trả `consents` ⇒ dùng `consented`.
  const consentPurpose = (task?.requiredConsent ?? null) as AiConsentPurpose | null;
  const hasConsent = !consentPurpose
    ? true
    : status?.consents && consentPurpose in status.consents
    ? !!status.consents[consentPurpose]
    : consentPurpose === "ai_processing" && !!status?.consented;
  const needsConsent = available && !hasConsent;
  return { status, task, available, reason, needsConsent, consentPurpose, refresh: mutate };
}

export function useAiUsage(enabled: boolean) {
  const { data, error, isLoading, mutate } = useSWR<AiUsageDto>(enabled ? AI_USAGE_KEY : null, swrFetcher, { revalidateOnFocus: false });
  return { usage: data, error, isLoading, mutate };
}

export function useAiSuggestions(status: string | null, enabled: boolean) {
  const key = enabled ? `/api/v1/ai/suggestions${status ? `?status=${status}` : ""}` : null;
  const { data, mutate } = useSWR<AiSuggestionDto[]>(key, swrFetcher, { revalidateOnFocus: false });
  return { suggestions: data ?? [], mutate };
}

export const aiApi = {
  /** `force`: tạo lại nhận xét mới (bỏ qua bản đã lưu 60 phút). */
  run: <C extends AiTaskCode>(task: C, input: AiInputMap[C], opts: { force?: boolean } = {}) =>
    api.post<AiResultDto<C>>("/api/v1/ai/run", { task, input, ...(opts.force ? { force: true } : {}) }),
  setConsent: (granted: boolean, purpose: AiConsentPurpose = "ai_processing") =>
    api.put<{ purpose: AiConsentPurpose; consented: boolean }>("/api/v1/ai/consent", { granted, purpose }),
  updateTask: (code: string, patch: { enabled?: boolean; monthlyBudgetVnd?: number | null }) =>
    api.patch(`/api/v1/ai/tasks/${encodeURIComponent(code)}`, patch),
  updateBudget: (patch: { limitVnd?: number; alertThresholdPct?: number; hardStop?: boolean }) => api.put<AiUsageDto>("/api/v1/ai/budget", patch),
  decide: (id: string, accept: boolean, note?: string) => api.post(`/api/v1/ai/suggestions/${id}/decision`, { accept, note }),
};

export const refreshAi = () => Promise.all([globalMutate(AI_STATUS_KEY), globalMutate(AI_USAGE_KEY)]);
