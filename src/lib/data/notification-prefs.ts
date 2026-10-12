"use client";
// Tùy chọn nhận thông báo của chính mình (GET/PUT /api/v1/notifications/preferences): kênh đẩy theo nhóm, tắt riêng từng loại, giờ yên tĩnh,
// khóa VAPID để bật thông báo đẩy trên thiết bị này.
import useSWR from "swr";
import { api, swrFetcher } from "../api";
import type { NotificationPrefsDto } from "../types/notification-prefs";

export const NOTIFICATION_PREFS_KEY = "/api/v1/notifications/preferences";

export function useNotificationPrefs(enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<NotificationPrefsDto>(enabled ? NOTIFICATION_PREFS_KEY : null, swrFetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  });
  return { prefs: data, error, isLoading: isLoading && !data, mutate };
}

export const notificationPrefsApi = {
  setCategory: (category: string, enabled: boolean) => api.put<NotificationPrefsDto>(NOTIFICATION_PREFS_KEY, { category, enabled }),
  setType: (type: string, enabled: boolean) => api.put<NotificationPrefsDto>(NOTIFICATION_PREFS_KEY, { type, enabled }),
  setQuiet: (quiet: { start: string; end: string } | null) => api.put<NotificationPrefsDto>(NOTIFICATION_PREFS_KEY, { quiet }),
};
