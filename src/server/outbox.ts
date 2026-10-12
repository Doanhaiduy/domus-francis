import "server-only";
import { withTx } from "./db";
import { dispatchPendingPush, pushConfigured } from "./push";
import { emailButton, emailConfigured, emailLayout, sendEmail } from "./email";
import { siteOrigin } from "./public";
import { notificationLink } from "@/lib/notification-link";

// =====================================================================
// Hàng đợi gửi thông báo ra ngoài ứng dụng (notification_outbox của thiết kế): app.fn_notify() ghi một dòng cho mỗi kênh
// ngoài in_app theo notification_types.default_channels + tùy chọn của người nhận.
//   • web_push — push.ts (VAPID)
//   • email    — dưới đây (Resend). Chưa cấu hình email ⇒ đánh dấu 'skipped' (trước đây các dòng email nằm 'queued' mãi mãi).
// dispatchOutbox(): gọi sau mỗi thao tác ghi (waitUntil) và cuối mỗi lượt cron — lặp tới khi HẾT việc hoặc hết ngân sách thời gian.
// =====================================================================

export const outboxConfigured = () => true;

const EMAIL_BATCH = 20;
const EMAIL_MAX_ATTEMPTS = 5;
let emailRunning = false;

interface EmailRow {
  id: string;
  attempts: number;
  type_code: string;
  entity_table: string | null;
  category: string | null;
  title: string;
  body: string | null;
  payload: Record<string, unknown> | null;
  email: string | null;
}

/** Gửi một lượt email đang chờ. Trả số dòng đã xử lý (0 = hết việc). */
export async function dispatchPendingEmail(): Promise<number> {
  if (emailRunning) return 0;
  emailRunning = true;
  try {
    return await withTx({}, "luuxa_worker", async (tx) => {
      const rows = (
        await tx.query<EmailRow>(
          `SELECT o.id, o.attempts, n.type_code, n.entity_table, t.category::text AS category, n.title, n.body, n.payload, u.email::text AS email
             FROM notification_outbox o
             JOIN notifications n ON n.id = o.notification_id
             LEFT JOIN notification_types t ON t.code = n.type_code
             JOIN members m ON m.id = n.member_id
             LEFT JOIN users u ON u.id = m.user_id AND u.deleted_at IS NULL
            WHERE o.channel = 'email' AND o.status = 'queued' AND o.next_attempt_at <= now()
              AND (n.expires_at IS NULL OR n.expires_at > now())
            ORDER BY o.created_at
            LIMIT ${EMAIL_BATCH}
            FOR UPDATE OF o SKIP LOCKED`,
        )
      ).rows;
      if (!rows.length) return 0;
      if (!emailConfigured()) {
        await tx.query("UPDATE notification_outbox SET status = 'skipped', last_error = 'Chưa cấu hình gửi email (RESEND_API_KEY / EMAIL_FROM)' WHERE id = ANY($1::uuid[])", [rows.map((r) => r.id)]);
        return rows.length;
      }
      const origin = siteOrigin();
      for (const r of rows) {
        if (!r.email) {
          await tx.query("UPDATE notification_outbox SET status = 'skipped', last_error = 'Người nhận chưa có email đăng nhập' WHERE id = $1", [r.id]);
          continue;
        }
        const link = `${origin}${notificationLink({ typeCode: r.type_code, entityTable: r.entity_table, category: r.category, payload: r.payload }) ?? "/thong-bao"}`;
        const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
        const res = await sendEmail({
          to: r.email,
          subject: r.title.slice(0, 150),
          html: emailLayout(r.title, `${r.body ? `<p>${esc(r.body).replace(/\n/g, "<br>")}</p>` : ""}${emailButton(link, "Mở ứng dụng")}<p style="font-size:12px;color:#6b7280">Tắt email loại này ở Cài đặt → Thông báo.</p>`),
          text: `${r.title}\n\n${r.body ?? ""}\n\n${link}\n\n(Tắt email loại này ở Cài đặt → Thông báo.)`,
        });
        if (res.ok) await tx.query("UPDATE notification_outbox SET status = 'sent', sent_at = now(), attempts = attempts + 1, last_error = NULL WHERE id = $1", [r.id]);
        else if (r.attempts + 1 >= EMAIL_MAX_ATTEMPTS) await tx.query("UPDATE notification_outbox SET status = 'failed', attempts = attempts + 1, last_error = $2 WHERE id = $1", [r.id, res.error ?? "lỗi"]);
        else await tx.query("UPDATE notification_outbox SET attempts = attempts + 1, last_error = $2, next_attempt_at = now() + make_interval(mins => $3) WHERE id = $1", [r.id, res.error ?? "lỗi", 2 ** (r.attempts + 1)]);
      }
      return rows.length;
    });
  } catch (e) {
    console.error("[email] dispatch lỗi:", (e as Error).message);
    return 0;
  } finally {
    emailRunning = false;
  }
}

/**
 * Gửi hết hàng đợi (đẩy + email) trong ngân sách thời gian `budgetMs` (mặc định 20 giây — hàm serverless tối đa 60 giây).
 * Trả số dòng đã xử lý theo từng kênh.
 */
export async function dispatchOutbox(budgetMs = 20_000): Promise<{ push: number; email: number }> {
  const t0 = Date.now();
  let push = 0;
  let email = 0;
  for (let round = 0; round < 25 && Date.now() - t0 < budgetMs; round++) {
    const p = pushConfigured() ? await dispatchPendingPush({ force: true }) : 0;
    const m = await dispatchPendingEmail();
    push += p;
    email += m;
    if (!p && !m) break;
  }
  return { push, email };
}
