import "server-only";
import { withTx, type DbRole, type Tx } from "../db";
import { dutyJobs, housekeeping, lectionaryJob } from "../jobs";
import { runLiturgyNotices } from "../liturgy/notices";
import { postToZaloGroup, type ZaloEventKey } from "../integrations/zalo";
import { buildGroupReminderText } from "../modules/finance-ops";
import { addDays, buildWeekText } from "@/lib/duty-format";

// =====================================================================
// Tác vụ hằng ngày do Vercel Cron gọi (gói miễn phí: mỗi tác vụ cron chạy tối đa 1 lần/ngày, lệch tới ~1 giờ):
//   • slot "morning" (07:00 giờ VN): dọn dẹp, nhắc lễ, nhắc quỹ, nhắc sự kiện hôm nay/ngày mai, lịch nhắc lặp buổi sáng,
//     đầu tuần đăng lịch trực.
//   • slot "evening" (19:00 giờ VN): nhắc check-in đi lễ, lịch nhắc lặp buổi tối.
// Mọi tin đều có khóa chống gửi trùng (system_post_log) nên chạy lại / cron bắn hai lần không gửi trùng.
// dry = true: chỉ liệt kê những tin SẼ gửi, không gửi và không ghi gì.
// =====================================================================

export type DailySlot = "morning" | "evening";

export interface DailyItem {
  key: string;
  event: string;
  text: string;
  status: "planned" | "sent" | "not_sent" | "duplicate";
  /** Có kèm thông báo trong ứng dụng cho cả nhà */
  inApp: boolean;
  reason?: string;
}

