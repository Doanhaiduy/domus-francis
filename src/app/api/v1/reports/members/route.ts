import { api } from "@/server/http";
import { badRequest } from "@/server/errors";
import { MemberReportQuerySchema, buildMemberReport } from "@/server/modules/member-report";

/**
 * Tổng kết theo THÁNG / QUÝ / NĂM: mỗi thành viên (vắng/xin phép/trực nhật/điểm thi đua/vi phạm/quỹ/ủng hộ/GPA) + số liệu cả nhà.
 * ?kind=month|quarter|year &year= &month= &quarter= &scope=all|me
 *  - scope=all cần report.read; mỗi mục chỉ hiện nếu người xem có quyền xem mục đó (điểm học tập: chỉ người đã đồng ý chia sẻ).
 *  - scope=me: tổng kết của CHÍNH MÌNH (mọi thành viên).
 */
export const GET = api({}, (ctx) => {
  const parsed = MemberReportQuerySchema.safeParse(Object.fromEntries(ctx.query));
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Tham số không hợp lệ.");
  const v = parsed.data;
  if (v.kind === "month" && !v.month) throw badRequest("Thiếu tháng.");
  if (v.kind === "quarter" && !v.quarter) throw badRequest("Thiếu quý.");
  return ctx.db((tx) => buildMemberReport(tx, v));
});
