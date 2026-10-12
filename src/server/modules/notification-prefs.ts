import "server-only";
import { batch, type Tx } from "../db";
import { ApiError, badRequest, forbidden } from "../errors";
import { pushConfigured, vapidPublicKey } from "../push";
import { NOTIFICATION_CATEGORIES, type NotificationPrefsDto, type NotificationTypePrefDto } from "@/lib/types/notification-prefs";

// Tùy chọn nhận thông báo của chính mình: bật/tắt kênh đẩy theo nhóm, giờ yên tĩnh, thiết bị đã đăng ký, và TẮT RIÊNG từng loại thông báo
// (bảng notification_type_mutes — db/app/1052: app.fn_notify không tạo thông báo loại đã tắt cho người này; loại bắt buộc không tắt được).

export { NOTIFICATION_CATEGORIES };
export type { NotificationPrefsDto };
const CODES = new Set(NOTIFICATION_CATEGORIES.map((c) => c.code));

const hm = (t: unknown) => (typeof t === "string" ? t.slice(0, 5) : null);

async function myMember(tx: Tx): Promise<string> {
  const id = (await tx.query<{ id: string | null }>("SELECT app.current_member_id() AS id")).rows[0].id;
  if (!id) throw forbidden("Chỉ thành viên đã được duyệt mới chỉnh được tùy chọn thông báo.");
  return id;
}

/** Mọi tùy chọn của người xem — MỘT vòng mạng. */
export async function getPrefs(tx: Tx): Promise<NotificationPrefsDto> {
  const [meR, prefR, devR, typeR] = await batch(tx, [
    ["SELECT app.current_member_id() AS id"],
    ["SELECT category, enabled, quiet_start::text, quiet_end::text FROM notification_preferences WHERE member_id = app.current_member_id() AND channel = 'web_push'"],
    ["SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id = app.current_user_id() AND revoked_at IS NULL"],
    [
      `SELECT t.code, t.category, t.name_vi, t.is_mandatory,
              EXISTS (SELECT 1 FROM notification_type_mutes x WHERE x.member_id = app.current_member_id() AND x.type_code = t.code) AS muted,
              (SELECT count(*)::int FROM notifications n
                WHERE n.member_id = app.current_member_id() AND n.type_code = t.code AND n.created_at > now() - interval '90 days') AS received
         FROM notification_types t
        WHERE t.is_active
        ORDER BY t.category, t.name_vi`,
    ],
  ]);
  if (!meR.rows[0]?.id) throw forbidden("Chỉ thành viên đã được duyệt mới chỉnh được tùy chọn thông báo.");
  const rows = prefR.rows as { category: string; enabled: boolean; quiet_start: string | null; quiet_end: string | null }[];
  const push: Record<string, boolean> = Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c.code, true]));
  for (const r of rows) push[r.category] = r.enabled;
  const q = rows.find((r) => r.quiet_start && r.quiet_end);
  const types: NotificationTypePrefDto[] = (typeR.rows as { code: string; category: string; name_vi: string; is_mandatory: boolean; muted: boolean; received: number }[]).map((t) => ({
    code: t.code,
    category: t.category,
    name: t.name_vi,
    mandatory: t.is_mandatory,
    muted: t.muted && !t.is_mandatory,
    received90: t.received,
  }));
  return {
    categories: NOTIFICATION_CATEGORIES,
    push,
    quiet: q ? { start: hm(q.quiet_start)!, end: hm(q.quiet_end)! } : null,
    devices: (devR.rows[0] as { n: number }).n,
    pushAvailable: pushConfigured(),
    vapidPublicKey: vapidPublicKey(),
    types,
  };
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

/**
 * Bật / tắt RIÊNG một loại thông báo (cả trong ứng dụng lẫn đẩy về điện thoại). Loại bắt buộc ⇒ 422.
 * `enabled = false` ⇒ thêm dòng notification_type_mutes; `true` ⇒ xóa dòng (nhận lại như mặc định).
 */
export async function setTypeEnabled(tx: Tx, typeCode: string, enabled: boolean) {
  const t = (
    await tx.query<{ me: string | null; is_mandatory: boolean | null; is_active: boolean | null }>(
      `SELECT app.current_member_id() AS me, t.is_mandatory, t.is_active
         FROM (SELECT 1) one LEFT JOIN notification_types t ON t.code = $1`,
      [typeCode]
    )
  ).rows[0];
  if (!t?.me) throw forbidden("Chỉ thành viên đã được duyệt mới chỉnh được tùy chọn thông báo.");
  if (t.is_mandatory === null) throw badRequest("Loại thông báo không hợp lệ.");
  if (!enabled && t.is_mandatory) throw new ApiError(422, "MANDATORY_NOTIFICATION", "Loại thông báo bắt buộc (bảo mật, thông báo quan trọng, kết quả đơn) không tắt được.");
  if (enabled) {
    await tx.query("DELETE FROM notification_type_mutes WHERE member_id = $1 AND type_code = $2", [t.me, typeCode]);
  } else {
    await tx.query("INSERT INTO notification_type_mutes (member_id, type_code) VALUES ($1, $2) ON CONFLICT (member_id, type_code) DO NOTHING", [t.me, typeCode]);
  }
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
