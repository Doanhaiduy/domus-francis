import "server-only";
import { dutyJobs, housekeeping, lectionaryJob } from "../../jobs";
import { runLiturgyNotices } from "../../liturgy/notices";
import { runStorageMonitor } from "../storage-monitor";
import { postToZaloGroup, renderZaloEvent } from "../../integrations/zalo";
import { buildGroupReminderVars } from "../../modules/finance-ops";
import { addDays, dutyWeekVars } from "@/lib/duty-format";
import { EVENTS_SQL, planEvents, type EventRow } from "../plan";
import { planLink } from "@/lib/types/finance";
import type { CronStep } from "../types";

// =====================================================================
// Các bước "lõi" của cron hằng ngày (trước đây viết liền trong daily.ts). Thứ tự chạy khai ở steps/index.ts:
// tin gửi cho người dùng chạy TRƯỚC, việc nặng (dọn dẹp, đo dung lượng) dồn về lượt tối để không chiếm hết 60 giây của hàm cron.
// =====================================================================

/** Nhắc lễ trọng / Bổn mạng / ngày đặc biệt (+ nhắc check-in đi lễ ở lượt tối). Có nhật ký riêng chống gửi trùng. */
export const liturgyStep: CronStep = {
  name: "liturgy",
  slots: ["morning", "evening"],
  skipDry: true,
  async run(c) {
    const lit = await runLiturgyNotices({ eveningSlot: c.slot === "evening" });
    if (lit.sent) c.note(`${lit.sent} thông báo nhắc lễ`);
    for (const post of lit.posts) {
      const text = await renderZaloEvent(c.ctxW, "liturgy", post);
      const r = await postToZaloGroup(c.ctxW, "liturgy", text);
      c.items.push({ key: `liturgy:${c.today}`, event: "liturgy", text, status: r.sent ? "sent" : "not_sent", inApp: true, reason: r.reason });
    }
  },
};

/** Nhắc đóng quỹ: khoản sắp đến hạn / quá hạn (tin nhóm). */
export const duesStep: CronStep = {
  name: "dues",
  slots: ["morning"],
  async run(c) {
    const plans = (await c.W((tx) => tx.query<{ r: { planId: string; planName: string; soon: number; overdue: number }[] }>("SELECT app.fn_dues_auto_remind($1) AS r", [c.dry]))).rows[0].r;
    for (const p of plans) {
      const msg = p.overdue > 0 ? `⚠ ${p.overdue} khoản đã quá hạn${p.soon ? `, ${p.soon} khoản sắp đến hạn` : ""}.` : `⏳ ${p.soon} khoản sắp đến hạn nộp.`;
      const { vars } = await c.W((tx) => buildGroupReminderVars(tx, p.planId, null, msg));
      await c.announce(`dues:${p.planId}:${c.today}`, "dues_reminder", { ...vars, link: vars.link ?? planLink(p.planId) });
    }
  },
};

/** Sự kiện hôm nay + ngày mai: MỘT tin gộp (sự kiện lặp hằng ngày không bị báo hai lần). */
export const eventsStep: CronStep = {
  name: "events",
  slots: ["morning"],
  async run(c) {
    const rows = (await c.W((tx) => tx.query<EventRow>(EVENTS_SQL, [c.today, addDays(c.today, 1)]))).rows;
    const plan = planEvents(rows, c.today);
    if (!plan) return;
    // Khóa kiểu cũ (mỗi ngày một tin; khóa ":tomorrow" mang NGÀY CỦA SỰ KIỆN) — hôm nay đã gửi theo cách cũ thì không gửi lại bản gộp
    const legacy = await c.W((tx) => tx.query("SELECT 1 FROM system_post_log WHERE key = ANY($1::text[])", [[`evday:${c.today}:today`, `evday:${addDays(c.today, 1)}:tomorrow`]]));
    if (!c.dry && legacy.rowCount) {
      c.items.push({ key: plan.key, event: "event_reminder", text: await renderZaloEvent(c.ctxW, "event_reminder", plan.vars), status: "duplicate", inApp: true });
      return;
    }
    await c.announce(plan.key, "event_reminder", { ...plan.vars, link: plan.vars.link ?? `/lich-su-kien?date=${c.today}` }, {
      app: { type: "event.reminder", title: plan.appTitle, body: plan.appBody, link: `/lich-su-kien?date=${c.today}` },
    });
  },
};

