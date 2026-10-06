"use client";
// Hook dữ liệu + thao tác màn hình Cài đặt → "Tài khoản": danh sách tài khoản, cấp tài khoản, đặt lại mật khẩu, khóa/vô hiệu,
// gán/thu hồi vai trò. Server kiểm lại mọi quyền (auth.user.read / auth.user.manage / auth.role.assign) — giao diện chỉ ẩn/hiện.
import useSWR, { mutate as globalMutate } from "swr";
import { api, inBackground, swrFetcher } from "../api";
import type { AccountAction, AccountsListDto, MemberRolesDto } from "../types/accounts";

export const ACCOUNTS_KEY = "/api/v1/accounts";

export function useAccounts(enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<AccountsListDto>(enabled ? ACCOUNTS_KEY : null, swrFetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });
  return { data, error, isLoading, mutate };
}

/** Làm mới danh sách tài khoản + những nơi hiển thị vai trò/tài khoản (danh bạ thành viên, ma trận phân quyền). */
export const refreshAccounts = () =>
  inBackground(
    globalMutate(
      (key) =>
        typeof key === "string" && (key.startsWith(ACCOUNTS_KEY) || key.startsWith("/api/v1/members") || key.startsWith("/api/v1/rbac"))
    )
  );

const enc = encodeURIComponent;

export const accountsApi = {
  /** Cấp tài khoản cho thành viên chưa có ⇒ mật khẩu tạm hiện MỘT lần */
  create: (memberId: string, email: string) => api.post<{ email: string; temporaryPassword: string }>(ACCOUNTS_KEY, { memberId, email }),
  resetPassword: (userId: string) => api.post<{ temporaryPassword: string }>(`${ACCOUNTS_KEY}/${enc(userId)}/password-reset`),
  resetMfa: (userId: string) => api.del<{ ok: boolean }>(`${ACCOUNTS_KEY}/${enc(userId)}/mfa`),
  setStatus: (userId: string, action: AccountAction) => api.patch<{ ok: true; message: string }>(`${ACCOUNTS_KEY}/${enc(userId)}`, { action }),
  setRole: (userId: string, role: string, grant: boolean) => api.post<MemberRolesDto>(`${ACCOUNTS_KEY}/${enc(userId)}/roles`, { role, grant }),
  /** Theo hồ sơ thành viên (màn hình Thành viên) */
  memberRoles: (memberId: string) => api.get<MemberRolesDto>(`/api/v1/members/${enc(memberId)}/roles`),
  setMemberRole: (memberId: string, role: string, grant: boolean) => api.post<MemberRolesDto>(`/api/v1/members/${enc(memberId)}/roles`, { role, grant }),
};
