"use client";
import { useEffect } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { usePathname } from "next/navigation";
import { swrFetcher } from "../api";
import { useSession } from "../session";
import { INBOX_PERMISSIONS, type InboxDto, type InboxItem, type InboxKind } from "../types/inbox";

export const INBOX_KEY = "/api/v1/inbox";
/** Sự kiện cửa sổ: trang nào vừa xử lý xong một việc (duyệt đơn, xác nhận khoản…) thì phát để số việc cập nhật ngay. */
export const INBOX_REFRESH_EVENT = "luuxa:inbox-refresh";

// Làm mới gộp: nhiều thành phần cùng dùng hộp việc (thanh bên, tab con, thẻ Tổng quan, nút "Thêm") ⇒ chỉ gọi API MỘT lần cho mỗi lần đổi trang /
// mỗi đợt sự kiện (chờ 400 ms để gộp các thao tác liên tiếp).
let lastPath: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let listeners = 0;

/** Yêu cầu tải lại hộp việc (gộp nhiều lần gọi liên tiếp). Gọi được ở bất cứ đâu, kể cả ngoài React. */
export function refreshInbox(delayMs = 400) {
  if (typeof window === "undefined") return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void globalMutate(INBOX_KEY);
  }, delayMs);
}

const onRefreshEvent = () => refreshInbox();

/**
 * Hộp "Việc cần xử lý" của người quản lý (dùng chung cho thẻ ở Tổng quan, số trên thanh bên, nút "Thêm" ở điện thoại).
 * Chỉ gọi API khi người dùng có ít nhất một quyền xử lý (thành viên thường: không tốn yêu cầu nào, `inbox` = null).
 * Tự làm mới mỗi 60 giây (dừng khi tab ẩn), khi quay lại tab, khi chuyển trang và khi có sự kiện `luuxa:inbox-refresh` / `luuxa:api-write`.
 */
export function useInbox(enabled = true) {
  const { session, can } = useSession();
  const pathname = usePathname();
  const allowed = enabled && !!session?.member && can(INBOX_PERMISSIONS);
  const { data, error, isLoading, isValidating, mutate } = useSWR<InboxDto>(allowed ? INBOX_KEY : null, swrFetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
    dedupingInterval: 10_000,
    keepPreviousData: true,
  });

  // Đổi trang ⇒ làm mới một lần (vừa xử lý xong việc ở trang trước thì số trên thanh bên đúng ngay)
  useEffect(() => {
    if (!allowed) return;
    if (lastPath === null) {
      lastPath = pathname;
      return;
    }
    if (lastPath === pathname) return;
    lastPath = pathname;
    refreshInbox(800);
  }, [allowed, pathname]);

  // Sự kiện làm mới: một bộ nghe dùng chung cho mọi thành phần
  useEffect(() => {
    if (!allowed) return;
    if (listeners++ === 0) {
      window.addEventListener(INBOX_REFRESH_EVENT, onRefreshEvent);
      window.addEventListener("luuxa:api-write", onRefreshEvent);
    }
    return () => {
      if (--listeners === 0) {
        window.removeEventListener(INBOX_REFRESH_EVENT, onRefreshEvent);
        window.removeEventListener("luuxa:api-write", onRefreshEvent);
      }
    };
  }, [allowed]);

  const inbox = allowed ? (data ?? null) : null;
  const itemsOf = (kind: InboxKind | readonly InboxKind[]): InboxItem[] =>
    (inbox?.items ?? []).filter((i) => (typeof kind === "string" ? i.kind === kind : kind.includes(i.kind)));
  const countOf = (kind: InboxKind | readonly InboxKind[]) => itemsOf(kind).reduce((s, i) => s + i.count, 0);
  const urgentOf = (kind: InboxKind | readonly InboxKind[]) => itemsOf(kind).some((i) => i.urgent);
  return {
    inbox,
    total: inbox?.total ?? 0,
    /** Tổng số việc quá hạn */
    overdue: (inbox?.items ?? []).reduce((s, i) => s + (i.overdue ?? 0), 0),
    /** Người xem có quyền xử lý ít nhất một loại việc (đã biết chắc khi `inbox` có dữ liệu) */
    eligible: allowed && (inbox ? inbox.eligible : true),
    itemsOf,
    countOf,
    urgentOf,
    isLoading: allowed && isLoading && !data,
    isValidating,
    error,
    mutate,
  };
}
