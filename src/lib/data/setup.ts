"use client";
import useSWR from "swr";
import { swrFetcher } from "../api";

export interface SetupItem {
  key: string;
  group: "basic" | "people" | "operation" | "security" | "public";
  title: string;
  description: string;
  href: string;
  done: boolean;
  optional?: boolean;
  detail?: string;
}
export interface SetupStatusDto {
  items: SetupItem[];
  doneCount: number;
  requiredCount: number;
  requiredDone: number;
}

export const SETUP_KEY = "/api/v1/setup";

/** Chỉ Admin/Trưởng nhà gọi được (người khác nhận 403 ⇒ data rỗng, không báo lỗi). */
export function useSetupStatus(enabled: boolean) {
  const { data, mutate, isLoading } = useSWR<SetupStatusDto>(enabled ? SETUP_KEY : null, swrFetcher, { revalidateOnFocus: false, shouldRetryOnError: false });
  return { setup: data, mutate, isLoading };
}

export const SETUP_GROUPS: Record<SetupItem["group"], string> = {
  basic: "Thông tin cơ bản",
  people: "Con người",
  operation: "Vận hành",
  security: "Bảo mật & AI",
  public: "Trang công khai",
};
