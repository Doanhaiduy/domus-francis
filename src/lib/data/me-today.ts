"use client";
// "Việc của tôi hôm nay" (GET /api/v1/me/today) — thẻ đầu trang Tổng quan + danh sách "Bắt đầu với Lưu Xá" dùng chung một lần tải.
import { useEffect } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { swrFetcher } from "../api";
import { useSession } from "../session";
import type { MyTodayDto } from "../types/me-today";

export const MY_TODAY_KEY = "/api/v1/me/today";
/** Sự kiện cửa sổ: chạy một lối tắt của thẻ "Việc của tôi hôm nay" khi đang ở Tổng quan (detail = "check-in-le" | "bao-com"). */
export const MY_TODAY_SHORTCUT_EVENT = "luuxa:viec";

/** Mở một lối tắt của thẻ: đang ở Tổng quan ⇒ phát sự kiện; trang khác ⇒ trả về đường dẫn "/?viec=…" để chuyển trang. */
export function myTodayShortcut(want: "check-in-le" | "bao-com"): string | null {
  if (typeof window !== "undefined" && window.location.pathname === "/") {
    window.dispatchEvent(new CustomEvent(MY_TODAY_SHORTCUT_EVENT, { detail: want }));
    return null;
  }
  return `/?viec=${want}`;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let listeners = 0;

/** Tải lại thẻ (gộp nhiều lần gọi liên tiếp) — sau khi điểm danh, báo cơm, check-in lễ, xác nhận luật nhà… */
export function refreshMyToday(delayMs = 500) {
  if (typeof window === "undefined") return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void globalMutate(MY_TODAY_KEY);
  }, delayMs);
}

const onWrite = () => refreshMyToday(700);

/**
 * Việc của tôi hôm nay. Tự làm mới mỗi 2 phút (dừng khi tab ẩn), khi quay lại tab và sau mỗi thao tác ghi thành công trong ứng dụng
 * (sự kiện `luuxa:api-write` do lib/api phát).
 */
export function useMyToday(enabled = true) {
  const { session } = useSession();
  const allowed = enabled && !!session?.member;
  const { data, error, isLoading, isValidating, mutate } = useSWR<MyTodayDto>(allowed ? MY_TODAY_KEY : null, swrFetcher, {
    refreshInterval: 120_000,
    revalidateOnFocus: true,
    dedupingInterval: 5_000,
    keepPreviousData: true,
    shouldRetryOnError: false,
  });

  useEffect(() => {
    if (!allowed) return;
    if (listeners++ === 0) window.addEventListener("luuxa:api-write", onWrite);
    return () => {
      if (--listeners === 0) window.removeEventListener("luuxa:api-write", onWrite);
    };
  }, [allowed]);

  return { today: allowed ? (data ?? null) : null, error, isLoading: allowed && isLoading && !data, isValidating, mutate };
}
