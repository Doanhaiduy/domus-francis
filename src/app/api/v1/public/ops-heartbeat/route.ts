import { api } from "@/server/http";
import { rateLimit } from "@/server/ops";
import { HeartbeatBody, checkHeartbeatAuth, heartbeatErrors, recordHeartbeat } from "@/server/modules/system-status";

export const runtime = "nodejs";

/**
 * Nhịp tim từ repo sao lưu (GitHub Actions) sau MỖI lần chạy — kể cả khi lỗi:
 *   POST /api/v1/public/ops-heartbeat
 *   Authorization: Bearer <OPS_HEARTBEAT_SECRET>
 *   { "kind": "backup" | "backup:storage", "ok": true|false, "summary"?: "…" (≤ 500), "durationMs"?: tổng thời gian cả lượt,
 *     "steps"?: [{ name, ok, ms?, error? }] (≤ 20) }   — thời gian không đo được thì BỎ QUA trường (lịch sử hiện "—"), đừng gửi 0.
 * ⇒ ghi một dòng job_runs (Quản trị → Hệ thống; /api/health?deep=1 báo tuổi sao lưu). ok=false ⇒ báo Admin (mỗi ngày một lần).
 * Chưa đặt OPS_HEARTBEAT_SECRET ⇒ 404; sai khóa ⇒ 401 (so sánh hằng thời gian). Tối đa 60 lần/giờ (giới hạn lưu trong CSDL).
 */
export const POST = api({ auth: "public", csrf: false }, async (ctx) => {
  const auth = checkHeartbeatAuth(ctx.req.headers.get("authorization"));
  if (auth === "unset") throw heartbeatErrors.unset();
  if (auth === "bad") throw heartbeatErrors.bad();
  if (!(await rateLimit(null, "ops-heartbeat", 3600, 60))) throw heartbeatErrors.limited();
  const b = await ctx.body(HeartbeatBody);
  const r = await recordHeartbeat(ctx, b);
  return { ok: true, id: r.id };
});
