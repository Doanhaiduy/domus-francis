import { api } from "@/server/http";
import { badRequest } from "@/server/errors";
import { ReportQuerySchema, buildActivityReport } from "@/server/modules/activity-report";

/** Báo cáo hoạt động quý/năm (số liệu tổng hợp). GET ?kind=quarter&year=2026&quarter=3 hoặc ?kind=year&year=2026. Quyền: report.read. */
export const GET = api({}, (ctx) => {
  const q = ReportQuerySchema.safeParse(Object.fromEntries(ctx.query.entries()));
  if (!q.success) throw badRequest("Kỳ báo cáo không hợp lệ.");
  if (q.data.kind === "quarter" && !q.data.quarter) throw badRequest("Chọn quý (1–4).");
  return ctx.db((tx) => buildActivityReport(tx, q.data.kind, q.data.year, q.data.quarter));
});
