import { api } from "@/server/http";
import { massReport } from "@/server/modules/liturgy-calendar";

/** GET ?from&to (≤ 366 ngày) — báo cáo đi lễ của cả nhà: các ngày bắt buộc đã đến, từng anh em × từng ngày (đã xác nhận / chờ duyệt /
 *  vắng / còn hạn / ngoài thời gian ở nhà) và số lần vắng. Dùng cho bảng tổng hợp và tệp Excel. Quyền: liturgy.calendar.manage. */
export const GET = api({}, (ctx) => ctx.db((tx) => massReport(tx, { from: ctx.query.get("from"), to: ctx.query.get("to") })));
