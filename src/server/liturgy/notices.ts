import "server-only";
import { withTx } from "../db";
import { liturgicalDay, WEEKDAY_LABEL } from "@/lib/liturgy/engine";
import { loadLiturgyConf, requirementFor, upcomingFrom } from "../modules/liturgy-calendar";

// ---------------------------------------------------------------------
// Nhắc lễ (job nền, luuxa_worker): lễ trọng / Tết / lễ Bổn mạng / ngày đặc biệt của nhà
//   • trước N ngày (cấu hình liturgy.notify_days_before, mặc định 7 — một lần) và hôm trước (liturgy.notify_day_before)
//   • tối ngày lễ bắt buộc (liturgy.checkin_reminder_time): nhắc riêng người chưa check-in đi lễ
// Chỉ gửi từ 07:00 (giờ VN); app.fn_liturgy_notice ghi nhật ký nên chạy lại nhiều lần không gửi trùng.
// ---------------------------------------------------------------------
const vnNow = () => new Date(Date.now() + 7 * 3600e3);
const dm = (iso: string) => `${+iso.slice(8)}/${+iso.slice(5, 7)}`;

export async function runLiturgyNotices(): Promise<number> {
  const now = vnNow();
  const hm = now.toISOString().slice(11, 16);
  if (hm < "07:00") return 0;
  return withTx({ requestId: crypto.randomUUID() }, "luuxa_worker", async (tx) => {
    const conf = await loadLiturgyConf(tx);
    const s = (
      await tx.query(
        `SELECT app.setting_json('liturgy.notify_days_before') AS before, app.setting_json('liturgy.notify_day_before') AS day_before,
                app.setting_json('liturgy.checkin_reminder_time') AS remind_at`
      )
    ).rows[0];
    const before = typeof s.before === "number" ? s.before : 7;
    const dayBefore = s.day_before !== false;
    const remindAt = typeof s.remind_at === "string" ? s.remind_at : "19:00";
    let sent = 0;
    const send = async (day: string, occasion: string, kind: string, title: string, body: string, onlyMissing = false) => {
      const n = (
        await tx.query<{ n: number }>("SELECT app.fn_liturgy_notice($1, $2, $3, $4, $5, $6::jsonb, $7) AS n", [
          day,
          occasion,
          kind,
          title.slice(0, 200),
          body,
          JSON.stringify({ href: `/lich-su-kien?date=${day}`, date: day }),
          onlyMissing,
        ])
      ).rows[0].n;
      sent += n;
    };

    for (const u of upcomingFrom(conf, Math.max(before, 1))) {
      // Ngày đặc biệt tắt "nhắc trước" thì bỏ qua
      if (u.kind === "special" && !u.notify) continue;
      const occasion = u.kind === "special" ? `special:${u.specialId}` : u.kind;
      const when = `${WEEKDAY_LABEL[new Date(`${u.date}T00:00:00Z`).getUTCDay()]} ${dm(u.date)}`;
      const tail = u.requiresCheckin ? " Anh em nhớ tham dự Thánh lễ và check-in trên ứng dụng." : "";
      // Báo trước: lần đầu job chạy trong khoảng [N ngày … 2 ngày] trước lễ (job tạm dừng vài hôm vẫn không bỏ sót)
      if (before > 1 && u.daysLeft <= before && u.daysLeft >= 2)
        await send(u.date, occasion, "week_before", `Còn ${u.daysLeft} ngày: ${u.title}`, `${u.title} vào ${when}.${tail}`);
      if (dayBefore && u.daysLeft === 1) await send(u.date, occasion, "day_before", `Ngày mai: ${u.title}`, `${u.title} — ${when}.${tail}`);
    }

    // Nhắc check-in tối ngày lễ bắt buộc
    const today = conf.today;
    const req = requirementFor(conf, liturgicalDay(today));
    if (req && hm >= remindAt) {
      const d = liturgicalDay(today);
      await send(
        today,
        "checkin",
        "checkin_reminder",
        `Bạn chưa check-in đi lễ hôm nay (${req.label})`,
        `${d.title}. ${req.evidenceRequired ? "Nhớ kèm ảnh minh chứng. " : ""}Hạn check-in: ${dm(req.deadline)}.`,
        true
      );
    }
    return sent;
  });
}
