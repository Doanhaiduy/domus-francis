import "server-only";
import webpush from "web-push";
import { withTx } from "./db";

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

/** Trang mở khi bấm thông báo, suy từ bảng nguồn của thông báo. */
export function urlForNotification(entityTable: string | null, typeCode: string): string {
  const t = entityTable ?? "";
  if (/announcement/.test(t)) return "/thong-bao";
  if (/leave/.test(t)) return "/xin-phep";
  if (/admission_inquir/.test(t)) return "/bai-viet";
  if (/event|poll|attendance/.test(t)) return "/lich-su-kien";
  if (/duty/.test(t)) return "/hau-can";
  if (/expense|contribution|ledger|fund|due/.test(t)) return "/thu-chi";
  if (/forum/.test(t)) return "/dien-dan";
  if (/maintenance|issue/.test(t)) return "/hau-can";
  if (/academic|grade/.test(t)) return "/hoc-tap";
  if (/meal|menu/.test(t)) return "/bep-com";
  if (/liturgy|prayer/.test(t)) return "/phung-vu";
  if (/application/.test(t)) return "/thanh-vien";
  if (typeCode.startsWith("finance.")) return "/thu-chi";
  return "/";
}

interface Row {
  id: string;
  attempts: number;
  type_code: string;
  title: string;
  body: string | null;
  entity_table: string | null;
  priority: string;
  user_id: string | null;
}

let running = false;
let lastRun = 0;

/** Gửi các thông báo đẩy đang chờ. An toàn khi gọi dồn dập (throttle 3 giây, một lượt chạy tại một thời điểm). Trả số thông báo đã xử lý. */
export async function dispatchPendingPush(): Promise<number> {
  if (running || Date.now() - lastRun < 3000 || !setup()) return 0;
  running = true;
  lastRun = Date.now();
  try {
    return await withTx({}, "luuxa_worker", async (tx) => {
      const rows = (
        await tx.query<Row>(
          `SELECT o.id, o.attempts, n.type_code, n.title, n.body, n.entity_table, n.priority::text AS priority, m.user_id
             FROM notification_outbox o
             JOIN notifications n ON n.id = o.notification_id
             JOIN members m ON m.id = n.member_id
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
        const payload = JSON.stringify({ title: r.title.slice(0, 120), body: (r.body ?? "").slice(0, 200), url: urlForNotification(r.entity_table, r.type_code), tag: r.id, urgent: r.priority === "urgent" });
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