/** Sinh nhật thành viên hôm nay (ngày/tháng sinh trong hồ sơ; không nêu năm sinh hay tuổi). */
export const birthdayStep: CronStep = {
  name: "birthday",
  slots: ["morning"],
  async run(c) {
    const names = (
      await c.W((tx) =>
        tx.query<{ n: string }>(
          `SELECT m.display_name AS n
             FROM members m JOIN member_private_details d ON d.member_id = m.id
            WHERE m.deleted_at IS NULL AND m.status IN ('active', 'on_leave') AND d.birth_date IS NOT NULL
              AND extract(month FROM d.birth_date) = extract(month FROM $1::date) AND extract(day FROM d.birth_date) = extract(day FROM $1::date)
            ORDER BY m.display_name`,
          [c.today],
        ),
      )
    ).rows.map((r) => r.n);
    if (!names.length) return;
    const list = names.join(" & ");
    await c.announce(`birthday:${c.today}`, "birthday", { names: list, them: names.length > 1 ? "các bạn" : "bạn" }, {
      app: { title: `🎂 Hôm nay sinh nhật ${list}`, body: "Anh em gửi lời chúc mừng nhé!", link: "/thanh-vien" },
    });
  },
};

/** Đầu tuần (Thứ Hai): đăng lịch trực vệ sinh của tuần vào nhóm. */
export const dutyWeekStep: CronStep = {
  name: "duty-week",
  slots: ["morning"],
  async run(c) {
    if (c.dow !== 1) return;
    const w = (
      await c.W((tx) =>
        tx.query<{ names: string[]; note: string | null }>(
          `SELECT COALESCE(array_agg(m.display_name ORDER BY m.display_name) FILTER (WHERE m.id IS NOT NULL), '{}') AS names, dw.note
             FROM duty_weeks dw LEFT JOIN duty_week_members wm ON wm.week_id = dw.id LEFT JOIN members m ON m.id = wm.member_id
            WHERE dw.week_start = $1::date GROUP BY dw.id`,
          [c.today],
        ),
      )
    ).rows[0];
    if (!w || !w.names.length) return;
    const house = (await c.W((tx) => tx.query<{ v: string }>("SELECT value #>> '{}' AS v FROM settings WHERE key = 'org.house_name'"))).rows[0]?.v ?? null;
    const vars = dutyWeekVars(
      { id: null, weekStart: c.today, weekEnd: addDays(c.today, 6), members: w.names.map((n) => ({ id: n, name: n, fullName: n, room: null, avatarFileId: null })), note: w.note, review: null, isMine: false },
      house,
    );
    await c.announce(`dutyweek:${c.today}`, "duty_week", vars);
  },
};

/** Lịch nhắc lặp hằng tuần do Trưởng nhà soạn (Cài đặt → Nhắc lịch). */
export const remindersStep: CronStep = {
  name: "reminders",
  slots: ["morning", "evening"],
  async run(c) {
    const rows = (
      await c.W((tx) =>
        tx.query<{ id: string; title: string; message: string | null; time_label: string | null; send_app: boolean; send_zalo: boolean }>(
          "SELECT id, title, message, time_label, send_app, send_zalo FROM recurring_reminders WHERE is_active AND slot = $1 AND $2::smallint = ANY (weekdays) ORDER BY created_at",
          [c.slot, c.dow],
        ),
      )
    ).rows;
    for (const r of rows) {
      const head = `${r.title}${r.time_label ? ` — ${r.time_label}` : ""} (${c.slot === "morning" ? "hôm nay" : "tối nay"})`;
      await c.announce(`rem:${r.id}:${c.today}:${c.slot}`, "reminder_schedule", { headline: head, title: r.title, time: r.time_label ?? "", message: r.message ?? "" }, {
        zalo: r.send_zalo,
        app: r.send_app ? { title: head, body: r.message ?? "", link: "/lich-su-kien" } : undefined,
      });
    }
  },
};

/** Dọn dẹp (token/nhật ký hết hạn, tệp đã xóa quá hạn giữ…) — lượt tối. */
export const housekeepingStep: CronStep = {
  name: "housekeeping",
  slots: ["evening"],
  skipDry: true,
  timeoutMs: 20_000,
  async run(c) {
    for (const n of await housekeeping()) c.note(n);
  },
};

/** Job AI treo quá 5 phút ⇒ đánh dấu lỗi. */
export const aiJobsStep: CronStep = {
  name: "ai-jobs",
  slots: ["evening"],
  skipDry: true,
  async run() {
    await dutyJobs();
  },
};

/** Lời Chúa chưa nạp ⇒ thử nạp (GET dữ liệu mở). */
export const lectionaryStep: CronStep = {
  name: "lectionary",
  slots: ["evening"],
  skipDry: true,
  timeoutMs: 15_000,
  async run() {
    await lectionaryJob();
  },
};

/** Đo dung lượng (Supabase Storage + Cloudinary), ghi ảnh chụp hằng ngày, báo Admin khi chạm ngưỡng. */
export const storageMonitorStep: CronStep = {
  name: "storage-monitor",
  slots: ["evening"],
  skipDry: true,
  timeoutMs: 25_000,
  async run(c) {
    for (const n of await runStorageMonitor(c.today)) c.note(n);
  },
};
