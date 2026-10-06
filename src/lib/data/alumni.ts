"use client";
// Hook dữ liệu + thao tác mạng lưới cựu thành viên (SWR)
import useSWR, { mutate as globalMutate } from "swr";
import { api, swrFetcher } from "../api";
import type { AlumniInput, AlumniListDto } from "../types/alumni";

export const ALUMNI_KEY = "/api/v1/alumni";

export function useAlumni(enabled = true) {
  const { data, error, isLoading } = useSWR<AlumniListDto>(enabled ? ALUMNI_KEY : null, swrFetcher, { keepPreviousData: true, revalidateOnFocus: false });
  return { items: data?.items ?? [], canManage: data?.canManage ?? false, error, isLoading: isLoading && !data };
}

export const alumniApi = {
  save: async (memberId: string, b: AlumniInput) => {
    await api.put(`${ALUMNI_KEY}/${memberId}`, b);
    await globalMutate(ALUMNI_KEY);
  },
};
