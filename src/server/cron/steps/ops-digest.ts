import "server-only";
import { notifyAdminsOnce } from "../../ops";
import { JOB_CHECKS_SQL, errorSourceLabel, evalJob, onVercel, type JobCheckRow } from "../../modules/system-status";
import type { CronStep, StepCtx } from "../types";

// =====================================================================
// Bước cron "ops-digest" (buổi sáng) — gói A — Giám sát & vận hành. Mỗi việc chạy độc lập (một việc lỗi không chặn việc sau;
// cuối bước ném lỗi tổng hợp để lượt chạy ghi nhận). Xem trước (dry) chỉ ghi chú, KHÔNG ghi gì.
//   (a) Lỗi MỚI chưa báo (error_events: status new, notified_at NULL) ⇒ MỘT thông báo system.error_digest cho Admin mỗi ngày
//       (số lỗi + 3 lỗi nhiều lần nhất, mở Cài đặt → Hệ thống) rồi đánh dấu notified_at. Hôm nay đã gửi ⇒ để dành cho bản ngày mai.
//   (b) Giao dịch ngân hàng chưa khớp quá 7 ngày ⇒ nhắc Thủ quỹ + Trưởng nhà MỖI TUẦN một lần (finance.bank_unmatched, mở Thu chi).
//   (c) Sao lưu quá hạn (CSDL > 36 giờ / tệp > 8 ngày không có nhịp tim đạt — chỉ khi đã từng có) ⇒ system.ops_alert cho Admin
//       (CSDL: mỗi ngày một lần; tệp: mỗi tuần một lần). Lần sao lưu THẤT BẠI đã được báo ngay khi nhận nhịp tim.
//   (d) Trên Vercel: lượt cron buổi TỐI không chạy xong (hàm bị dừng ⇒ daily.ts không kịp báo) hoặc quá 30 giờ không đạt ⇒ báo Admin.
//   (e) Nhật ký kiểm toán rơi vào phân vùng mặc định (phân vùng tháng chưa được tạo) ⇒ báo Admin mỗi tuần một lần.
// =====================================================================

/** "2026-10-12" ⇒ "2026-W42" (tuần ISO — khóa nhắc mỗi tuần một lần). */
export function isoWeek(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Thứ Hai
  d.setUTCDate(d.getUTCDate() - dow + 3); // Thứ Năm của tuần này quyết định năm ISO
  const year = d.getUTCFullYear();
  const firstThu = new Date(Date.UTC(year, 0, 4));
  firstThu.setUTCDate(firstThu.getUTCDate() - ((firstThu.getUTCDay() + 6) % 7) + 3);
  const week = 1 + Math.round((d.getTime() - firstThu.getTime()) / (7 * 86_400_000));
  return `${year}-W${String(week).padStart(2, "0")}`;
}

const dmy = (v: Date | string) => new Date(v).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" });
const LINK = "/cai-dat?tab=system";

/** (a) Tóm tắt lỗi mới cho Admin. */
async function errorDigest(c: StepCtx) {
  const rows = (
    await c.W((tx) =>
      tx.query<{ id: string; source: string; route: string | null; message: string; count: number; total: number }>(
        `SELECT id, source, route, message, count, count(*) OVER ()::int AS total
           FROM error_events WHERE status = 'new' AND notified_at IS NULL
          ORDER BY count DESC, last_seen DESC LIMIT 200`,
      ),
    )
  ).rows;
  if (!rows.length) return;
  const total = rows[0].total;
  const top = rows.slice(0, 3).map((r) => `• [${errorSourceLabel(r.source)}]${r.route ? ` ${r.route}` : ""}: ${r.message.slice(0, 140)} (×${r.count})`);
  const title = `${total} lỗi hệ thống mới cần xem`;
  const body = [...top, total > 3 ? `… và ${total - 3} lỗi khác.` : "", "Xem và đánh dấu “Đã xem / Đã sửa” ở Cài đặt → Hệ thống."].filter(Boolean).join("\n");
  if (c.dry) {
    c.note(`(xem trước) sẽ gửi Admin tóm tắt ${total} lỗi mới`);
    return;
  }
  const sent = await notifyAdminsOnce(`error-digest:${c.today}`, title, body, { type: "system.error_digest", link: LINK });
  if (sent) {
    await c.W((tx) => tx.query("UPDATE error_events SET notified_at = now() WHERE id = ANY($1::uuid[])", [rows.map((r) => r.id)]));
    c.note(`đã gửi Admin tóm tắt ${total} lỗi mới`);
  } else {
    c.note(`hôm nay đã gửi tóm tắt lỗi — ${total} lỗi mới để dành cho bản ngày mai`);
  }
}

