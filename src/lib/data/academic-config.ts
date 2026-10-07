"use client";
// Hook dữ liệu + thao tác Cài đặt → "Danh mục học tập": trường đại học, năm học & học kỳ, nhiệm kỳ người quản lý (SWR + api).
import useSWR, { mutate as globalMutate } from "swr";
import { api, inBackground, swrFetcher } from "../api";
import type {
  AcademicConfigDto,
  AcademicYearDto,
  AcademicYearInput,
  AcademicYearPatch,
  BoardTermDto,
  BoardTermInput,
  BoardTermPatch,
  ConfigSemesterDto,
  SemesterInput,
  SemesterPatch,
  UniversityDto,
  UniversityInput,
  UniversityPatch,
} from "../types/academic-config";

export const ACADEMIC_CONFIG_KEY = "/api/v1/academic/config";
const BASE = ACADEMIC_CONFIG_KEY;

export function useAcademicConfig(enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<AcademicConfigDto>(enabled ? ACADEMIC_CONFIG_KEY : null, swrFetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });
  return { config: data, error, isLoading, mutate };
}

/**
 * Làm mới ở nền: danh mục cấu hình + mọi màn hình đang dùng các danh mục này (biểu mẫu bảng điểm /api/v1/academic/meta,
 * danh sách chọn trường của hồ sơ thành viên /api/v1/lookups).
 */
export const refreshAcademicConfig = (): Promise<void> =>
  inBackground(
    globalMutate((key) => typeof key === "string" && (key.startsWith("/api/v1/academic") || key.startsWith("/api/v1/lookups"))),
  );

export const academicConfigApi = {
  createUniversity: (b: UniversityInput) => api.post<UniversityDto>(`${BASE}/universities`, b),
  updateUniversity: (id: string, b: UniversityPatch) => api.patch<UniversityDto>(`${BASE}/universities/${id}`, b),
  deleteUniversity: (id: string) => api.del(`${BASE}/universities/${id}`),

  createYear: (b: AcademicYearInput) => api.post<AcademicYearDto>(`${BASE}/years`, b),
  updateYear: (id: string, b: AcademicYearPatch) => api.patch<AcademicYearDto>(`${BASE}/years/${id}`, b),
  setCurrentYear: (id: string) => api.patch<AcademicYearDto>(`${BASE}/years/${id}`, { isCurrent: true }),
  deleteYear: (id: string) => api.del(`${BASE}/years/${id}`),

  createSemester: (b: SemesterInput) => api.post<ConfigSemesterDto>(`${BASE}/semesters`, b),
  updateSemester: (id: string, b: SemesterPatch) => api.patch<ConfigSemesterDto>(`${BASE}/semesters/${id}`, b),
  deleteSemester: (id: string) => api.del(`${BASE}/semesters/${id}`),

  createBoardTerm: (b: BoardTermInput) => api.post<BoardTermDto>(`${BASE}/board-terms`, b),
  updateBoardTerm: (id: string, b: BoardTermPatch) => api.patch<BoardTermDto>(`${BASE}/board-terms/${id}`, b),
  deleteBoardTerm: (id: string) => api.del(`${BASE}/board-terms/${id}`),
};
