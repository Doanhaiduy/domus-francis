"use client";
// Hook dữ liệu + thao tác phân hệ Khoảnh khắc (SWR — làm mới sau mỗi thao tác ghi)
import useSWR, { mutate as globalMutate } from "swr";
import { api, swrFetcher } from "../api";
import type { MomentAlbumDetailDto, MomentLikeResult, MomentListDto, MomentListFilter } from "../types/moments";

export const MOMENTS_KEY = "/api/v1/moments";

export function momentsListKey(f: MomentListFilter): string {
  const p = new URLSearchParams();
  if (f.category) p.set("category", f.category);
  if (f.year) p.set("year", String(f.year));
  if (f.month) p.set("month", String(f.month));
  if (f.day) p.set("day", f.day);
  if (f.featured) p.set("featured", "1");
  if (f.q) p.set("q", f.q);
  const s = p.toString();
  return s ? `${MOMENTS_KEY}?${s}` : MOMENTS_KEY;
}

export function useMoments(filter: MomentListFilter) {
  const { data, error, isLoading, mutate } = useSWR<MomentListDto>(momentsListKey(filter), swrFetcher, { keepPreviousData: true });
  return { data, error, isLoading, mutate };
}

export function useMomentAlbum(id: string | null | undefined) {
  const { data, error, isLoading, mutate } = useSWR<MomentAlbumDetailDto>(id ? `${MOMENTS_KEY}/${id}` : null, swrFetcher, {
    keepPreviousData: false,
  });
  return { album: data, error, isLoading, mutate };
}

/** Làm mới mọi danh sách/chi tiết album (sau khi ghi). */
export const refreshMoments = () => globalMutate((key) => typeof key === "string" && key.startsWith(MOMENTS_KEY));

/** Sau khi xóa album: bỏ bộ nhớ đệm chi tiết của album đó (không tải lại → tránh 404) và chỉ làm mới các danh sách. */
export const forgetAlbumAndRefresh = async (albumId: string) => {
  await globalMutate(`${MOMENTS_KEY}/${albumId}`, undefined, { revalidate: false });
  return globalMutate((key) => typeof key === "string" && (key === MOMENTS_KEY || key.startsWith(`${MOMENTS_KEY}?`)));
};

export interface CreateAlbumBody {
  title: string;
  description?: string | null;
  categoryId: string;
  takenOn: string; // YYYY-MM-DD
  location?: string | null;
  tags?: string[];
  participantIds?: string[];
  coverFileId: string;
  photoFileIds?: string[];
}

export type UpdateAlbumBody = Partial<Omit<CreateAlbumBody, "coverFileId" | "photoFileIds">> & {
  coverFileId?: string | null;
  isFeatured?: boolean;
  hidden?: boolean;
};

export const momentsApi = {
  create: (body: CreateAlbumBody) => api.post<MomentAlbumDetailDto>(MOMENTS_KEY, body),
  update: (id: string, body: UpdateAlbumBody) => api.patch<MomentAlbumDetailDto>(`${MOMENTS_KEY}/${id}`, body),
  remove: (id: string) => api.del<{ ok: true }>(`${MOMENTS_KEY}/${id}`),
  likeAlbum: (id: string, liked: boolean) =>
    liked ? api.post<MomentLikeResult>(`${MOMENTS_KEY}/${id}/like`) : api.del<MomentLikeResult>(`${MOMENTS_KEY}/${id}/like`),
  addPhotos: (id: string, photos: { fileId: string; caption?: string | null }[]) =>
    api.post<MomentAlbumDetailDto>(`${MOMENTS_KEY}/${id}/photos`, { photos }),
  updatePhoto: (photoId: string, body: { caption?: string | null; hidden?: boolean }) =>
    api.patch<MomentAlbumDetailDto>(`${MOMENTS_KEY}/photos/${photoId}`, body),
  removePhoto: (photoId: string) => api.del<MomentAlbumDetailDto>(`${MOMENTS_KEY}/photos/${photoId}`),
  likePhoto: (photoId: string, liked: boolean) =>
    liked ? api.post<MomentLikeResult>(`${MOMENTS_KEY}/photos/${photoId}/like`) : api.del<MomentLikeResult>(`${MOMENTS_KEY}/photos/${photoId}/like`),
  respondTag: (id: string, status: "accepted" | "declined") => api.post<MomentAlbumDetailDto>(`${MOMENTS_KEY}/${id}/tag`, { status }),
};
