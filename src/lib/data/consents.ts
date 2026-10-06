"use client";
// Đồng ý (consents) của chính mình: hồ sơ Công giáo, cho Ban điều hành xem hồ sơ Công giáo.
import useSWR, { mutate as globalMutate } from "swr";
import { api, swrFetcher } from "../api";

export const CONSENTS_KEY = "/api/v1/consents";
export type SelfConsentPurpose = "catholic_profile" | "catholic_share_leadership";
export type MyConsents = Record<SelfConsentPurpose, boolean>;

export function useMyConsents(enabled = true) {
  const { data, isLoading, mutate } = useSWR<MyConsents>(enabled ? CONSENTS_KEY : null, swrFetcher, { revalidateOnFocus: false, shouldRetryOnError: false });
  return { consents: data, isLoading, mutate };
}

export const consentsApi = {
  set: async (purpose: SelfConsentPurpose, granted: boolean) => {
    const r = await api.put<{ purpose: SelfConsentPurpose; consented: boolean }>(CONSENTS_KEY, { purpose, granted });
    await globalMutate(CONSENTS_KEY);
    return r;
  },
};
