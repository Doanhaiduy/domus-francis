"use client";
// Hook dữ liệu + thao tác Thư viện tài liệu phụng vụ (SWR + api) — trang /phung-vu, khu "Tài liệu phụng vụ".
import useSWR, { mutate as globalMutate } from "swr";
import { api, inBackground, swrFetcher } from "../api";
import type {
  LiturgyDocKind,
  LiturgyDocumentDto,
  LiturgyDocumentInput,
  LiturgyDocumentListDto,
  LiturgyDocumentPatch,
} from "../types/liturgy-documents";

export const LITURGY_DOCS_KEY = "/api/v1/liturgy/documents";

export interface LiturgyDocFilter {
  q?: string;
  kind?: LiturgyDocKind | "";
  category?: string;
}

export function liturgyDocsKey(f: LiturgyDocFilter = {}): string {
  const qs = new URLSearchParams();
  if (f.q?.trim()) qs.set("q", f.q.trim());
  if (f.kind) qs.set("kind", f.kind);
  if (f.category) qs.set("category", f.category);
  const s = qs.toString();
  return s ? `${LITURGY_DOCS_KEY}?${s}` : LITURGY_DOCS_KEY;
}

/** Danh sách theo bộ lọc (tìm không dấu ở máy chủ) + đếm theo loại/chuyên mục + quyền quản lý. */
export function useLiturgyDocuments(f: LiturgyDocFilter = {}) {
  const { data, error, isLoading, mutate } = useSWR<LiturgyDocumentListDto>(liturgyDocsKey(f), swrFetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });
  return { data, error, isLoading, mutate };
}

/** Chi tiết một tài liệu (lời văn đầy đủ). `id` null ⇒ không tải. */
export function useLiturgyDocument(id: string | null | undefined) {
  const { data, error, isLoading, mutate } = useSWR<LiturgyDocumentDto>(id ? `${LITURGY_DOCS_KEY}/${id}` : null, swrFetcher, {
    revalidateOnFocus: false,
  });
  return { doc: data, error, isLoading, mutate };
}

/** Làm mới mọi khóa của thư viện (danh sách theo mọi bộ lọc + chi tiết) ở nền. */
export const refreshLiturgyDocuments = (): Promise<void> =>
  inBackground(globalMutate((key) => typeof key === "string" && key.startsWith(LITURGY_DOCS_KEY)));

export const liturgyDocsApi = {
  create: (b: LiturgyDocumentInput) => api.post<LiturgyDocumentDto>(LITURGY_DOCS_KEY, b),
  update: (id: string, b: LiturgyDocumentPatch) => api.patch<LiturgyDocumentDto>(`${LITURGY_DOCS_KEY}/${id}`, b),
  remove: (id: string) => api.del(`${LITURGY_DOCS_KEY}/${id}`),
};
