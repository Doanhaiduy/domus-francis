import "server-only";
import { SERIES_HORIZON_DAYS } from "@/lib/events-format";
import type { CronStep } from "../types";

// Bước cron "recurring-events" — gói D — Sự kiện định kỳ (lượt sáng, chạy TRƯỚC bước nhắc sự kiện "events" nên tin nhắc thấy buổi vừa sinh).
//   1) Sinh các buổi của mọi chuỗi định kỳ đang chạy cho 14 ngày tới (app.fn_event_series_generate ⇒ hàm thiết kế
//      app.fn_generate_recurring_events: bỏ ngày ngoại lệ, ON CONFLICT (chuỗi, ngày) DO NOTHING ⇒ chạy lại không tạo trùng) + chép ban tổ chức.
//   2) Tự CHỐT ĐIỂM DANH các sự kiện bật điểm danh đã kết thúc quá 12 giờ mà chưa chốt (app.fn_close_event_attendance với vai trò hệ thống:
//      người chưa điểm danh ⇒ vắng / vắng có phép nếu có đơn được duyệt, ghi điểm chuyên cần, sự kiện ⇒ hoàn tất). Chỉ xét sự kiện kết thúc
//      trong 30 ngày gần đây (không chốt hàng loạt dữ liệu cũ), tối đa 40 sự kiện mỗi lượt; mỗi sự kiện một giao dịch — lỗi một sự kiện
//      không chặn sự kiện khác (ghi vào ghi chú lượt chạy).
//   Xem trước (dry): chỉ đếm, không ghi gì.

const CLOSE_AFTER_HOURS = 12;
const CLOSE_LOOKBACK_DAYS = 30;
const CLOSE_MAX_PER_RUN = 40;

const DUE_SQL = `SELECT e.id, e.title, to_char(e.starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM') AS d
                   FROM events e
                  WHERE e.deleted_at IS NULL AND e.requires_attendance AND e.status IN ('scheduled', 'ongoing')
                    AND e.ends_at < now() - make_interval(hours => ${CLOSE_AFTER_HOURS})
                    AND e.ends_at >= now() - make_interval(days => ${CLOSE_LOOKBACK_DAYS})
                  ORDER BY e.ends_at
                  LIMIT ${CLOSE_MAX_PER_RUN}`;

export const recurringEventsStep: CronStep = {
  name: "recurring-events",
  slots: ["morning"],
  timeoutMs: 15_000,
  async run(c) {
    if (c.dry) {
      const pending = (
        await c.W((tx) =>
          tx.query<{ n: number }>(
            `SELECT count(*)::int AS n
               FROM event_recurrence_rules r
               CROSS JOIN LATERAL generate_series(GREATEST(r.starts_on, app.local_today()),
                                                  LEAST(COALESCE(r.until_date, app.local_today() + r.generate_horizon_days), app.local_today() + r.generate_horizon_days),
                                                  interval '1 day') AS g
              WHERE r.is_active
                AND app.fn_recurrence_matches(r, g::date)
                AND NOT EXISTS (SELECT 1 FROM events e WHERE e.recurrence_rule_id = r.id AND e.occurrence_date = g::date)
                AND NOT EXISTS (SELECT 1 FROM event_recurrence_exceptions x WHERE x.rule_id = r.id AND x.occurrence_date = g::date)`,
          ),
        )
      ).rows[0].n;
      const due = (await c.W((tx) => tx.query(DUE_SQL))).rows.length;
      c.note(`Xem trước: sẽ tạo ${pending} buổi sự kiện định kỳ (${SERIES_HORIZON_DAYS} ngày tới), sẽ tự chốt điểm danh ${due} sự kiện.`);
      return;
    }

    // 1) Sinh buổi của các chuỗi định kỳ
    const generated = (await c.W((tx) => tx.query<{ n: number }>("SELECT app.fn_event_series_generate(NULL, NULL) AS n"))).rows[0].n;
    if (generated) c.note(`Đã tạo ${generated} buổi sự kiện định kỳ (${SERIES_HORIZON_DAYS} ngày tới).`);

    // 2) Tự chốt điểm danh sự kiện đã kết thúc quá 12 giờ
    const due = (await c.W((tx) => tx.query<{ id: string; title: string; d: string }>(DUE_SQL))).rows;
    let closed = 0;
    let absent = 0;
    let excused = 0;
    const failed: string[] = [];
    for (const e of due) {
      try {
        const r = (
          await c.W((tx) =>
            tx.query<{ r: { absent_created: number; excused_created: number } }>("SELECT app.fn_close_event_attendance($1) AS r", [e.id]),
          )
        ).rows[0].r;
        closed++;
        absent += r.absent_created ?? 0;
        excused += r.excused_created ?? 0;
      } catch (err) {
        failed.push(`"${e.title}" (${e.d}): ${(err as Error).message}`);
      }
    }
    if (closed) c.note(`Đã tự chốt điểm danh ${closed} sự kiện kết thúc quá ${CLOSE_AFTER_HOURS} giờ (${absent} lượt vắng, ${excused} lượt vắng có phép).`);
    if (failed.length) c.note(`Không chốt được ${failed.length} sự kiện: ${failed.slice(0, 3).join("; ")}${failed.length > 3 ? "…" : ""}`);
  },
};
