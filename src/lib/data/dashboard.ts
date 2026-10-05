"use client";
// Dữ liệu trang Tổng quan: gom các endpoint "tóm tắt" của từng phân hệ. Endpoint nào người dùng không có quyền
// (403) hoặc lỗi thì trả undefined — thẻ tương ứng hiển thị trạng thái rỗng thay vì làm hỏng cả trang.
import useSWR from "swr";
import { swrFetcher } from "../api";

export interface FinanceSummary {
  fundBalanceVnd: number | null;
  funds: { code: string; name: string; balanceVnd: number }[] | null;
  month: { label: string; incomeVnd: number; expenseVnd: number } | null;
  last6Months: { label: string; incomeVnd: number; expenseVnd: number }[] | null;
  expenseByCategory: { name: string; color: string; amountVnd: number }[] | null;
  contributions: { periodLabel: string; paidCount: number; totalCount: number; collectedVnd: number; expectedVnd: number } | null;
  pendingApprovals: number | null;
}

export interface DutyItem {
  assignmentId: string;
  area: string;
  areaIcon?: string | null;
  shift: string;
  members: string[];
  status: string;
}
export interface DutySummary {
  today: DutyItem[];
  tomorrow: DutyItem[];
  myNext: { assignmentId: string; date: string; area: string; shift: string } | null;
  openIssuesCount: number;
  pendingReviewsCount: number;
}

export interface UpcomingEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  location?: string | null;
  category?: string | null;
  categoryColor?: string | null;
  hasCheckIn?: boolean;
  myRsvp?: string | null;
}

export interface AnnouncementBrief {
  id: string;
  title: string;
  preview?: string;
  category?: string;
  categoryColor?: string;
  isPinned?: boolean;
  isUnread?: boolean;
  author?: string;
  authorRole?: string;
  createdAt: string;
}

export interface UnreadCount {
  announcementsUnread: number;
  notificationsUnread: number;
}

const opts = { shouldRetryOnError: false, revalidateOnFocus: true, dedupingInterval: 20_000 };

export function useFinanceSummary(enabled = true) {
  return useSWR<FinanceSummary>(enabled ? "/api/v1/finance/summary" : null, swrFetcher, opts).data;
}
export function useDutySummary(enabled = true) {
  return useSWR<DutySummary>(enabled ? "/api/v1/duty/summary" : null, swrFetcher, opts).data;
}
export function useUpcomingEvents(limit = 5, enabled = true) {
  return useSWR<UpcomingEvent[]>(enabled ? `/api/v1/events/upcoming?limit=${limit}` : null, swrFetcher, opts).data;
}
export function useLatestAnnouncements(limit = 5, enabled = true) {
  return useSWR<AnnouncementBrief[]>(enabled ? `/api/v1/announcements?limit=${limit}` : null, swrFetcher, opts).data;
}
export function useUnreadCount(enabled = true) {
  return useSWR<UnreadCount>(enabled ? "/api/v1/notifications/unread-count" : null, swrFetcher, { ...opts, refreshInterval: 60_000 }).data;
}
