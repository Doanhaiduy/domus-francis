"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { api } from "@/lib/api";
import { refreshInbox } from "@/lib/data/inbox";

// Gói B: mở ứng dụng từ thông báo đẩy kèm ?n=<id thông báo> ⇒ đánh dấu thông báo đó đã đọc rồi gỡ tham số khỏi URL.
//   • Cửa sổ ứng dụng đang mở: service worker (public/sw.js) nhắn "luuxa:open-url" ⇒ chuyển trang bằng router (không tải lại cả trang).
//   • Chưa mở / cửa sổ không trả lời: service worker mở thẳng đường dẫn có ?n=… ⇒ xử lý khi trang tải xong (kể cả sau khi đăng nhập lại).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Thông báo đã đánh dấu trong phiên này (không gọi API hai lần khi effect chạy lại) */
const handled = new Set<string>();

/** Tách ?n=<id> khỏi một đường dẫn trong ứng dụng: trả về đường dẫn sạch + id (nếu hợp lệ). */
function splitNid(pathWithQuery: string): { path: string; nid: string | null } {
  const u = new URL(pathWithQuery, window.location.origin);
  const n = u.searchParams.get("n");
  if (n === null) return { path: u.pathname + u.search + u.hash, nid: null };
  u.searchParams.delete("n");
  return { path: u.pathname + u.search + u.hash, nid: UUID_RE.test(n) ? n : null };
}

export function NotificationDeepLink() {
  const router = useRouter();
  const pathname = usePathname();
  const { mutate } = useSWRConfig();

  // Đánh dấu đã đọc (lỗi — thông báo đã bị xóa, mạng… — thì bỏ qua) rồi làm mới số chưa đọc / hộp thư
  useEffect(() => {
    const markRead = (nid: string) => {
      if (handled.has(nid)) return;
      handled.add(nid);
      api
        .post(`/api/v1/notifications/${nid}/read`)
        .then(
          () => mutate((k) => typeof k === "string" && k.startsWith("/api/v1/notifications")),
          () => undefined
        )
        .finally(() => refreshInbox());
    };

    // 1) Trang vừa mở có ?n=… ⇒ gỡ tham số (giữ nguyên tham số khác như ?tab=) + đánh dấu đã đọc
    const { path, nid } = splitNid(window.location.pathname + window.location.search + window.location.hash);
    if (path !== window.location.pathname + window.location.search + window.location.hash) {
      window.history.replaceState(window.history.state, "", path);
    }
    if (nid) markRead(nid);

    // 2) Service worker nhờ cửa sổ này mở trang của thông báo
    const sw = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
    if (!sw) return;
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; url?: unknown } | null;
      if (!d || d.type !== "luuxa:open-url" || typeof d.url !== "string") return;
      if (!d.url.startsWith("/") || d.url.startsWith("//")) return;
      const target = splitNid(d.url);
      e.ports?.[0]?.postMessage({ ok: true });
      if (target.nid) markRead(target.nid);
      router.push(target.path);
    };
    sw.addEventListener("message", onMessage);
    sw.startMessages?.();
    return () => sw.removeEventListener("message", onMessage);
  }, [pathname, router, mutate]);

  return null;
}
