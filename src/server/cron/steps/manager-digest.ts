import "server-only";
import { withTx } from "../../db";
import { getInbox, inboxDigest } from "../../modules/inbox";
import { INBOX_PERMISSIONS } from "@/lib/types/inbox";
import type { CronStep } from "../types";

// Bước cron "manager-digest" — gói B — Hộp việc quản lý.
// Tin buổi sáng cho người quản lý: việc QUÁ HẠN (sự cố quá SLA, án phạt quá hạn, tuần trực chưa đánh giá, phiếu chi chờ duyệt lâu…).
//   • Người nhận: thành viên đang ở có tài khoản, giữ (trực tiếp hoặc được ủy quyền) vai trò có ít nhất một quyền của hộp việc (hoặc Admin).
//   • Mỗi người: dựng hộp việc ĐÚNG NHƯ người đó thấy (transaction luuxa_app gắn tài khoản của họ ⇒ cùng quyền + RLS với GET /api/v1/inbox),
//     chỉ gửi khi có việc quá hạn. MỘT thông báo system.manager_digest mỗi người mỗi ngày (khóa mgr-digest:<member>:<ngày> ở system_post_log,
//     ghi CÙNG transaction với thông báo ⇒ gửi lỗi thì lượt chạy sau thử lại). Liên kết: Tổng quan ("/").
//   • Xem trước (dry): chỉ đếm, không ghi gì.

const MAX_MANAGERS = 40;

const MANAGERS_SQL = `
  SELECT m.id AS member_id, m.user_id
    FROM members m
    JOIN users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.status IN ('active', 'locked')
   WHERE m.deleted_at IS NULL AND m.status = 'active'
     AND EXISTS (
       SELECT 1
         FROM (SELECT ur.role_id FROM user_roles ur
                WHERE ur.user_id = m.user_id AND ur.revoked_at IS NULL AND ur.valid_from <= now() AND (ur.valid_to IS NULL OR ur.valid_to > now())
               UNION ALL
               SELECT d.role_id FROM role_delegations d
                WHERE d.delegate_user_id = m.user_id AND d.revoked_at IS NULL AND d.starts_at <= now() AND d.ends_at > now()) g
         JOIN roles r ON r.id = g.role_id
        WHERE r.code = 'admin' OR EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_code = ANY ($1::text[])))
   ORDER BY m.id
   LIMIT ${MAX_MANAGERS}`;

export const managerDigestStep: CronStep = {
  name: "manager-digest",
  slots: ["morning"],
  timeoutMs: 20_000,
  async run(c) {
    const managers = (await c.W((tx) => tx.query<{ member_id: string; user_id: string }>(MANAGERS_SQL, [INBOX_PERMISSIONS]))).rows;
    if (!managers.length) return;
    let sent = 0;
    let planned = 0;
    let duplicate = 0;
    const failed: string[] = [];
    for (const m of managers) {
      try {
        const inbox = await withTx({ userId: m.user_id, requestId: c.requestId, readOnly: true }, "luuxa_app", (tx) => getInbox(tx));
        const d = inboxDigest(inbox);
        if (!d) continue;
        if (c.dry) {
          planned++;
          continue;
        }
        const key = `mgr-digest:${m.member_id}:${c.today}`;
        const first = await c.W(async (tx) => {
          const ins = await tx.query("INSERT INTO system_post_log (key, kind) VALUES ($1, 'daily') ON CONFLICT (key) DO NOTHING RETURNING key", [key]);
          if (ins.rowCount !== 1) return false;
          await tx.query("SELECT app.fn_notify($1, 'system.manager_digest', $2, $3, $4::jsonb)", [m.member_id, d.title, d.body, JSON.stringify({ link: "/" })]);
          return true;
        });
        if (first) sent++;
        else duplicate++;
      } catch (e) {
        failed.push((e as Error).message);
      }
    }
    if (c.dry) {
      if (planned) c.note(`Sẽ gửi tóm tắt việc quá hạn cho ${planned} người quản lý`);
    } else {
      if (sent) c.note(`Đã gửi tóm tắt việc quá hạn cho ${sent} người quản lý`);
      if (duplicate) c.note(`${duplicate} người đã nhận tóm tắt hôm nay`);
    }
    if (failed.length) {
      const msg = `${failed.length}/${managers.length} người lỗi: ${failed[0]}`;
      // Lỗi toàn bộ ⇒ bước lỗi (ghi job_runs + báo Admin); lỗi lẻ ⇒ chỉ ghi chú
      if (failed.length === managers.length) throw new Error(msg);
      c.note(msg);
    }
  },
};
