"use client";
import useSWR, { mutate as globalMutate } from "swr";
import { api, swrFetcher } from "../api";
import { moduleOfPath, type DisabledModules, type ModulesStateDto } from "../modules";

export const MODULES_KEY = "/api/v1/ui/modules";

/** Phân hệ đang ẩn (bảo trì). Lỗi/chưa tải ⇒ coi như không ẩn gì (không chặn người dùng). */
export function useModules(enabled = true) {
  const { data, isLoading } = useSWR<ModulesStateDto>(enabled ? MODULES_KEY : null, swrFetcher, {
    shouldRetryOnError: false,
    revalidateOnFocus: true,
    dedupingInterval: 60_000,
  });
  const disabled = data?.disabled ?? {};
  return {
    isLoading: isLoading && !data,
    disabled,
    canManage: !!data?.canManage,
    isDisabled: (href: string) => !!disabled[href],
    stateOf: (pathname: string) => {
      const m = moduleOfPath(pathname);
      return m && disabled[m.href] ? { module: m, ...disabled[m.href] } : null;
    },
  };
}

export const modulesApi = {
  save: async (disabled: DisabledModules) => {
    const r = await api.put<{ disabled: DisabledModules }>(MODULES_KEY, { disabled });
    await globalMutate(MODULES_KEY);
    return r;
  },
};
