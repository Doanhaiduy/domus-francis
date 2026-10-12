"use client";
// Hook dữ liệu + thao tác ủy quyền vai trò tạm thời (SWR). Server kiểm lại mọi quyền; giao diện chỉ ẩn/hiện.
import useSWR, { mutate as globalMutate } from "swr";
import { api, swrFetcher } from "../api";
import type { DelegationsDto } from "../types/delegations";

export const DELEGATIONS_KEY = "/api/v1/delegations";

export function useDelegations(enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<DelegationsDto>(enabled ? DELEGATIONS_KEY : null, swrFetcher, { keepPreviousData: true, revalidateOnFocus: false });
  return { data, error, isLoading: isLoading && !data, mutate };
}

// Ủy quyền đổi vai trò của người nhận ⇒ làm mới cả phiên làm việc / ma trận quyền
const refresh = () => globalMutate((k) => typeof k === "string" && (k.startsWith(DELEGATIONS_KEY) || k.startsWith("/api/v1/auth/me") || k.startsWith("/api/v1/rbac")));

export const delegationsApi = {
  create: async (b: { roleCode: string; delegateMemberId: string; startsOn: string; endsOn: string; reason: string }) => {
    const r = await api.post<{ id: string }>(DELEGATIONS_KEY, b);
    await refresh();
    return r;
  },
  revoke: async (id: string) => {
    await api.del(`${DELEGATIONS_KEY}/${id}`);
    await refresh();
  },
};
