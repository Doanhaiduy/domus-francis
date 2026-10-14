import "server-only";
import { withTx, type DbRole, type Tx } from "../db";
import { postToZaloGroup, renderZaloEvent } from "../integrations/zalo";
import { finishJobRun, notifyAdminsOnce, recordErrorEvent, startJobRun, type JobStep } from "../ops";
import { CRON_STEPS } from "./steps";
import type { DailyItem, DailyResult, DailySlot, StepCtx } from "./types";

export type { DailyItem, DailyResult, DailySlot } from "./types";

// =====================================================================
// Tác vụ hằng ngày do Vercel Cron gọi (gói miễn phí: mỗi tác vụ cron chạy tối đa 1 lần/ngày, lệch tới ~1 giờ):
//   • slot "morning" (07:00–07:59 giờ VN): nhắc lễ, sự kiện, quỹ, sinh nhật, lịch trực, nhắc cơm, tin cho người quản lý…
//   • slot "evening" (19:00–19:59 giờ VN): nhắc check-in đi lễ, nhắc lặp buổi tối, dọn dẹp, đo dung lượng, kiểm sổ cái…
// Danh sách + thứ tự các bước: ./steps/index.ts. Mỗi bước có hạn giờ riêng; lỗi một bước không chặn bước sau.
// Mỗi lượt chạy ghi vào job_runs (Quản trị → Hệ thống); có bước lỗi ⇒ báo Admin (system.ops_alert, mỗi lượt/ngày một lần) và
// /api/cron/daily trả HTTP 500 (Vercel hiện lượt chạy lỗi).
// Mọi tin đều có khóa chống gửi trùng (system_post_log) nên chạy lại / cron bắn hai lần không gửi trùng; tin Zalo gửi LỖI thì chạy lại sẽ thử gửi lại.
// dry = true: chỉ liệt kê những tin SẼ gửi, không gửi và không ghi gì.
// =====================================================================

const DEFAULT_STEP_TIMEOUT_MS = 12_000;

class StepTimeout extends Error {}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: NodeJS.Timeout;
  return Promise.race([
    p.finally(() => clearTimeout(t)),
    new Promise<T>((_, reject) => {
      t = setTimeout(() => reject(new StepTimeout(`quá ${Math.round(ms / 1000)} giây`)), ms);
    }),
  ]);
}

export async function runDailyJobs(slot: DailySlot, opts: { dry?: boolean; kind?: string } = {}): Promise<DailyResult> {
  const dry = !!opts.dry;
  const requestId = crypto.randomUUID();
  const W = <T,>(fn: (tx: Tx) => Promise<T>, role: DbRole = "luuxa_worker") => withTx({ requestId }, role, fn);
  const ctxW = { dbAs: <T,>(role: DbRole, fn: (tx: Tx) => Promise<T>) => withTx({ requestId }, role, fn) };

  const when = (await W((tx) => tx.query<{ d: string; dow: number }>("SELECT app.local_today()::text AS d, extract(isodow FROM app.local_today())::int AS dow"))).rows[0];
  const today = when.d;
  const items: DailyItem[] = [];
  const notes: string[] = [];
  const steps: JobStep[] = [];
  const runId = dry ? null : await startJobRun(opts.kind ?? `cron:${slot}`, requestId);

  const once = async (key: string) =>
    (await W((tx) => tx.query("INSERT INTO system_post_log (key, kind) VALUES ($1, 'daily') ON CONFLICT (key) DO NOTHING RETURNING key", [key]))).rowCount === 1;
  const exists = async (key: string) => !!(await W((tx) => tx.query("SELECT 1 FROM system_post_log WHERE key = $1", [key]))).rowCount;

  /** Gửi một tin theo MẪU của loại tin: (tùy chọn) thông báo trong ứng dụng cho cả nhà + đăng nhóm Zalo (theo công tắc loại tin). */
  const announce: StepCtx["announce"] = async (key, event, vars, o = {}) => {
    const text = await renderZaloEvent(ctxW, event, vars);
    const item: DailyItem = { key, event, text, status: "planned", inApp: !!o.app };
    items.push(item);
    if (dry) return;
    if (!(await once(key))) {
      // Đã gửi trước đó. Riêng tin Zalo lần trước gửi LỖI (Zalo/mạng hỏng) ⇒ thử gửi lại, không gửi lại thông báo trong ứng dụng.
      if (o.zalo !== false && (await exists(`zalo-fail:${key}`)) && !(await exists(`zalo-ok:${key}`))) {
        const r = await postToZaloGroup(ctxW, event, text);
        if (r.sent) await once(`zalo-ok:${key}`);
        item.status = r.sent ? "sent" : "not_sent";
        item.reason = r.sent ? "gửi lại sau lần lỗi trước" : r.reason;
        return;
      }
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
    if (r.sent) await once(`zalo-ok:${key}`);
    else if (r.failed) {
      await once(`zalo-fail:${key}`);
      notes.push(`Gửi Zalo lỗi (${key}): ${r.reason ?? "không rõ"} — chạy lại lượt này để gửi lại.`);
    }
  };

  for (const s of CRON_STEPS) {
    if (!s.slots.includes(slot)) continue;
    if (dry && s.skipDry) continue;
    const info: string[] = [];
    const ctx: StepCtx = { slot, today, dow: when.dow, dry, requestId, W, ctxW, once, announce, note: (m) => info.push(m), items };
    const t0 = Date.now();
    try {
      await withTimeout(s.run(ctx), s.timeoutMs ?? DEFAULT_STEP_TIMEOUT_MS);
      steps.push({ name: s.name, ok: true, ms: Date.now() - t0, info: info.length ? info : undefined });
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      steps.push({ name: s.name, ok: false, ms: Date.now() - t0, error: msg, info: info.length ? info : undefined });
      notes.push(`${s.name}: ${msg}`);
      console.error(`[daily] ${s.name} lỗi:`, msg);
      if (!dry) await recordErrorEvent({ source: "cron", route: `cron:${slot}/${s.name}`, code: e instanceof StepTimeout ? "TIMEOUT" : "STEP_FAILED", message: msg, requestId });
    }
    for (const m of info) notes.push(`${s.name}: ${m}`);
  }

  const failed = steps.filter((s) => !s.ok);
  const ok = failed.length === 0;
  if (!dry) {
    await finishJobRun(runId, { ok, steps, summary: notes.length ? notes.join("\n") : null });
    if (!ok) {
      await notifyAdminsOnce(
        `ops-alert:cron:${slot}:${today}`,
        `Tác vụ nền buổi ${slot === "morning" ? "sáng" : "tối"} có ${failed.length} bước lỗi`,
        failed.map((f) => `• ${f.name}: ${f.error}`).join("\n").slice(0, 900),
        { link: "/quan-tri?tab=system" },
      );
    }
  }
  return { slot, date: today, dry, ok, items, notes, steps };
}
