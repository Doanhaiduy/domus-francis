import { api } from "@/server/http";

export const runtime = "nodejs";

/**
 * Kiểm tra sống/sẵn sàng cho bộ giám sát (UptimeRobot, Better Stack…): GET /api/health.
 * 200 khi DB trả lời; 503 khi DB lỗi. Không lộ thông tin nhạy cảm: chỉ môi trường, mã commit rút gọn và độ trễ DB.
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
  const body = {
    status: dbOk ? "ok" : "degraded",
    db: dbOk ? "ok" : "error",
    dbLatencyMs: Date.now() - t0,
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    time: new Date().toISOString(),
  };
  return new Response(JSON.stringify(body), { status: dbOk ? 200 : 503, headers: { "content-type": "application/json", "cache-control": "no-store" } });
});
