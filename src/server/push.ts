import "server-only";
import webpush from "web-push";
import { withTx } from "./db";
import { notificationLink } from "@/lib/notification-link";

// Thông báo đẩy (Web Push / VAPID) qua hàng đợi notification_outbox của thiết kế:
//   app.fn_notify() → notifications (trong ứng dụng) + một dòng outbox cho mỗi kênh còn lại theo notification_types.default_channels,
//   tôn trọng notification_preferences (tắt kênh, giờ yên tĩnh ⇒ next_attempt_at lùi tới hết giờ yên tĩnh).
// dispatchPendingPush() lấy các dòng web_push đã đến hạn, gửi tới các thiết bị đã đăng ký của người nhận rồi ghi kết quả.
// Gọi sau mỗi request ghi (waitUntil, xem http.ts) và cuối tác vụ cron hằng ngày — không cần tiến trình nền riêng.

const BATCH = 40;
const MAX_ATTEMPTS = 5;

export const pushConfigured = () => !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY;
export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY ?? null;

let configured = false;
function setup() {
  if (configured) return true;
  if (!pushConfigured()) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  configured = true;
  return true;
}

/** Liên kết trong ứng dụng (payload.link) nếu hợp lệ: đường dẫn tương đối, không trỏ ra ngoài. */
export { safeLink } from "@/lib/notification-link";

/**
 * Trang mở khi bấm thông báo: liên kết lưu kèm thông báo (payload.link) nếu có, không thì suy theo LOẠI rồi theo bảng nguồn / nhóm
 * (cùng một quy tắc với hộp thư trong ứng dụng — src/lib/notification-link.ts).
 */
export function urlForNotification(entityTable: string | null, typeCode: string, payload?: Record<string, unknown> | null, category?: string | null): string {
  return notificationLink({ typeCode, entityTable, category, payload }) ?? "/";
}

interface Row {
  id: string;
  /** notifications.id — gửi kèm (nid) để bấm thông báo đánh dấu đúng thông báo đã đọc */
  nid: string;
  category: string | null;
  attempts: number;
  type_code: string;
  title: string;
  body: string | null;
  entity_table: string | null;
  priority: string;
  user_id: string | null;
  payload: Record<string, unknown> | null;
}

let running = false;
let lastRun = 0;

/**
 * Gửi MỘT lượt (tối đa 40) thông báo đẩy đang chờ. An toàn khi gọi dồn dập (throttle 3 giây, một lượt chạy tại một thời điểm);
 * `force` bỏ throttle (dùng khi gọi lặp để xả hết hàng đợi — xem dispatchOutbox ở outbox.ts). Trả số thông báo đã xử lý.
 */
export async function dispatchPendingPush(opts: { force?: boolean } = {}): Promise<number> {
  if (running || (!opts.force && Date.now() - lastRun < 3000) || !setup()) return 0;
  running = true;
  lastRun = Date.now();
  try {
    return await withTx({}, "luuxa_worker", async (tx) => {
      const rows = (
        await tx.query<Row>(
          `SELECT o.id, n.id AS nid, t.category, o.attempts, n.type_code, n.title, n.body, n.entity_table, n.priority::text AS priority, m.user_id, n.payload
             FROM notification_outbox o
             JOIN notifications n ON n.id = o.notification_id
             JOIN members m ON m.id = n.member_id
             LEFT JOIN notification_types t ON t.code = n.type_code
            WHERE o.channel = 'web_push' AND o.status = 'queued' AND o.next_attempt_at <= now()
              AND (n.expires_at IS NULL OR n.expires_at > now())
            ORDER BY o.created_at
            LIMIT ${BATCH}
            FOR UPDATE OF o SKIP LOCKED`
        )
      ).rows;
      for (const r of rows) {
        const subs = r.user_id
          ? (await tx.query<{ id: string; endpoint: string; p256dh: string; auth_secret: string }>("SELECT id, endpoint, p256dh, auth_secret FROM push_subscriptions WHERE user_id = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())", [r.user_id])).rows
          : [];
        if (!subs.length) {
          await tx.query("UPDATE notification_outbox SET status = 'skipped', last_error = 'Không có thiết bị đăng ký' WHERE id = $1", [r.id]);
          continue;
        }
        // url: trang mở khi bấm (đường dẫn tương đối); nid: id thông báo — service worker gắn ?n=<nid> để trang đánh dấu đã đọc (NotificationDeepLink)
        const payload = JSON.stringify({
          title: r.title.slice(0, 120),
          body: (r.body ?? "").slice(0, 200),
          url: urlForNotification(r.entity_table, r.type_code, r.payload, r.category),
          nid: r.nid,
          tag: r.nid,
          urgent: r.priority === "urgent",
        });
        let delivered = 0;
        let lastError: string | null = null;
        for (const s of subs) {
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_secret } }, payload, { TTL: 60 * 60 * 24, urgency: r.priority === "urgent" ? "high" : "normal" });
            delivered++;
            await tx.query("UPDATE push_subscriptions SET last_used_at = now() WHERE id = $1", [s.id]);
          } catch (e) {
            const code = (e as { statusCode?: number }).statusCode;
            lastError = `HTTP ${code ?? "?"}`;
            // 404/410: thiết bị đã hủy đăng ký ⇒ thu hồi
            if (code === 404 || code === 410) await tx.query("UPDATE push_subscriptions SET revoked_at = now() WHERE id = $1", [s.id]);
          }
        }
        if (delivered) await tx.query("UPDATE notification_outbox SET status = 'sent', sent_at = now(), attempts = attempts + 1, last_error = NULL WHERE id = $1", [r.id]);
        else if (r.attempts + 1 >= MAX_ATTEMPTS) await tx.query("UPDATE notification_outbox SET status = 'failed', attempts = attempts + 1, last_error = $2 WHERE id = $1", [r.id, lastError]);
        else await tx.query("UPDATE notification_outbox SET attempts = attempts + 1, last_error = $2, next_attempt_at = now() + make_interval(mins => $3) WHERE id = $1", [r.id, lastError, 2 ** (r.attempts + 1)]);
      }
      return rows.length;
    });
  } catch (e) {
    console.error("[push] dispatch lỗi:", (e as Error).message);
    return 0;
  } finally {
    running = false;
  }
}
