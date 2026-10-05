"use client";
// Hook dữ liệu + thao tác phân hệ Cộng đoàn: Thông báo, Diễn đàn, Ý cầu nguyện, Phụng vụ, Hộp thư (SWR + api).
import useSWR, { mutate as globalMutate } from "swr";
import { api, swrFetcher } from "../api";
import type {
  AnnouncementDto,
  AnnouncementMetaDto,
  AnnouncementReaderDto,
  ForumListDto,
  ForumPostDetailDto,
  LiturgyWeekDto,
  NotificationsDto,
  PrayerListDto,
  ReflectionDto,
  TargetType,
  UnreadCountDto,
} from "../types/community";

export const ANNOUNCEMENTS_KEY = "/api/v1/announcements";
export const UNREAD_KEY = "/api/v1/notifications/unread-count";
export const NOTIFICATIONS_KEY = "/api/v1/notifications";
export const FORUM_KEY = "/api/v1/forum/posts";
export const PRAYERS_KEY = "/api/v1/prayers";
export const LITURGY_WEEK_KEY = "/api/v1/liturgy/week";
export const REFLECTIONS_KEY = "/api/v1/liturgy/reflections";

const startsWith = (prefix: string) => (key: unknown) => typeof key === "string" && key.startsWith(prefix);

/** Làm mới thông báo + số chưa đọc (chuông Header, badge Sidebar, Tổng quan dùng chung khóa này). */
export const refreshAnnouncements = () =>
  Promise.all([
    globalMutate(startsWith(ANNOUNCEMENTS_KEY)),
    globalMutate(startsWith(NOTIFICATIONS_KEY)),
  ]);
export const refreshForum = () => globalMutate(startsWith(FORUM_KEY));
export const refreshPrayers = () => globalMutate(startsWith(PRAYERS_KEY));
export const refreshLiturgy = () => Promise.all([globalMutate(startsWith(LITURGY_WEEK_KEY)), globalMutate(startsWith(REFLECTIONS_KEY))]);

// ---------------------------------------------------------------------
// Hook đọc
// ---------------------------------------------------------------------
export function useAnnouncements(opts: { limit?: number; enabled?: boolean } = {}) {
  const key = opts.enabled === false ? null : opts.limit ? `${ANNOUNCEMENTS_KEY}?limit=${opts.limit}` : ANNOUNCEMENTS_KEY;
  const { data, error, isLoading, mutate } = useSWR<AnnouncementDto[]>(key, swrFetcher, { keepPreviousData: true });
  return { announcements: data ?? [], error, isLoading, mutate };
}

export function useAnnouncementMeta(enabled = true) {
  const { data } = useSWR<AnnouncementMetaDto>(enabled ? `${ANNOUNCEMENTS_KEY}/meta` : null, swrFetcher, { revalidateOnFocus: false });
  return data ?? { categories: [], floors: [], rooms: [], roles: [], events: [] };
}

export function useAnnouncementReaders(id: string | null) {
  const { data, isLoading } = useSWR<{ read: AnnouncementReaderDto[]; unread: AnnouncementReaderDto[] }>(
    id ? `${ANNOUNCEMENTS_KEY}/${id}/readers` : null,
    swrFetcher
  );
  return { readers: data, isLoading };
}

/** { announcementsUnread, notificationsUnread } — tự làm mới mỗi 60 giây. */
export function useUnreadCounts(enabled = true) {
  const { data, mutate } = useSWR<UnreadCountDto>(enabled ? UNREAD_KEY : null, swrFetcher, { refreshInterval: 60_000 });
  return { counts: data ?? { announcementsUnread: 0, notificationsUnread: 0 }, mutate };
}

export function useNotifications(enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<NotificationsDto>(enabled ? NOTIFICATIONS_KEY : null, swrFetcher, { keepPreviousData: true });
  return { data, error, isLoading, mutate };
}

export function useForum() {
  const { data, error, isLoading, mutate } = useSWR<ForumListDto>(FORUM_KEY, swrFetcher, { keepPreviousData: true });
  return { data, error, isLoading, mutate };
}

export function useForumPost(id: string | null | undefined) {
  const { data, error, isLoading, mutate } = useSWR<ForumPostDetailDto>(id ? `${FORUM_KEY}/${id}` : null, swrFetcher, { keepPreviousData: true });
  return { post: data, error, isLoading, mutate };
}

export function usePrayers() {
  const { data, error, isLoading, mutate } = useSWR<PrayerListDto>(PRAYERS_KEY, swrFetcher, { keepPreviousData: true });
  return { data, error, isLoading, mutate };
}

export function useLiturgyWeek(from: string | null) {
  const { data, error, isLoading, mutate } = useSWR<LiturgyWeekDto>(from ? `${LITURGY_WEEK_KEY}?from=${from}` : LITURGY_WEEK_KEY, swrFetcher, {
    keepPreviousData: true,
  });
  return { week: data, error, isLoading, mutate };
}

export function useReflections(limit = 5) {
  const { data, error, isLoading, mutate } = useSWR<ReflectionDto[]>(`${REFLECTIONS_KEY}?limit=${limit}`, swrFetcher);
  return { reflections: data ?? [], error, isLoading, mutate };
}

