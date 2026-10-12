"use client";
// Hook dữ liệu + thao tác "Yêu cầu về dữ liệu cá nhân" (SWR) và "Tải dữ liệu của tôi".
import useSWR, { mutate as globalMutate } from "swr";
import { ApiClientError, api, refreshSession, swrFetcher } from "../api";
import type { DataRequestListDto, DataRequestStatus, DataRequestType } from "../types/data-requests";

export const DATA_REQUESTS_KEY = "/api/v1/data-requests";
export const MY_EXPORT_URL = "/api/v1/me/export";

/** `enabled`: false ⇒ không tải; "mine" ⇒ chỉ yêu cầu của chính mình (thẻ ở Hồ sơ cá nhân); true ⇒ cả danh sách của người quản lý. */
export function useDataRequests(enabled: boolean | "mine" = true) {
  const key = enabled === "mine" ? `${DATA_REQUESTS_KEY}?scope=mine` : enabled ? DATA_REQUESTS_KEY : null;
  const { data, error, isLoading, mutate } = useSWR<DataRequestListDto>(key, swrFetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });
  return { data, error, isLoading: isLoading && !data, mutate };
}

const refresh = () => globalMutate((k) => typeof k === "string" && k.startsWith(DATA_REQUESTS_KEY));

export const dataRequestsApi = {
  create: async (b: { type: DataRequestType; details?: string | null }) => {
    const r = await api.post<{ id: string; dueAt: string }>(DATA_REQUESTS_KEY, b);
    await refresh();
    return r;
  },
  /** Người quản lý: đổi trạng thái và/hoặc trả lời */
  update: async (id: string, b: { status?: DataRequestStatus; resolutionNote?: string | null }) => {
    await api.patch(`${DATA_REQUESTS_KEY}/${id}`, b);
    await refresh();
  },
  /** Người quản lý: ẩn danh hóa hồ sơ của người gửi (đã rời nhà) — đóng yêu cầu luôn */
  anonymize: async (id: string, b: { confirmName: string; reason: string }) => {
    const r = await api.post<{ ok: true; memberId: string }>(`${DATA_REQUESTS_KEY}/${id}/anonymize`, b);
    await refresh();
    return r;
  },
};

/**
 * Tải tệp JSON "dữ liệu của tôi" (GET /api/v1/me/export) về máy. Phiên hết hạn ⇒ làm mới rồi thử lại một lần.
 * Trả tên tệp đã lưu; lỗi ⇒ ném ApiClientError (thông điệp tiếng Việt từ máy chủ).
 */
export async function downloadMyData(): Promise<string> {
  const get = () => fetch(MY_EXPORT_URL, { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } });
  let res = await get();
  if (res.status === 401 && (await refreshSession())) res = await get();
  if (!res.ok) {
    let body: { detail?: string; code?: string } = {};
    try {
      body = await res.json();
    } catch {
      /* không phải JSON */
    }
    throw new ApiClientError(res.status, body.code ?? `HTTP_${res.status}`, body.detail ?? `Lỗi ${res.status}`);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "du-lieu-ca-nhan.json";
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return name;
}
