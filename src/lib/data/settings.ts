"use client";
// Hook dữ liệu + thao tác phân hệ Cài đặt: cấu hình hệ thống (settings), danh mục (categories), ma trận phân quyền (RBAC).
import useSWR, { mutate as globalMutate } from "swr";
import { api, inBackground, swrFetcher } from "../api";
import type {
  CategoryDto,
  CategoryInput,
  CategoryKind,
  OrgSettingsDto,
  RbacMatrixDto,
  RoleInput,
  SettingChange,
  SettingsListDto,
} from "../types/settings";

export const SETTINGS_KEY = "/api/v1/settings";
export const ORG_SETTINGS_KEY = "/api/v1/settings/public";
export const CATEGORIES_KEY = "/api/v1/categories";
export const RBAC_KEY = "/api/v1/rbac";

/** Toàn bộ cấu hình người dùng được xem + quyền sửa từng khóa (màn hình Cài đặt). */
export function useSettings(enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<SettingsListDto>(enabled ? SETTINGS_KEY : null, swrFetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });
  return { settings: data?.items ?? [], writers: data?.writers ?? {}, error, isLoading, mutate };
}

const EMPTY_ORG: OrgSettingsDto = {
  houseName: "",
  motto: "",
  address: "",
  patronFeast: "",
  patronFeastLabel: "",
  patronFeastTitle: null,
  contactPhone: "",
  orderName: "",
  chaplainName: "",
  duesBankAccount: "",
  monthlyDuesVnd: null,
  duesDueDay: null,
  mealPricePerServingVnd: null,
  lunchCutoffTime: null,
  dinnerCutoffTime: null,
  nightPrayerTime: null,
  mealsEnabled: false,
  values: {},
};

/**
 * Cấu hình tổ chức công khai (tên lưu xá, khẩu hiệu, địa chỉ, bổn mạng, hotline, Tỉnh Dòng, Cha linh hướng, mức quỹ, giờ chốt cơm…)
 * cho mọi màn hình. Mọi thành viên đã đăng nhập đều đọc được. `org` luôn là object (chuỗi rỗng khi chưa tải xong).
 */
export function useOrgSettings() {
  const { data, error, isLoading, mutate } = useSWR<OrgSettingsDto>(ORG_SETTINGS_KEY, swrFetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  return { org: data ?? EMPTY_ORG, loaded: !!data, error, isLoading, mutate };
}

/** Danh mục theo phân hệ. `activeOnly` cho form tạo mới (ẩn danh mục đang tạm ẩn). */
export function useCategories(opts: { kind?: CategoryKind; activeOnly?: boolean; enabled?: boolean } = {}) {
  const qs = new URLSearchParams();
  if (opts.kind) qs.set("kind", opts.kind);
  if (opts.activeOnly) qs.set("active", "1");
  const q = qs.toString();
  const key = opts.enabled === false ? null : `${CATEGORIES_KEY}${q ? `?${q}` : ""}`;
  const { data, error, isLoading, mutate } = useSWR<CategoryDto[]>(key, swrFetcher, { keepPreviousData: true });
  return { categories: data ?? [], error, isLoading, mutate };
}

export function useRbacMatrix(enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<RbacMatrixDto>(enabled ? RBAC_KEY : null, swrFetcher, { revalidateOnFocus: false });
  return { matrix: data, error, isLoading, mutate };
}

/** Làm mới ma trận phân quyền + những nơi hiển thị vai trò (danh sách tài khoản, phiên của chính mình — tên vai trò/quyền). */
export const refreshRbac = () =>
  inBackground(
    globalMutate((key) => typeof key === "string" && (key.startsWith(RBAC_KEY) || key.startsWith("/api/v1/accounts") || key === "/api/v1/auth/me"))
  );

/** Vai trò: thêm/sửa/xóa (auth.role.manage — Admin). Kết quả xóa: "deleted" (xóa hẳn) hoặc "archived" (lưu trữ, đã thu hồi người giữ). */
export const rbacApi = {
  createRole: (body: RoleInput & { code: string }) => api.post<{ code: string }>(`${RBAC_KEY}/roles`, body),
  updateRole: (code: string, body: Partial<RoleInput>) => api.patch<{ ok: true; code: string }>(`${RBAC_KEY}/roles/${encodeURIComponent(code)}`, body),
  deleteRole: (code: string) => api.del<{ ok: true; code: string; result: "deleted" | "archived" }>(`${RBAC_KEY}/roles/${encodeURIComponent(code)}`),
};

/** Làm mới cấu hình (danh sách quản trị + bản công khai dùng ở các màn hình khác). */
export const refreshSettings = () => globalMutate((key) => typeof key === "string" && key.startsWith(SETTINGS_KEY));

export const refreshCategories = () => globalMutate((key) => typeof key === "string" && key.startsWith(CATEGORIES_KEY));

const enc = encodeURIComponent;

export const settingsApi = {
  save: (changes: SettingChange[]) => api.patch<SettingsListDto & { changed: string[] }>(SETTINGS_KEY, { changes }),
  reset: (keys: string[]) => api.post<SettingsListDto & { reset: string[]; skipped: string[] }>(`${SETTINGS_KEY}/reset`, { keys }),
  resetOne: (key: string) => api.post(`${SETTINGS_KEY}/${enc(key)}/reset`),
};

export const categoriesApi = {
  create: (body: CategoryInput) => api.post<CategoryDto>(CATEGORIES_KEY, body),
  update: (id: string, body: CategoryInput) => api.patch<CategoryDto>(`${CATEGORIES_KEY}/${id}`, body),
  remove: (id: string) => api.del<{ ok: true }>(`${CATEGORIES_KEY}/${id}`),
};
