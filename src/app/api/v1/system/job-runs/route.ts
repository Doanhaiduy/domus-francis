import { api } from "@/server/http";
import { badRequest } from "@/server/errors";
import { JobRunsQuery, listJobRuns } from "@/server/modules/system-status";

export const runtime = "nodejs";

/**
 * Lịch sử lượt chạy tác vụ nền (job_runs) kèm từng bước — CHỈ Admin (system.monitor).
 *   ?kind=all|cron|manual|backup|<loại cụ thể>  ?limit=1..100 (mặc định 30)
 */
export const GET = api({}, async (ctx) => {
  const parsed = JobRunsQuery.safeParse(Object.fromEntries(ctx.query));
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Bộ lọc không hợp lệ.");
  return ctx.db((tx) => listJobRuns(tx, parsed.data));
});
