import "server-only";
import type { Tx } from "../db";
import { badRequest, forbidden } from "../errors";
import { pushConfigured, vapidPublicKey } from "../push";

// Tùy chọn nhận thông báo của chính mình: bật/tắt kênh đẩy theo nhóm, giờ yên tĩnh, thiết bị đã đăng ký.

export const NOTIFICATION_CATEGORIES: { code: string; label: string; text: string }[] = [
  { code: "announcement", label: "Thông báo & bảng tin", text: "Thông báo của Ban điều hành" },
  { code: "event", label: "Lịch & sự kiện", text: "Sự kiện sắp tới, điểm danh, biểu quyết" },
  { code: "duty", label: "Trực nhật", text: "Lịch trực, đổi ca, nhắc việc" },
  { code: "finance", label: "Thu chi & quỹ", text: "Nhắc đóng quỹ, duyệt chi" },
  { code: "meal", label: "Bếp & cơm", text: "Thực đơn, chốt suất ăn" },
  { code: "academic", label: "Học tập", text: "Bảng điểm, phụ đạo" },
  { code: "facility", label: "Hậu cần", text: "Báo hỏng, sửa chữa" },
  { code: "social", label: "Diễn đàn & khoảnh khắc", text: "Bình luận, nhắc tên" },
  { code: "security", label: "Bảo mật", text: "Đăng nhập mới, đổi mật khẩu (luôn bật)" },
  { code: "system", label: "Hệ thống", text: "Thông tin chung từ hệ thống" },
];
const CODES = new Set(NOTIFICATION_CATEGORIES.map((c) => c.code));

export interface NotificationPrefsDto {
  categories: (typeof NOTIFICATION_CATEGORIES)[number][];
  /** category → bật kênh đẩy (mặc định true khi chưa có dòng) */
  push: Record<string, boolean>;
  quiet: { start: string; end: string } | null;
  devices: number;
  pushAvailable: boolean;
  vapidPublicKey: string | null;
}

const hm = (t: unknown) => (typeof t === "string" ? t.slice(0, 5) : null);

async function myMember(tx: Tx): Promise<string> {
  const id = (await tx.query<{ id: string | null }>("SELECT app.current_member_id() AS id")).rows[0].id;
  if (!id) throw forbidden("Chỉ thành viên đã được duyệt mới chỉnh được tùy chọn thông báo.");
  return id;
}

export async function getPrefs(tx: Tx): Promise<NotificationPrefsDto> {
  const me = await myMember(tx);
  const rows = (await tx.query<{ category: string; enabled: boolean; quiet_start: string | null; quiet_end: string | null }>("SELECT category, enabled, quiet_start::text, quiet_end::text FROM notification_preferences WHERE member_id = $1 AND channel = 'web_push'", [me])).rows;
  const push: Record<string, boolean> = Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c.code, true]));
  for (const r of rows) push[r.category] = r.enabled;
  const q = rows.find((r) => r.quiet_start && r.quiet_end);
  const devices = (await tx.query<{ n: number }>("SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id = app.current_user_id() AND revoked_at IS NULL")).rows[0].n;
  return { categories: NOTIFICATION_CATEGORIES, push, quiet: q ? { start: hm(q.quiet_start)!, end: hm(q.quiet_end)! } : null, devices, pushAvailable: pushConfigured(), vapidPublicKey: vapidPublicKey() };
}

export async function setPushEnabled(tx: Tx, category: string, enabled: boolean) {
  if (!CODES.has(category)) throw badRequest("Nhóm thông báo không hợp lệ.");
  const me = await myMember(tx);
  await tx.query(
    `INSERT INTO notification_preferences (member_id, category, channel, enabled) VALUES ($1, $2, 'web_push', $3)
     ON CONFLICT (member_id, category, channel) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()`,
    [me, category, enabled]
  );
}

/** Giờ yên tĩnh áp cho mọi nhóm của kênh đẩy; start = end = null để xóa. Thông báo bảo mật/bắt buộc vẫn gửi ngay (DB bỏ qua giờ yên tĩnh). */
export async function setQuiet(tx: Tx, start: string | null, end: string | null) {
  const me = await myMember(tx);
  if ((start === null) !== (end === null)) throw badRequest("Nhập đủ giờ bắt đầu và giờ kết thúc.");
  for (const c of NOTIFICATION_CATEGORIES) {
    await tx.query(
      `INSERT INTO notification_preferences (member_id, category, channel, quiet_start, quiet_end) VALUES ($1, $2, 'web_push', $3::time, $4::time)
       ON CONFLICT (member_id, category, channel) DO UPDATE SET quiet_start = EXCLUDED.quiet_start, quiet_end = EXCLUDED.quiet_end, updated_at = now()`,
      [me, c.code, start, end]
    );
  }
}

export async function saveSubscription(tx: Tx, b: { endpoint: string; p256dh: string; auth: string }, userAgent: string | null) {
  await tx.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth_secret, user_agent)
     VALUES (app.current_user_id(), $1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = app.current_user_id(), p256dh = EXCLUDED.p256dh, auth_secret = EXCLUDED.auth_secret, revoked_at = NULL, user_agent = EXCLUDED.user_agent`,
    [b.endpoint, b.p256dh, b.auth, userAgent?.slice(0, 300) ?? null]
  );
}

export async function removeSubscription(tx: Tx, endpoint: string) {
  await tx.query("UPDATE push_subscriptions SET revoked_at = now() WHERE endpoint = $1 AND user_id = app.current_user_id()", [endpoint]);
}