// ---------------------------------------------------------------------
// Thao tác
// ---------------------------------------------------------------------
export interface CreateAnnouncementBody {
  title: string;
  content: string;
  categoryId: string;
  targets?: { type: TargetType; id: string }[];
  isPinned?: boolean;
  requiresAck?: boolean;
  ackDeadline?: string | null;
  eventId?: string | null;
  attachmentFileId?: string | null;
  notify?: boolean;
  notifyZalo?: boolean;
}

export const announcementsApi = {
  create: (b: CreateAnnouncementBody) => api.post<{ id: string; notified: number; zalo?: { sent: boolean; reason?: string } | null }>(ANNOUNCEMENTS_KEY, b),
  remove: (id: string) => api.del(`${ANNOUNCEMENTS_KEY}/${id}`),
  pin: (id: string, pinned: boolean) => api.post<AnnouncementDto>(`${ANNOUNCEMENTS_KEY}/${id}/pin`, { pinned }),
  read: (id: string, acknowledge = false) => api.post(`${ANNOUNCEMENTS_KEY}/${id}/read`, { acknowledge }),
  readAll: () => api.post<{ marked: number }>(`${ANNOUNCEMENTS_KEY}/read-all`),
  rsvp: (id: string, going: boolean) => api.post<AnnouncementDto>(`${ANNOUNCEMENTS_KEY}/${id}/rsvp`, { going }),
};

export const notificationsApi = {
  read: (id: string) => api.post(`${NOTIFICATIONS_KEY}/${id}/read`),
  readAll: (includeAnnouncements = true) => api.post(`${NOTIFICATIONS_KEY}/read-all`, { includeAnnouncements }),
};

export const forumApi = {
  create: (b: { title: string; content: string; categoryId: string }) => api.post<{ id: string }>(FORUM_KEY, b),
  update: (id: string, b: Record<string, unknown>) => api.patch<ForumPostDetailDto>(`${FORUM_KEY}/${id}`, b),
  remove: (id: string) => api.del(`${FORUM_KEY}/${id}`),
  like: (id: string, liked?: boolean) => api.post<{ liked: boolean; reactionsCount: number }>(`${FORUM_KEY}/${id}/like`, { liked }),
  comment: (id: string, content: string, parentId?: string | null) =>
    api.post<ForumPostDetailDto>(`${FORUM_KEY}/${id}/comments`, { content, parentId: parentId ?? null }),
  report: (id: string, reason: string) => api.post(`${FORUM_KEY}/${id}/report`, { reason }),
  resolveReports: (id: string, status: "dismissed" | "actioned") => api.post(`${FORUM_KEY}/${id}/reports`, { status }),
  updateComment: (id: string, b: { content?: string; status?: "published" | "hidden" }) => api.patch(`/api/v1/forum/comments/${id}`, b),
  removeComment: (id: string) => api.del(`/api/v1/forum/comments/${id}`),
  reportComment: (id: string, reason: string) => api.post(`/api/v1/forum/comments/${id}/report`, { reason }),
};

export const prayersApi = {
  create: (content: string, anonymous: boolean) => api.post<{ id: string }>(PRAYERS_KEY, { content, anonymous }),
  pray: (id: string, praying?: boolean) => api.post<{ hasPrayed: boolean; prayingCount: number }>(`${PRAYERS_KEY}/${id}/pray`, { praying }),
  setStatus: (id: string, status: "open" | "answered" | "closed") => api.post(`${PRAYERS_KEY}/${id}/status`, { status }),
  setHidden: (id: string, hidden: boolean) => api.post(`${PRAYERS_KEY}/${id}/visibility`, { hidden }),
  report: (id: string, reason: string) => api.post(`${PRAYERS_KEY}/${id}/report`, { reason }),
  resolveReports: (id: string, status: "dismissed" | "actioned") => api.post(`${PRAYERS_KEY}/${id}/reports`, { status }),
  reveal: (id: string, reason: string) =>
    api.post<{ memberId: string | null; name: string | null; fullName: string | null }>(`${PRAYERS_KEY}/${id}/reveal`, { reason }),
};

export const liturgyApi = {
  createSession: (b: { title: string; date: string; time: string; durationMinutes?: number; location?: string | null; description?: string | null; patron?: boolean }) =>
    api.post<{ id: string }>("/api/v1/liturgy/sessions", b),
  cancelSession: (id: string, reason: string) => api.del(`/api/v1/liturgy/sessions/${id}`, { reason }),
  assign: (b: { eventId: string; roleCode: string; memberId: string; note?: string | null }) => api.post<{ id: string }>("/api/v1/liturgy/assignments", b),
  setAssignmentStatus: (id: string, status: "assigned" | "confirmed" | "declined" | "served") => api.patch(`/api/v1/liturgy/assignments/${id}`, { status }),
  unassign: (id: string) => api.del(`/api/v1/liturgy/assignments/${id}`),
  createReflection: (b: { scriptureRef?: string | null; quote?: string | null; body: string }) => api.post<{ id: string }>(REFLECTIONS_KEY, b),
  removeReflection: (id: string) => api.del(`${REFLECTIONS_KEY}/${id}`),
};
