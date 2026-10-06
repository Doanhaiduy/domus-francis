"use client";
// Hook dữ liệu + thao tác quản lý bài viết công khai (người có article.manage). Trang người ngoài đọc dữ liệu phía server.
import useSWR, { mutate as globalMutate } from "swr";
import { api, swrFetcher } from "../api";
import type { ArticleDetail, ArticleListItem, ArticleStatus } from "../types/articles";

export const ARTICLES_KEY = "/api/v1/articles";

export interface ArticleFormPayload {
  title: string;
  slug: string;
  summary: string | null;
  content: string;
  category: string;
  coverFileId: string | null;
  byline: string | null;
  isFeatured: boolean;
  status: ArticleStatus;
}

export function useArticles(enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<{ articles: ArticleListItem[] }>(enabled ? ARTICLES_KEY : null, swrFetcher, { keepPreviousData: true });
  return { articles: data?.articles ?? [], error, isLoading, mutate };
}

export function useArticle(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<ArticleDetail>(id ? `${ARTICLES_KEY}/${id}` : null, swrFetcher, { revalidateOnFocus: false });
  return { article: data, error, isLoading, mutate };
}

const refresh = () => globalMutate((key) => typeof key === "string" && key.startsWith(ARTICLES_KEY));

export const articlesApi = {
  create: async (b: ArticleFormPayload) => {
    const r = await api.post<ArticleDetail>(ARTICLES_KEY, b);
    await refresh();
    return r;
  },
  update: async (id: string, b: Partial<ArticleFormPayload>) => {
    const r = await api.patch<ArticleDetail>(`${ARTICLES_KEY}/${id}`, b);
    await refresh();
    return r;
  },
  remove: async (id: string) => {
    await api.del(`${ARTICLES_KEY}/${id}`);
    await refresh();
  },
};
