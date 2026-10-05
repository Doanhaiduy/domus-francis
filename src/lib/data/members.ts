"use client";
// Hook dữ liệu + thao tác phân hệ Thành viên & Nhà (SWR — tự làm mới khi quay lại tab, sau mỗi thao tác ghi)
import useSWR, { mutate as globalMutate } from "swr";
import { api, swrFetcher } from "../api";
import type { ApplicationDto, HouseDto, LookupDto, Member, MemberDetailDto, RoomDto } from "../types/members";

export const MEMBERS_KEY = "/api/v1/members";
export const HOUSE_KEY = "/api/v1/house";
export const APPLICATIONS_KEY = "/api/v1/applications";

export function useMembers(opts: { includeFormer?: boolean; enabled?: boolean } = {}) {
  const key = opts.enabled === false ? null : opts.includeFormer ? `${MEMBERS_KEY}?includeFormer=1` : MEMBERS_KEY;
  const { data, error, isLoading, mutate } = useSWR<Member[]>(key, swrFetcher, { keepPreviousData: true });
  return { members: data ?? [], error, isLoading, mutate };
}

export function useMemberDetail(id: string | null | undefined) {
  const { data, error, isLoading, mutate } = useSWR<MemberDetailDto>(id ? `${MEMBERS_KEY}/${id}` : null, swrFetcher);
  return { member: data, error, isLoading, mutate };
}

export function useHouse(enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<HouseDto>(enabled ? HOUSE_KEY : null, swrFetcher, { keepPreviousData: true });
  return { floors: data?.floors ?? [], rooms: data?.rooms ?? [], error, isLoading, mutate };
}

export function useApplications(enabled: boolean, all = false) {
  const { data, error, isLoading, mutate } = useSWR<ApplicationDto[]>(enabled ? `${APPLICATIONS_KEY}${all ? "?all=1" : ""}` : null, swrFetcher);
  return { applications: data ?? [], error, isLoading, mutate };
}

export function useLookups() {
  const { data } = useSWR<LookupDto>("/api/v1/lookups", swrFetcher, { revalidateOnFocus: false });
  return data ?? { universities: [], dioceses: [] };
}

/** Làm mới mọi dữ liệu liên quan tới thành viên/phòng (danh bạ, sơ đồ, chi tiết, phiên của chính mình). */
export const refreshPeople = () =>
  globalMutate((key) => typeof key === "string" && (key.startsWith(MEMBERS_KEY) || key.startsWith(HOUSE_KEY) || key.startsWith(APPLICATIONS_KEY) || key === "/api/v1/auth/me"));

const enc = encodeURIComponent;

export const membersApi = {
  create: (body: Record<string, unknown>) => api.post<{ id: string; account: { email: string; temporaryPassword: string } | null }>(MEMBERS_KEY, body),
  update: (id: string, body: Record<string, unknown>) => api.patch<MemberDetailDto>(`${MEMBERS_KEY}/${id}`, body),
  changeStatus: (id: string, status: string, leftOn?: string | null, reason?: string | null) =>
    api.post(`${MEMBERS_KEY}/${id}/status`, { status, leftOn: leftOn ?? null, reason: reason ?? null }),
  createAccount: (id: string, email: string) => api.post<{ email: string; temporaryPassword: string }>(`${MEMBERS_KEY}/${id}/account`, { email }),
  resetPassword: (id: string) => api.post<{ temporaryPassword: string }>(`${MEMBERS_KEY}/${id}/password-reset`),
  roles: (id: string) => api.get<{ hasAccount: boolean; roles: string[] }>(`${MEMBERS_KEY}/${id}/roles`),
  setRole: (id: string, role: string, grant: boolean) => api.post<{ hasAccount: boolean; roles: string[] }>(`${MEMBERS_KEY}/${id}/roles`, { role, grant }),
  approveApplication: (id: string, note?: string | null, roomCode?: string | null) =>
    api.post<{ memberId: string }>(`${APPLICATIONS_KEY}/${id}/approve`, { note: note ?? null, roomCode: roomCode ?? null }),
  rejectApplication: (id: string, note: string) => api.post(`${APPLICATIONS_KEY}/${id}/reject`, { note }),
};

export const houseApi = {
  createRoom: (room: Partial<RoomDto>) => api.post<{ code: string; house: HouseDto }>(`${HOUSE_KEY}/rooms`, room),
  updateRoom: (code: string, updates: Partial<RoomDto>) => api.patch<HouseDto>(`${HOUSE_KEY}/rooms/${enc(code)}`, updates),
  deleteRoom: (code: string) => api.del<HouseDto>(`${HOUSE_KEY}/rooms/${enc(code)}`),
  createFloor: (f: { name: string; code?: string; description?: string; level?: number }) => api.post<{ level: number; house: HouseDto }>(`${HOUSE_KEY}/floors`, f),
  updateFloor: (level: number, f: { name?: string; code?: string; description?: string }) => api.patch<HouseDto>(`${HOUSE_KEY}/floors/${level}`, f),
  deleteFloor: (level: number) => api.del<HouseDto>(`${HOUSE_KEY}/floors/${level}`),
  assign: (memberId: string, roomCode: string, reason?: string) => api.post(`${HOUSE_KEY}/assignments`, { memberId, roomCode, reason: reason ?? null }),
  unassign: (memberId: string) => api.del(`${HOUSE_KEY}/assignments/${memberId}`),
};
