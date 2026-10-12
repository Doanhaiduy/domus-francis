import { api } from "@/server/http";

export const runtime = "nodejs";

/** Quá số giờ này mà chưa có lượt cron sáng/tối chạy XONG không lỗi ⇒ coi như cron đã ngừng (Vercel chạy 1 lần/ngày, lệch tới 1 giờ). */
const CRON_STALE_HOURS = 30;
/** Repo sao lưu gửi nhịp tim sau mỗi lần sao lưu hằng ngày; quá số giờ này ⇒ sao lưu có vấn đề. */
const BACKUP_STALE_HOURS = 36;

/**
 * Kiểm tra sống/sẵn sàng cho bộ giám sát (UptimeRobot, Better Stack…).
 *   GET /api/health          200 khi DB trả lời; 503 khi DB lỗi.
 *   GET /api/health?deep=1   thêm: cron sáng/tối gần nhất chạy xong trong 30 giờ, nhịp tim sao lưu trong 36 giờ (nếu đã từng có) — 503 khi
 *                            một trong các mục quá hạn ⇒ đặt monitor THỨ HAI trỏ vào đây để biết khi cron/sao lưu ngừng mà không ai để ý.
 * Không lộ thông tin nhạy cảm: chỉ môi trường, mã commit rút gọn, độ trễ DB và tuổi (giờ) của các lượt chạy.
 */
export const GET = api({ auth: "public" }, async (ctx) => {
  const t0 = Date.now();
  let dbOk = false;
  try {
    await ctx.dbAs("luuxa_auth", (tx) => tx.query("SELECT 1"));
    dbOk = true;
  } catch {
    dbOk = false;
  }
  const body: Record<string, unknown> = {
    status: dbOk ? "ok" : "degraded",
    db: dbOk ? "ok" : "error",
    dbLatencyMs: Date.now() - t0,
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    time: new Date().toISOString(),
  };
  let ok = dbOk;

  if (dbOk && ctx.query.get("deep") === "1") {
    try {
      const rows = (
        await ctx.dbAs("luuxa_worker", (tx) =>
          tx.query<{ kind: string; last_ok_h: number | null; last_any_h: number | null }>(
            `SELECT kind,
                    extract(epoch FROM now() - max(started_at) FILTER (WHERE ok IS TRUE)) / 3600 AS last_ok_h,
                    extract(epoch FROM now() - max(started_at)) / 3600 AS last_any_h
               FROM job_runs WHERE kind IN ('cron:morning', 'cron:evening', 'backup') GROUP BY kind`,
          ),
        )
      ).rows;
      const age = (kind: string) => {
        const r = rows.find((x) => x.kind === kind);
        return r?.last_ok_h == null ? null : Math.round(Number(r.last_ok_h) * 10) / 10;
      };
      const checks: Record<string, { ageHours: number | null; ok: boolean | null }> = {};
      // Cron chỉ chạy trên Vercel; máy chủ tự chạy (local) dùng bộ hẹn giờ trong tiến trình ⇒ không xét
      for (const kind of ["cron:morning", "cron:evening"]) {
        const a = age(kind);
        checks[kind] = { ageHours: a, ok: process.env.VERCEL ? a !== null && a <= CRON_STALE_HOURS : null };
      }
      const b = age("backup");
      const everBackup = rows.some((x) => x.kind === "backup");
      checks.backup = { ageHours: b, ok: everBackup || process.env.OPS_REQUIRE_BACKUP_HEARTBEAT === "1" ? b !== null && b <= BACKUP_STALE_HOURS : null };
      body.checks = checks;
      if (Object.values(checks).some((c) => c.ok === false)) {
        ok = false;
        body.status = "stale";
      }
    } catch (e) {
      body.checks = { error: "không đọc được job_runs" };
      console.error("[health] deep lỗi:", (e as Error).message);
    }
  }
  return new Response(JSON.stringify(body), { status: ok ? 200 : 503, headers: { "content-type": "application/json", "cache-control": "no-store" } });
});
