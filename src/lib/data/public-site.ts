"use client";
// Hook dữ liệu + thao tác quản lý phần mở rộng của trang công khai: hỏi đáp, đăng ký tìm hiểu, lịch sử chỉnh sửa bài.
import useSWR, { mutate as globalMutate } from "swr";
import { api, swrFetcher } from "../api";
import type { ArticleDetail, ArticleRevision } from "../types/articles";
import type { FaqDto, InquiryDto, InquiryStatus } from "../types/public-site";
import { ARTICLES_KEY } from "./articles";

export const FAQS_KEY = "/api/v1/faqs";
export const INQUIRIES_KEY = "/api/v1/inquiries";

export function useFaqs(enabled = true) {
  const { data, error, isLoading } = useSWR<{ faqs: FaqDto[] }>(enabled ? FAQS_KEY : null, swrFetcher, { keepPreviousData: true });
  return { faqs: data?.faqs ?? [], error, isLoading };
}

export interface FaqPayload {
  question: string;
  answer: string;
  isActive?: boolean;
  sortOrder?: number;
}

export const faqsApi = {
  create: async (b: FaqPayload) => {
    const r = await api.post<FaqDto>(FAQS_KEY, b);
    await globalMutate(FAQS_KEY);
    return r;
  },
  update: async (id: string, b: Partial<FaqPayload>) => {
    const r = await api.patch<FaqDto>(`${FAQS_KEY}/${id}`, b);
    await globalMutate(FAQS_KEY);
    return r;
  },
  remove: async (id: string) => {
    await api.del(`${FAQS_KEY}/${id}`);
    await globalMutate(FAQS_KEY);
  },
};

/** `refreshMs`: tự làm mới định kỳ (dùng cho huy hiệu "đăng ký mới" ở thanh bên). */
export function useInquiries(enabled = true, refreshMs = 0) {
  const { data, error, isLoading } = useSWR<{ inquiries: InquiryDto[]; newCount: number }>(enabled ? INQUIRIES_KEY : null, swrFetcher, {
    keepPreviousData: true,
    refreshInterval: refreshMs,
    revalidateOnFocus: refreshMs > 0,
  });
  return { inquiries: data?.inquiries ?? [], newCount: data?.newCount ?? 0, error, isLoading };
}

export const inquiriesApi = {
  update: async (id: string, b: { status?: InquiryStatus; note?: string | null }) => {
    await api.patch(`${INQUIRIES_KEY}/${id}`, b);
    await globalMutate(INQUIRIES_KEY);
  },
};

export function useRevisions(articleId: string | null, enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<{ revisions: ArticleRevision[] }>(articleId && enabled ? `${ARTICLES_KEY}/${articleId}/revisions` : null, swrFetcher, { revalidateOnFocus: false });
  return { revisions: data?.revisions ?? [], error, isLoading, mutate };
}

export const revisionsApi = {
  restore: async (articleId: string, revisionId: string) => {
    const r = await api.post<ArticleDetail>(`${ARTICLES_KEY}/${articleId}/revisions/${revisionId}`);
    await globalMutate((key) => typeof key === "string" && key.startsWith(ARTICLES_KEY));
    return r;
  },
};
