import "server-only";
import type { CronStep } from "../types";

// Bước cron "meal-reminder" — gói G — Bếp & Cơm (sáng, sau khi sự kiện/tin nhắc khác đã gửi).
//   1. Tự đăng ký ĂN hôm nay + ngày mai cho thành viên bật "Luôn ăn, trừ khi báo vắng" (trừ người có đơn vắng đã duyệt) — app.fn_meal_auto_register_day.
//   2. Nhắc những người đang ở CHƯA đăng ký bữa còn mở hôm nay (và không có đơn vắng): thông báo trong ứng dụng + đẩy, loại `meal.reminder`,
//      liên kết /bep-com — app.fn_meal_reminder_notify; chống trùng bằng khóa system_post_log "meal-reminder:<ngày>:<thành viên>" ghi cùng giao dịch.
// Chỉ làm khi phân hệ Bếp & Cơm bật (các hàm tự kiểm feature.meals.enabled). Xem trước (dry): chỉ đếm, KHÔNG ghi gì.
export const mealReminderStep: CronStep = {
  name: "meal-reminder",
  slots: ["morning"],
  async run(c) {
    const on = (await c.W((tx) => tx.query<{ on: boolean }>("SELECT app.setting_bool('feature.meals.enabled') AS on"))).rows[0]?.on;
    if (!on) return;

    if (c.dry) {
      const r = (
        await c.W((tx) =>
          tx.query<{ auto: number; remind: number }>(
            `SELECT (SELECT count(*)::int FROM meal_auto_eaters a JOIN members m ON m.id = a.member_id AND m.deleted_at IS NULL AND m.status = 'active') AS auto,
                    (SELECT count(DISTINCT m.id)::int
                       FROM members m
                       JOIN meal_menus mm ON mm.menu_date = $1::date AND mm.status = 'open' AND mm.cutoff_at > now()
                      WHERE m.deleted_at IS NULL AND m.status = 'active'
                        AND NOT EXISTS (SELECT 1 FROM meal_registrations r WHERE r.menu_id = mm.id AND r.member_id = m.id)
                        AND m.id NOT IN (SELECT x.member_id FROM app.fn_leave_absent_at(app.fn_meal_time($1::date, mm.meal_type)) x)
                        AND NOT EXISTS (SELECT 1 FROM meal_auto_eaters a WHERE a.member_id = m.id)
                        AND NOT EXISTS (SELECT 1 FROM system_post_log l WHERE l.key = 'meal-reminder:' || $1::date::text || ':' || m.id::text)) AS remind`,
            [c.today],
          ),
        )
      ).rows[0];
      if (r.auto) c.note(`Sẽ tự đăng ký ăn cho tối đa ${r.auto} người bật "Luôn ăn"`);
      if (r.remind) c.note(`Sẽ nhắc khoảng ${r.remind} người chưa đăng ký cơm hôm nay`);
      return;
    }

    const auto = (
      await c.W(async (tx) => {
        const a = (await tx.query<{ n: number }>("SELECT app.fn_meal_auto_register_day($1::date) AS n", [c.today])).rows[0].n;
        const b = (await tx.query<{ n: number }>("SELECT app.fn_meal_auto_register_day(($1::date + 1)) AS n", [c.today])).rows[0].n;
        return a + b;
      })
    );
    if (auto) c.note(`Đã tự đăng ký ${auto} suất ăn (hôm nay + ngày mai) cho người bật "Luôn ăn"`);
    const n = (await c.W((tx) => tx.query<{ n: number }>("SELECT app.fn_meal_reminder_notify($1::date) AS n", [c.today]))).rows[0].n;
    if (n) c.note(`Đã nhắc ${n} người chưa đăng ký cơm hôm nay`);
  },
};
