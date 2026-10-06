import "server-only";
import { z } from "zod";
import type { Ctx } from "../http";
import { badRequest, forbidden } from "../errors";
import { readZaloConfig, renderZaloEvent } from "./zalo";
import { loadPlanData, planDay } from "../cron/plan";
import { addDays } from "@/lib/duty-format";
import { ZALO_EVENT_LABEL, zaloEventOn, type ZaloEventKey } from "@/lib/types/settings";
import type { ZaloDayCounts, ZaloDayDto, ZaloLogEntryDto, ZaloMonthDto, ZaloPlannedDto } from "@/lib/types/zalo-log";

// Lịch & lịch sử tin gửi nhóm Zalo: đọc zalo_message_log (RLS: setting.write) + dự báo tin tự động các ngày sắp tới.

export const MonthQuery = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Tháng phải có dạng YYYY-MM.") });
export const DayQuery = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải có dạng YYYY-MM-DD.") });

const NOT_PROJECTED = ["Nhắc đóng quỹ (tùy ai còn nợ lúc đó)", "Nhắc lễ trọng / Bổn mạng (có nhật ký riêng)", "Tin do người dùng bấm gửi (sự kiện mới, báo hỏng, thông báo…)"];

async function guard(ctx: Ctx) {
  const ok = await ctx.db(async (tx) => (await tx.query<{ ok: boolean }>("SELECT app.has_permission('setting.write') AS ok")).rows[0]?.ok);
  if (!ok) throw forbidden("Chỉ Admin / Trưởng nhà mới xem được lịch tin Zalo.");
}

const today = async (ctx: Ctx) => (await ctx.dbAs("luuxa_worker", (tx) => tx.query<{ d: string }>("SELECT app.local_today()::text AS d"))).rows[0].d;

const lastDay = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

export async function zaloMonth(ctx: Ctx, month: string): Promise<ZaloMonthDto> {
  await guard(ctx);
  const from = `${month}-01`;
  const to = lastDay(month);
  const td = await today(ctx);
  const cfg = await readZaloConfig(ctx);
  const rows = (
    await ctx.db((tx) =>
      tx.query<{ d: string; status: "sent" | "failed" | "skipped"; n: number }>(
        `SELECT (sent_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS d, status, count(*)::int AS n
           FROM zalo_message_log WHERE (sent_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date GROUP BY 1, 2`,
        [from, to],
      ),
    )
  ).rows;
  const days: Record<string, ZaloDayCounts> = {};
  const get = (d: string) => (days[d] ??= { sent: 0, failed: 0, skipped: 0, planned: 0 });
  for (const r of rows) get(r.d)[r.status] = r.n;

  const start = addDays(td, 1) > from ? addDays(td, 1) : from;
  if (cfg.enabled && start <= to) {
    const data = await loadPlanData(start, to);
    for (let d = start; d <= to; d = addDays(d, 1)) {
      const n = planDay(data, d).filter((p) => zaloEventOn(cfg.events, p.event)).length;
      if (n) get(d).planned = n;
    }
  }
  return { month, today: td, enabled: cfg.enabled, days };
}

export async function zaloDay(ctx: Ctx, date: string): Promise<ZaloDayDto> {
  await guard(ctx);
  if (Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw badRequest("Ngày không hợp lệ.");
  const td = await today(ctx);
  const cfg = await readZaloConfig(ctx);
  const log = (
    await ctx.db((tx) =>
      tx.query(
        `SELECT l.id, l.sent_at, l.event, l.mode, l.status, l.error, l.body, m.display_name AS by_name
           FROM zalo_message_log l LEFT JOIN members m ON m.user_id = l.user_id AND m.deleted_at IS NULL
          WHERE (l.sent_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = $1::date
          ORDER BY l.sent_at DESC`,
        [date],
      ),
    )
  ).rows;
  const labelOf = (e: string | null) => (e === "test" ? "Tin thử" : e && e in ZALO_EVENT_LABEL ? ZALO_EVENT_LABEL[e as ZaloEventKey] : "Tin tự soạn");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries: ZaloLogEntryDto[] = log.map((r: any) => ({
    id: r.id,
    at: new Date(r.sent_at).toISOString(),
    event: r.event ?? null,
    eventLabel: labelOf(r.event),
    mode: r.mode,
    by: r.by_name ?? null,
    status: r.status,
    error: r.error ?? null,
    body: r.body,
  }));

  let planned: ZaloPlannedDto[] = [];
  if (date > td && cfg.enabled) {
    const data = await loadPlanData(date, date);
    const items = planDay(data, date).filter((p) => zaloEventOn(cfg.events, p.event));
    planned = await Promise.all(
      items.map(async (p) => ({
        slot: p.slot,
        event: p.event,
        eventLabel: ZALO_EVENT_LABEL[p.event as ZaloEventKey],
        text: `${await renderZaloEvent(ctx, p.event as ZaloEventKey, p.vars)}\n— 🤖 Tin tự động của hệ thống`,
      })),
    );
  }
  return { date, today: td, enabled: cfg.enabled, log: entries, planned, notProjected: date > td ? NOT_PROJECTED : [] };
}
