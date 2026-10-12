import { api } from "@/server/http";
import { badRequest } from "@/server/errors";
import { attendanceReport } from "@/server/modules/events-attendance";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/v1/events/attendance-report?from=YYYY-MM-DD&to=YYYY-MM-DD — bảng điểm danh thành viên × các sự kiện (bật điểm danh, đã diễn ra)
 * trong khoảng ngày, để xuất Excel. Quyền: event.attendance.read_all (mọi sự kiện) hoặc event.attendance.record / ban tổ chức (sự kiện mình
 * điểm danh được); không có quyền nào ⇒ 403.
 */
export const GET = api({}, (ctx) => {
  const from = ctx.query.get("from") ?? "";
  const to = ctx.query.get("to") ?? "";
  if (!DATE.test(from) || !DATE.test(to)) throw badRequest("Thiếu tham số from/to dạng YYYY-MM-DD.");
  return ctx.db((tx) => attendanceReport(tx, from, to));
});