/** (b) Nhắc giao dịch ngân hàng chưa khớp quá 7 ngày. */
async function bankUnmatched(c: StepCtx) {
  const r = (
    await c.W((tx) =>
      tx.query<{ n: number; oldest: Date | null }>(
        "SELECT count(*)::int AS n, min(imported_at) AS oldest FROM bank_statement_lines WHERE match_status = 'unmatched' AND imported_at < now() - interval '7 days'",
      ),
    )
  ).rows[0];
  if (!r?.n) return;
  const title = `${r.n} giao dịch ngân hàng chưa khớp quá 7 ngày`;
  const body = `Có ${r.n} giao dịch ngân hàng (cũ nhất nhận ngày ${dmy(r.oldest!)}) chưa được xác nhận ghi thu hoặc đánh dấu bỏ qua. Mở Thu chi → Tổng quan → “Giao dịch ngân hàng” để xử lý.`;
  if (c.dry) {
    c.note(`(xem trước) sẽ nhắc Thủ quỹ + Trưởng nhà: ${r.n} giao dịch ngân hàng chưa khớp`);
    return;
  }
  const sent = await notifyAdminsOnce(`bank-unmatched:${isoWeek(c.today)}`, title, body, { type: "finance.bank_unmatched", roles: ["treasurer", "house_head"], link: "/thu-chi" });
  c.note(sent ? `đã nhắc Thủ quỹ + Trưởng nhà: ${r.n} giao dịch ngân hàng chưa khớp quá 7 ngày` : `tuần này đã nhắc giao dịch ngân hàng chưa khớp (${r.n})`);
}

/** (c) + (d) Sao lưu quá hạn; cron buổi tối không chạy xong / quá hạn (chỉ trên Vercel). */
async function jobsStale(c: StepCtx) {
  const kinds = onVercel() ? ["backup", "backup:storage", "cron:evening"] : ["backup", "backup:storage"];
  const rows = (await c.W((tx) => tx.query(JOB_CHECKS_SQL, [kinds]))).rows as JobCheckRow[];
  const week = isoWeek(c.today);
  for (const kind of kinds as ("backup" | "backup:storage" | "cron:evening")[]) {
    const chk = evalJob(kind, rows.find((x) => x.watched === kind));
    if (!chk.watched || chk.level !== "error") continue;
    const stale = chk.ageHours === null || chk.ageHours > chk.staleHours;
    const hung = !!chk.last?.hung;
    // Sao lưu: chỉ nhắc khi QUÁ HẠN (lần thất bại đã báo ngay lúc nhận nhịp tim). Cron tối: không chạy xong hoặc quá hạn
    // (lượt lỗi bình thường đã được daily.ts báo ngay cuối lượt).
    if (kind.startsWith("backup") ? !stale : !(stale || hung)) continue;
    const key = kind === "backup" ? `ops-alert:backup-stale:${c.today}` : kind === "backup:storage" ? `ops-alert:backup-storage-stale:${week}` : `ops-alert:cron-evening-stale:${c.today}`;
    const last = chk.lastOkAt ? `Lần đạt gần nhất: ${dmy(chk.lastOkAt)} (${Math.round(chk.ageHours ?? 0)} giờ trước).` : "Chưa có lần nào đạt.";
    const title =
      kind === "backup"
        ? "Sao lưu CSDL đã quá hạn"
        : kind === "backup:storage"
          ? "Sao lưu tệp (Storage) hằng tuần đã quá hạn"
          : hung
            ? "Tác vụ buổi tối không chạy xong"
            : "Tác vụ buổi tối đã ngừng chạy";
    const body =
      kind === "cron:evening"
        ? `${chk.status} ${last} Kiểm tra Vercel → Cron Jobs / Logs; xem chi tiết ở Cài đặt → Hệ thống.`
        : `${chk.status} ${last} Kiểm tra tab Actions của repo sao lưu (secret, lịch chạy, lỗi) — xem Cài đặt → Hệ thống.`;
    if (c.dry) {
      c.note(`(xem trước) sẽ báo Admin: ${title}`);
      continue;
    }
    const sent = await notifyAdminsOnce(key, title, body, { link: LINK });
    if (sent) c.note(`đã báo Admin: ${title}`);
  }
}

/** (e) Nhật ký kiểm toán rơi vào phân vùng mặc định. */
async function auditDefaultPartition(c: StepCtx) {
  const n = Number(
    (
      await c.W((tx) =>
        tx.query<{ n: number }>("SELECT COALESCE((SELECT n_live_tup FROM pg_stat_user_tables WHERE schemaname = 'public' AND relname = 'audit_logs_default'), 0)::bigint AS n"),
      )
    ).rows[0]?.n ?? 0,
  );
  if (n <= 0) return;
  const title = "Nhật ký kiểm toán đang rơi vào phân vùng mặc định";
  const body = `Có khoảng ${n.toLocaleString("vi-VN")} bản ghi nhật ký kiểm toán nằm ở audit_logs_default — phân vùng tháng chưa được tạo kịp (bước dọn dẹp buổi tối gọi app.ensure_monthly_partitions). Dữ liệu không mất nhưng cần chuyển sang phân vùng tháng (xem VAN_HANH.md).`;
  if (c.dry) {
    c.note(`(xem trước) sẽ báo Admin: ${n} bản ghi audit ở phân vùng mặc định`);
    return;
  }
  if (await notifyAdminsOnce(`ops-alert:audit-default:${isoWeek(c.today)}`, title, body, { link: LINK })) c.note(`đã báo Admin: ${n} bản ghi audit ở phân vùng mặc định`);
}

export const opsDigestStep: CronStep = {
  name: "ops-digest",
  slots: ["morning"],
  async run(c) {
    const failed: string[] = [];
    for (const [name, fn] of [
      ["tóm tắt lỗi", errorDigest],
      ["ngân hàng chưa khớp", bankUnmatched],
      ["sao lưu / cron quá hạn", jobsStale],
      ["phân vùng audit", auditDefaultPartition],
    ] as const) {
      try {
        await fn(c);
      } catch (e) {
        failed.push(`${name}: ${(e as Error)?.message ?? e}`);
      }
    }
    if (failed.length) throw new Error(failed.join("; "));
  },
};