export interface DailyResult {
  slot: DailySlot;
  date: string;
  dry: boolean;
  items: DailyItem[];
  notes: string[];
}

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const WEEKDAY = ["", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chúa Nhật"];

export async function runDailyJobs(slot: DailySlot, opts: { dry?: boolean } = {}): Promise<DailyResult> {
  const dry = !!opts.dry;
  const requestId = crypto.randomUUID();
  const W = <T,>(fn: (tx: Tx) => Promise<T>, role: DbRole = "luuxa_worker") => withTx({ requestId }, role, fn);
  const ctxW = { dbAs: <T,>(role: DbRole, fn: (tx: Tx) => Promise<T>) => withTx({ requestId }, role, fn) };

  const when = (await W((tx) => tx.query<{ d: string; dow: number }>("SELECT app.local_today()::text AS d, extract(isodow FROM app.local_today())::int AS dow"))).rows[0];
  const today = when.d;
  const items: DailyItem[] = [];
  const notes: string[] = [];

  const once = async (key: string) =>
    (await W((tx) => tx.query("INSERT INTO system_post_log (key, kind) VALUES ($1, 'daily') ON CONFLICT (key) DO NOTHING RETURNING key", [key]))).rowCount === 1;

  /** Gửi một tin: (tùy chọn) thông báo trong ứng dụng cho cả nhà + đăng nhóm Zalo (theo công tắc loại tin). */
  const announce = async (
    key: string,
    event: ZaloEventKey,
    text: string,
    o: { app?: { title: string; body: string; link?: string; type?: string }; zalo?: boolean } = {},
  ) => {
    const item: DailyItem = { key, event, text, status: "planned", inApp: !!o.app };
    items.push(item);
    if (dry) return;
    if (!(await once(key))) {
      item.status = "duplicate";
      return;
    }
    if (o.app) {
      await W((tx) => tx.query("SELECT app.fn_system_notify_all($1, $2, $3, $4)", [o.app!.type ?? "system.reminder", o.app!.title, o.app!.body, o.app!.link ?? null])).catch((e) =>
        notes.push(`Thông báo trong ứng dụng lỗi (${key}): ${(e as Error).message}`),
      );
    }
    if (o.zalo === false) {
      item.status = "sent";
      return;
    }
    const r = await postToZaloGroup(ctxW, event, text);
    item.status = r.sent ? "sent" : "not_sent";
    if (!r.sent) item.reason = r.reason;
  };

  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      notes.push(`${name}: ${(e as Error).message}`);
      console.error(`[daily] ${name} lỗi:`, (e as Error).message);
    }
  };

  // 1. Dọn dẹp + tác vụ nền cũ (chỉ buổi sáng, không chạy khi xem trước)
  if (slot === "morning" && !dry) {
    await step("housekeeping", () => housekeeping());
    await step("duty", () => dutyJobs());
    await step("lectionary", () => lectionaryJob());
  }

  // 2. Nhắc lễ trọng / Bổn mạng / ngày đặc biệt (+ nhắc check-in đi lễ buổi tối). Có nhật ký riêng chống gửi trùng.
  if (!dry) {
    await step("liturgy", async () => {
      const lit = await runLiturgyNotices();
      for (const text of lit.posts) {
        const r = await postToZaloGroup(ctxW, "liturgy", text);
        items.push({ key: `liturgy:${today}`, event: "liturgy", text, status: r.sent ? "sent" : "not_sent", inApp: true, reason: r.reason });
      }
    });
  } else {
    notes.push("Nhắc lễ trọng không xem trước được (có nhật ký riêng); sẽ chạy thật khi cron chạy.");
  }

  if (slot === "morning") {
    // 3. Nhắc đóng quỹ: khoản sắp đến hạn / quá hạn
    await step("dues", async () => {
      const plans = (await W((tx) => tx.query<{ r: { planId: string; planName: string; soon: number; overdue: number }[] }>("SELECT app.fn_dues_auto_remind($1) AS r", [dry]))).rows[0].r;
      for (const p of plans) {
        const msg = p.overdue > 0 ? `⚠ ${p.overdue} khoản đã quá hạn${p.soon ? `, ${p.soon} khoản sắp đến hạn` : ""}.` : `⏳ ${p.soon} khoản sắp đến hạn nộp.`;
        const text = (await W((tx) => buildGroupReminderText(tx, p.planId, null, msg))).text;
        await announce(`dues:${p.planId}:${today}`, "dues_reminder", text);
      }
    });

    // 4. Sự kiện hôm nay / ngày mai (một tin gộp cho mỗi ngày)
    await step("events", async () => {
      const rows = (
        await W((tx) =>
          tx.query<{ title: string; hm: string; d: string; loc: string | null }>(
            `SELECT e.title, to_char(e.starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI') AS hm,
                    (e.starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS d,
                    COALESCE(NULLIF(btrim(e.location_text), ''), (SELECT r.name FROM rooms r WHERE r.id = e.location_room_id)) AS loc
               FROM events e
              WHERE e.deleted_at IS NULL AND e.status <> 'cancelled'
                AND (e.starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date IN ($1::date, $1::date + 1)
              ORDER BY e.starts_at`,
            [today],
          ),
        )
      ).rows;
      for (const [day, label] of [
        [today, "HÔM NAY"],
        [addDays(today, 1), "NGÀY MAI"],
      ] as const) {
        const list = rows.filter((r) => r.d === day);
        if (!list.length) continue;
        const lines = list.map((r) => `• ${r.hm} — ${r.title}${r.loc ? ` @ ${r.loc}` : ""}`);
        const wd = WEEKDAY[(new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7 + 1];
        const text = [`⏰ SỰ KIỆN ${label} (${wd} ${dm(day)})`, ...lines, "Anh em sắp xếp thời gian tham gia nhé. 🕊️"].join("\n");
        await announce(`evday:${day}:${label === "HÔM NAY" ? "today" : "tomorrow"}`, "event_reminder", text, {
          app: { type: "event.reminder", title: `${label === "HÔM NAY" ? "Hôm nay" : "Ngày mai"} có ${list.length} sự kiện`, body: lines.join("\n"), link: "/lich-su-kien" },
        });
      }
    });

    // 5. Đầu tuần: đăng lịch trực vệ sinh của tuần
    if (when.dow === 1) {
      await step("duty-week", async () => {
        const w = (
          await W((tx) =>
            tx.query<{ names: string[]; note: string | null }>(
              `SELECT COALESCE(array_agg(m.display_name ORDER BY m.display_name) FILTER (WHERE m.id IS NOT NULL), '{}') AS names, dw.note
                 FROM duty_weeks dw LEFT JOIN duty_week_members wm ON wm.week_id = dw.id LEFT JOIN members m ON m.id = wm.member_id
                WHERE dw.week_start = $1::date GROUP BY dw.id`,
              [today],
            ),
          )
        ).rows[0];
        if (!w || !w.names.length) return;
        const house = (await W((tx) => tx.query<{ v: string }>("SELECT value #>> '{}' AS v FROM settings WHERE key = 'org.house_name'"))).rows[0]?.v ?? null;
        const text = buildWeekText(
          { id: null, weekStart: today, weekEnd: addDays(today, 6), members: w.names.map((n) => ({ id: n, name: n, fullName: n, room: null, avatarFileId: null })), note: w.note, review: null, isMine: false },
          house,
        );
        await announce(`dutyweek:${today}`, "duty_week", text);
      });
    }
  }

  // 6. Lịch nhắc lặp hằng tuần do Trưởng nhà soạn
  await step("reminders", async () => {
    const rows = (
      await W((tx) =>
        tx.query<{ id: string; title: string; message: string | null; time_label: string | null; send_app: boolean; send_zalo: boolean }>(
          "SELECT id, title, message, time_label, send_app, send_zalo FROM recurring_reminders WHERE is_active AND slot = $1 AND $2::smallint = ANY (weekdays) ORDER BY created_at",
          [slot, when.dow],
        ),
      )
    ).rows;
    for (const r of rows) {
      const head = `📢 ${r.title}${r.time_label ? ` — ${r.time_label}` : ""} (${slot === "morning" ? "hôm nay" : "tối nay"})`;
      const text = r.message ? `${head}\n${r.message}` : head;
      await announce(`rem:${r.id}:${today}:${slot}`, "reminder_schedule", text, {
        zalo: r.send_zalo,
        app: r.send_app ? { title: head, body: r.message ?? "", link: "/lich-su-kien" } : undefined,
      });
    }
  });

  return { slot, date: today, dry, items, notes };
}
