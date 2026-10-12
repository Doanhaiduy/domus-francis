import "server-only";
import type { CronStep } from "../types";
import { PRIVACY_MANAGERS_SQL } from "@/server/modules/data-requests";

// Bước cron "privacy-retention" (lượt tối) — Quyền riêng tư: hạn lưu dữ liệu của người đã rời nhà (khóa privacy.left_member_retention_days,
// 0 = tắt — mặc định). Khi đã bật:
//   1. Báo trước người quản lý (privacy.manage: Trưởng nhà, Admin) những hồ sơ trạng thái "rời nhà" sẽ tới hạn trong 30 ngày tới hoặc đã quá hạn
//      mà chưa được báo — ghi khóa system_post_log "privacy-retention-warn:<member_id>" (một lần cho mỗi hồ sơ). Muốn giữ hồ sơ để liên lạc thì
//      chuyển sang "Cựu thành viên" (alumni không tự ẩn danh).
//   2. app.fn_apply_member_retention(): ẩn danh hóa hồ sơ đã quá hạn VÀ đã được báo trước ≥ 7 ngày (tối đa 50 hồ sơ/lượt). Hàm KHÔNG đụng sổ quỹ,
//      phiếu thu/chi, khoản đóng; giữ bằng chứng đồng ý (đánh dấu rút). Báo người quản lý số hồ sơ vừa ẩn danh.
// Xem trước (ctx.dry): chỉ đếm, không ghi gì.

const WARN_DAYS = 30;
const GRACE_DAYS = 7;
const WARN_KEY = "privacy-retention-warn:";

const vnDate = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const addDays = (ymd: string, n: number) => {
  const t = new Date(`${ymd}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

export const privacyRetentionStep: CronStep = {
  name: "privacy-retention",
  slots: ["evening"],
  async run(ctx) {
    const days = await ctx.W(async (tx) => {
      const v = (await tx.query<{ v: unknown }>("SELECT value AS v FROM settings WHERE key = 'privacy.left_member_retention_days'")).rows[0]?.v;
      const n = typeof v === "number" ? Math.floor(v) : Number(v);
      return Number.isFinite(n) && n > 0 ? n : 0;
    });
    if (!days) {
      ctx.note("Hạn lưu dữ liệu người đã rời nhà: đang tắt (0 ngày) — không ẩn danh hồ sơ nào.");
      return;
    }

    // Hồ sơ sẽ tới hạn trong 30 ngày (hoặc đã quá hạn) mà chưa được báo trước
    const pending = await ctx.W(async (tx) =>
      (
        await tx.query<{ id: string; full_name: string; due_on: string }>(
          `SELECT m.id, m.full_name, (m.left_on + $1::int)::text AS due_on
             FROM members m
            WHERE m.status = 'left' AND m.full_name <> '[Đã ẩn danh]' AND m.left_on IS NOT NULL
              AND m.left_on + $1::int <= $2::date + $3::int
              AND NOT EXISTS (SELECT 1 FROM system_post_log l WHERE l.key = $4 || m.id::text)
            ORDER BY m.left_on, m.id
            LIMIT 200`,
          [days, ctx.today, WARN_DAYS, WARN_KEY],
        )
      ).rows,
    );

    if (ctx.dry) {
      const due = await ctx.W(async (tx) =>
        Number(
          (
            await tx.query<{ n: number }>(
              `SELECT count(*)::int AS n FROM members m
                WHERE m.status = 'left' AND m.full_name <> '[Đã ẩn danh]' AND m.left_on IS NOT NULL AND m.left_on < $2::date - $1::int
                  AND EXISTS (SELECT 1 FROM system_post_log l WHERE l.key = $3 || m.id::text AND l.created_at <= now() - make_interval(days => $4::int))`,
              [days, ctx.today, WARN_KEY, GRACE_DAYS],
            )
          ).rows[0]?.n ?? 0,
        ),
      );
      ctx.note(`Hạn lưu ${days} ngày: sẽ báo trước ${pending.length} hồ sơ, sẽ ẩn danh ${Math.min(due, 50)} hồ sơ (xem trước — chưa làm gì).`);
      return;
    }

    // 1. Báo trước (ghi khóa + một thông báo gộp cho người quản lý) — một giao dịch
    if (pending.length) {
      const warned = await ctx.W(async (tx) => {
        const ids = (
          await tx.query<{ key: string }>(
            `INSERT INTO system_post_log (key, kind) SELECT $1 || x, 'daily' FROM unnest($2::text[]) AS x
             ON CONFLICT (key) DO NOTHING RETURNING key`,
            [WARN_KEY, pending.map((p) => p.id)],
          )
        ).rows.map((r) => r.key.slice(WARN_KEY.length));
        const list = pending.filter((p) => ids.includes(p.id));
        if (!list.length) return 0;
        const earliest = list
          .map((p) => (p.due_on > addDays(ctx.today, GRACE_DAYS) ? p.due_on : addDays(ctx.today, GRACE_DAYS)))
          .sort()[0];
        const names = list.slice(0, 3).map((p) => p.full_name).join(", ") + (list.length > 3 ? ` và ${list.length - 3} người khác` : "");
        await tx.query(
          `SELECT app.fn_notify(x.id, 'system.privacy_retention', $1, $2, $3::jsonb) FROM (${PRIVACY_MANAGERS_SQL}) x`,
          [
            `${list.length} hồ sơ người đã rời nhà sắp được ẩn danh`,
            `${names}: hết thời hạn lưu dữ liệu ${days} ngày kể từ ngày rời nhà — hệ thống sẽ tự ẩn danh hóa từ ${vnDate(earliest)} (xóa thông tin cá nhân, giữ sổ quỹ). Muốn giữ hồ sơ để liên lạc thì chuyển người đó sang “Cựu thành viên”.`,
            JSON.stringify({ link: "/thanh-vien?tab=former" }),
          ],
        );
        return list.length;
      });
      if (warned) ctx.note(`Đã báo trước người quản lý ${warned} hồ sơ sắp tới hạn lưu (${days} ngày).`);
    }

    // 2. Ẩn danh hóa hồ sơ quá hạn đã được báo trước ≥ 7 ngày
    const n = await ctx.W(async (tx) => Number((await tx.query<{ n: number }>("SELECT app.fn_apply_member_retention() AS n")).rows[0]?.n ?? 0));
    if (n > 0) {
      await ctx.W((tx) =>
        tx.query(`SELECT app.fn_notify(x.id, 'system.privacy_retention', $1, $2, $3::jsonb) FROM (${PRIVACY_MANAGERS_SQL}) x`, [
          `Đã ẩn danh hóa ${n} hồ sơ người đã rời nhà`,
          `Theo thời hạn lưu dữ liệu ${days} ngày (Cài đặt → Cấu hình chung). Thông tin cá nhân đã được xóa, tài khoản bị khóa; sổ quỹ và chứng từ vẫn được giữ.`,
          JSON.stringify({ link: "/thanh-vien?tab=former" }),
        ]),
      );
      ctx.note(`Đã ẩn danh hóa ${n} hồ sơ người đã rời nhà quá ${days} ngày.`);
    } else {
      ctx.note(`Hạn lưu ${days} ngày: không có hồ sơ nào cần ẩn danh hôm nay.`);
    }
  },
};
