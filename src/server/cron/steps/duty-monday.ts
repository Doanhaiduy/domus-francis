import "server-only";
import type { CronStep } from "../types";

// Bước cron "duty-monday" — gói C — Trực tuần.
// Sáng Thứ Hai: thông báo TRONG ỨNG DỤNG cho từng người trực vệ sinh của tuần này ("Tuần này bạn trực vệ sinh sân nhà… Bạn trực cùng …",
// liên kết /hau-can?tab=truc-nhat) — kể cả khi tắt nhóm Zalo (tin nhóm Zalo thứ Hai ở bước lõi "duty-week").
// Việc gửi + chống trùng nằm ở app.fn_duty_week_start_notify (db/app/1048): khóa system_post_log "duty-monday:<tuần>:<thành viên>" ghi CÙNG
// giao dịch với thông báo ⇒ chạy lại trong ngày / cron bắn hai lần không gửi trùng; lỗi giữa chừng thì lượt sau gửi lại.
// Xem trước (dry): chỉ đếm, không ghi gì.
export const dutyMondayStep: CronStep = {
  name: "duty-monday",
  slots: ["morning"],
  async run(c) {
    if (c.dow !== 1) return;
    if (c.dry) {
      const n = (
        await c.W((tx) =>
          tx.query<{ n: number }>(
            `SELECT count(*)::int AS n
               FROM duty_weeks w JOIN duty_week_members wm ON wm.week_id = w.id JOIN members m ON m.id = wm.member_id
              WHERE w.week_start = $1::date AND m.deleted_at IS NULL AND m.status IN ('active', 'on_leave')
                AND NOT EXISTS (SELECT 1 FROM system_post_log l WHERE l.key = 'duty-monday:' || $1::date::text || ':' || m.id::text)`,
            [c.today],
          ),
        )
      ).rows[0].n;
      if (n) c.note(`Sẽ nhắc ${n} người trực vệ sinh tuần này`);
      return;
    }
    const n = (await c.W((tx) => tx.query<{ n: number }>("SELECT app.fn_duty_week_start_notify($1::date) AS n", [c.today]))).rows[0].n;
    if (n) c.note(`Đã nhắc ${n} người trực vệ sinh tuần này`);
  },
};
