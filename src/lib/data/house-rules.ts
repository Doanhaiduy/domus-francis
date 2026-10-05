"use client";
// Hook dữ liệu + thao tác "Luật nhà" (SWR; ghi xong thì làm mới)
import useSWR, { mutate as globalMutate } from "swr";
import { api, swrFetcher } from "../api";
import type { HouseRuleInput, HouseRuleSectionDto, HouseRulesDto } from "../types/house-rules";

export const HOUSE_RULES_KEY = "/api/v1/house-rules";
export const refreshHouseRules = () => globalMutate(HOUSE_RULES_KEY);

export function useHouseRules(enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<HouseRulesDto>(enabled ? HOUSE_RULES_KEY : null, swrFetcher, { revalidateOnFocus: false });
  return { rules: data, error, isLoading, mutate };
}

export const houseRulesApi = {
  create: (b: HouseRuleInput) => api.post<HouseRuleSectionDto>(HOUSE_RULES_KEY, b),
  update: (id: string, b: HouseRuleInput) => api.patch<HouseRuleSectionDto>(`${HOUSE_RULES_KEY}/${id}`, b),
  remove: (id: string) => api.del(`${HOUSE_RULES_KEY}/${id}`),
  reorder: (ids: string[]) => api.post(`${HOUSE_RULES_KEY}/reorder`, { ids }),
};

/** Giờ đầu tiên trong chuỗi ("22:30", "05h30–06:00", "CN 8:00") → số phút trong ngày; không có giờ ⇒ null. */
export function minutesOf(time: string | null | undefined): number | null {
  const m = /(\d{1,2})\s*[:hH]\s*(\d{2})?/.exec(time ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  return h > 23 || min > 59 ? null : h * 60 + min;
}
