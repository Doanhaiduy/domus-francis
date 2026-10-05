"use client";
// Hook dữ liệu + thao tác phân hệ Học tập (SWR — tự làm mới khi quay lại tab và sau mỗi thao tác ghi)
import useSWR, { mutate as globalMutate } from "swr";
import { api, swrFetcher } from "../api";
import type {
  AcademicAction,
  AcademicMetaDto,
  AcademicRecordDto,
  AcademicRecordInput,
  AcademicSummaryDto,
  SaveRecordResult,
} from "../types/academic";

export const ACADEMIC_KEY = "/api/v1/academic";
const RECORDS_KEY = `${ACADEMIC_KEY}/records`;

export function useAcademicRecords(enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<AcademicRecordDto[]>(enabled ? RECORDS_KEY : null, swrFetcher, {
    keepPreviousData: true,
  });
  return { records: data ?? [], error, isLoading, mutate };
}

export function useAcademicMeta(enabled = true) {
  const { data, error, isLoading } = useSWR<AcademicMetaDto>(enabled ? `${ACADEMIC_KEY}/meta` : null, swrFetcher, {
    revalidateOnFocus: false,
  });
  return { meta: data, error, isLoading };
}

export function useAcademicSummary(enabled = true) {
  const { data, error, isLoading } = useSWR<AcademicSummaryDto>(enabled ? `${ACADEMIC_KEY}/summary` : null, swrFetcher);
  return { summary: data, error, isLoading };
}

/** Làm mới mọi dữ liệu học tập (danh sách, tóm tắt). */
export const refreshAcademic = () =>
  globalMutate((key) => typeof key === "string" && key.startsWith(ACADEMIC_KEY) && !key.endsWith("/meta"));

export const academicApi = {
  create: (body: AcademicRecordInput) => api.post<SaveRecordResult>(RECORDS_KEY, body),
  update: (id: string, body: AcademicRecordInput) => api.patch<SaveRecordResult>(`${RECORDS_KEY}/${id}`, body),
  remove: (id: string) => api.del<{ ok: true }>(`${RECORDS_KEY}/${id}`),
  act: (id: string, action: AcademicAction, reason?: string | null) =>
    api.post<{ record: AcademicRecordDto | null }>(`${RECORDS_KEY}/${id}/${action}`, { reason: reason ?? null }),
};
